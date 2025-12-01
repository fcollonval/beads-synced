import { describe, it, expect } from 'vitest';
import { parseBeadsFile, parseBeadsLine, validateBeadsIssue } from '../src/parser';
import { BeadsIssue } from '../src/types';

describe('parser', () => {
  describe('parseBeadsLine', () => {
    it('should parse a valid JSON line into a BeadsIssue', () => {
      const line = JSON.stringify({
        id: 'bd-a1b2',
        title: 'Test issue',
        status: 'open',
        created_at: '2025-11-25T10:00:00Z',
        updated_at: '2025-11-25T10:00:00Z',
      });

      const result = parseBeadsLine(line);

      expect(result).toEqual({
        id: 'bd-a1b2',
        title: 'Test issue',
        status: 'open',
        created_at: '2025-11-25T10:00:00Z',
        updated_at: '2025-11-25T10:00:00Z',
      });
    });

    it('should return null for empty lines', () => {
      expect(parseBeadsLine('')).toBeNull();
      expect(parseBeadsLine('   ')).toBeNull();
      expect(parseBeadsLine('\n')).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      expect(parseBeadsLine('not json')).toBeNull();
      expect(parseBeadsLine('{invalid}')).toBeNull();
    });

    it('should parse issue with all optional fields', () => {
      const fullIssue: BeadsIssue = {
        id: 'bd-full',
        title: 'Full issue',
        description: 'A description',
        design: 'Design notes',
        acceptance_criteria: ['Criterion 1', 'Criterion 2'],
        notes: 'Working notes',
        status: 'in_progress',
        priority: 1,
        issue_type: 'feature',
        assignee: 'alice',
        labels: ['frontend', 'urgent'],
        dependencies: [
          { id: 'bd-other', type: 'blocks' },
        ],
        external_ref: 'gh-42',
        comments: [
          {
            id: '1',
            author: 'bob',
            created_at: '2025-11-25T11:00:00Z',
            body: 'A comment',
          },
        ],
        created_at: '2025-11-25T10:00:00Z',
        updated_at: '2025-11-25T12:00:00Z',
        estimated_time: '2h',
      };

      const result = parseBeadsLine(JSON.stringify(fullIssue));

      expect(result).toEqual(fullIssue);
    });
  });

  describe('validateBeadsIssue', () => {
    it('should return true for valid minimal issue', () => {
      const issue: BeadsIssue = {
        id: 'bd-abc',
        title: 'Valid',
        status: 'open',
        created_at: '2025-11-25T10:00:00Z',
        updated_at: '2025-11-25T10:00:00Z',
      };

      expect(validateBeadsIssue(issue)).toBe(true);
    });

    it('should return false for missing id', () => {
      const issue = {
        title: 'No ID',
        status: 'open',
        created_at: '2025-11-25T10:00:00Z',
        updated_at: '2025-11-25T10:00:00Z',
      };

      expect(validateBeadsIssue(issue as BeadsIssue)).toBe(false);
    });

    it('should return false for missing title', () => {
      const issue = {
        id: 'bd-abc',
        status: 'open',
        created_at: '2025-11-25T10:00:00Z',
        updated_at: '2025-11-25T10:00:00Z',
      };

      expect(validateBeadsIssue(issue as BeadsIssue)).toBe(false);
    });

    it('should return false for invalid status', () => {
      const issue = {
        id: 'bd-abc',
        title: 'Bad status',
        status: 'invalid',
        created_at: '2025-11-25T10:00:00Z',
        updated_at: '2025-11-25T10:00:00Z',
      };

      expect(validateBeadsIssue(issue as BeadsIssue)).toBe(false);
    });

    it('should return false for missing created_at', () => {
      const issue = {
        id: 'bd-abc',
        title: 'No date',
        status: 'open',
        updated_at: '2025-11-25T10:00:00Z',
      };

      expect(validateBeadsIssue(issue as BeadsIssue)).toBe(false);
    });
  });

  describe('parseBeadsFile', () => {
    it('should parse multiple lines of JSONL', () => {
      const content = [
        JSON.stringify({ id: 'bd-1', title: 'First', status: 'open', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }),
        JSON.stringify({ id: 'bd-2', title: 'Second', status: 'closed', created_at: '2025-01-02T00:00:00Z', updated_at: '2025-01-02T00:00:00Z' }),
      ].join('\n');

      const result = parseBeadsFile(content);

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].id).toBe('bd-1');
      expect(result.issues[1].id).toBe('bd-2');
      expect(result.errors).toHaveLength(0);
    });

    it('should skip empty lines', () => {
      const content = [
        JSON.stringify({ id: 'bd-1', title: 'First', status: 'open', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }),
        '',
        '   ',
        JSON.stringify({ id: 'bd-2', title: 'Second', status: 'open', created_at: '2025-01-02T00:00:00Z', updated_at: '2025-01-02T00:00:00Z' }),
      ].join('\n');

      const result = parseBeadsFile(content);

      expect(result.issues).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect errors for invalid lines', () => {
      const content = [
        JSON.stringify({ id: 'bd-1', title: 'Valid', status: 'open', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }),
        'not json',
        JSON.stringify({ id: 'bd-2', status: 'open', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }), // missing title
      ].join('\n');

      const result = parseBeadsFile(content);

      expect(result.issues).toHaveLength(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].line).toBe(2);
      expect(result.errors[1].line).toBe(3);
    });

    it('should handle empty file', () => {
      const result = parseBeadsFile('');

      expect(result.issues).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
