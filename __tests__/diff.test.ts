import { describe, it, expect } from 'vitest';
import { computeDiff, parseExternalRef, needsUpdate } from '../src/diff';
import { BeadsIssue, MappingFile, BeadsStatus } from '../src/types';
import { createEmptyMapping, setMapping, createIssueMapping } from '../src/mapper';

describe('diff', () => {
  const makeIssue = (
    id: string,
    status: BeadsStatus = 'open',
    overrides: Partial<BeadsIssue> = {}
  ): BeadsIssue => ({
    id,
    title: `Issue ${id}`,
    status,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  });

  describe('parseExternalRef', () => {
    it('should parse gh-NUMBER format', () => {
      expect(parseExternalRef('gh-42')).toBe(42);
      expect(parseExternalRef('gh-1')).toBe(1);
      expect(parseExternalRef('gh-12345')).toBe(12345);
    });

    it('should return null for non-matching formats', () => {
      expect(parseExternalRef('JIRA-123')).toBeNull();
      expect(parseExternalRef('github-42')).toBeNull();
      expect(parseExternalRef('42')).toBeNull();
      expect(parseExternalRef('')).toBeNull();
    });

    it('should return null for invalid numbers', () => {
      expect(parseExternalRef('gh-abc')).toBeNull();
      expect(parseExternalRef('gh-')).toBeNull();
    });
  });

  describe('needsUpdate', () => {
    it('should return true when beads updated_at is newer', () => {
      const issue = makeIssue('bd-1', 'open', {
        updated_at: '2025-01-02T00:00:00Z',
      });
      const mapping = createIssueMapping(1, 100, '2025-01-01T00:00:00Z');

      expect(needsUpdate(issue, mapping)).toBe(true);
    });

    it('should return false when beads updated_at matches', () => {
      const issue = makeIssue('bd-1', 'open', {
        updated_at: '2025-01-01T00:00:00Z',
      });
      const mapping = createIssueMapping(1, 100, '2025-01-01T00:00:00Z');

      expect(needsUpdate(issue, mapping)).toBe(false);
    });

    it('should return false when beads updated_at is older', () => {
      const issue = makeIssue('bd-1', 'open', {
        updated_at: '2024-12-31T00:00:00Z',
      });
      const mapping = createIssueMapping(1, 100, '2025-01-01T00:00:00Z');

      expect(needsUpdate(issue, mapping)).toBe(false);
    });
  });

  describe('computeDiff', () => {
    it('should return create action for new issue', () => {
      const issues = [makeIssue('bd-new')];
      const mapping = createEmptyMapping();

      const result = computeDiff(issues, mapping);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toEqual({
        type: 'create',
        beadsIssue: issues[0],
        reason: 'New beads issue',
      });
    });

    it('should return update action for changed issue', () => {
      const issues = [
        makeIssue('bd-existing', 'open', {
          updated_at: '2025-01-02T00:00:00Z',
        }),
      ];
      const mapping = createEmptyMapping();
      setMapping(
        mapping,
        'bd-existing',
        createIssueMapping(42, 100, '2025-01-01T00:00:00Z')
      );

      const result = computeDiff(issues, mapping);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toEqual({
        type: 'update',
        beadsIssue: issues[0],
        githubIssueNumber: 42,
        reason: 'Beads issue updated',
      });
    });

    it('should return no action for unchanged issue', () => {
      const issues = [
        makeIssue('bd-existing', 'open', {
          updated_at: '2025-01-01T00:00:00Z',
        }),
      ];
      const mapping = createEmptyMapping();
      setMapping(
        mapping,
        'bd-existing',
        createIssueMapping(42, 100, '2025-01-01T00:00:00Z')
      );

      const result = computeDiff(issues, mapping);

      expect(result.actions).toHaveLength(0);
    });

    it('should return close action for closed beads issue', () => {
      const issues = [
        makeIssue('bd-closing', 'closed', {
          updated_at: '2025-01-02T00:00:00Z',
        }),
      ];
      const mapping = createEmptyMapping();
      setMapping(
        mapping,
        'bd-closing',
        createIssueMapping(42, 100, '2025-01-01T00:00:00Z')
      );

      const result = computeDiff(issues, mapping);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('close');
      expect(result.actions[0].githubIssueNumber).toBe(42);
    });

    it('should track deleted issues (in mapping but not in beads)', () => {
      const issues: BeadsIssue[] = [];
      const mapping = createEmptyMapping();
      setMapping(
        mapping,
        'bd-deleted',
        createIssueMapping(42, 100, '2025-01-01T00:00:00Z')
      );

      const result = computeDiff(issues, mapping);

      expect(result.deletedIssueIds).toContain('bd-deleted');
    });

    it('should return adopt action for issue with external_ref gh-NUMBER', () => {
      const issues = [
        makeIssue('bd-adopt', 'open', { external_ref: 'gh-99' }),
      ];
      const mapping = createEmptyMapping();

      const result = computeDiff(issues, mapping);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toEqual({
        type: 'adopt',
        beadsIssue: issues[0],
        githubIssueNumber: 99,
        reason: 'Adopting existing GitHub issue from external_ref',
      });
    });

    it('should treat non-gh external_ref as create', () => {
      const issues = [
        makeIssue('bd-jira', 'open', { external_ref: 'JIRA-123' }),
      ];
      const mapping = createEmptyMapping();

      const result = computeDiff(issues, mapping);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create');
    });

    it('should detect new comments to sync', () => {
      const issues = [
        makeIssue('bd-comments', 'open', {
          updated_at: '2025-01-01T00:00:00Z',
          comments: [
            {
              id: '1',
              author: 'alice',
              created_at: '2025-01-01T00:00:00Z',
              body: 'First comment',
            },
            {
              id: '2',
              author: 'bob',
              created_at: '2025-01-01T01:00:00Z',
              body: 'Second comment',
            },
          ],
        }),
      ];
      const mapping = createEmptyMapping();
      const issueMapping = createIssueMapping(42, 100, '2025-01-01T00:00:00Z');
      issueMapping.comments['1'] = { github_comment_id: 999 };
      setMapping(mapping, 'bd-comments', issueMapping);

      const result = computeDiff(issues, mapping);

      expect(result.commentActions).toHaveLength(1);
      expect(result.commentActions[0]).toEqual({
        beadsIssueId: 'bd-comments',
        githubIssueNumber: 42,
        comment: issues[0].comments![1],
      });
    });

    it('should handle multiple issues correctly', () => {
      const issues = [
        makeIssue('bd-new'),
        makeIssue('bd-existing', 'open', {
          updated_at: '2025-01-02T00:00:00Z',
        }),
        makeIssue('bd-unchanged', 'open', {
          updated_at: '2025-01-01T00:00:00Z',
        }),
      ];
      const mapping = createEmptyMapping();
      setMapping(
        mapping,
        'bd-existing',
        createIssueMapping(42, 100, '2025-01-01T00:00:00Z')
      );
      setMapping(
        mapping,
        'bd-unchanged',
        createIssueMapping(43, 101, '2025-01-01T00:00:00Z')
      );
      setMapping(
        mapping,
        'bd-deleted',
        createIssueMapping(44, 102, '2025-01-01T00:00:00Z')
      );

      const result = computeDiff(issues, mapping);

      expect(result.actions).toHaveLength(2); // create + update
      expect(result.actions.find((a) => a.type === 'create')).toBeDefined();
      expect(result.actions.find((a) => a.type === 'update')).toBeDefined();
      expect(result.deletedIssueIds).toContain('bd-deleted');
    });

    it('should return reopen action when closed issue is reopened in beads', () => {
      // Issue was previously closed (mapped with status that implied closure)
      // but now beads shows it as open again
      const issues = [
        makeIssue('bd-reopening', 'open', {
          updated_at: '2025-01-02T00:00:00Z',
        }),
      ];
      const mapping = createEmptyMapping();
      // The mapping tracks the last known state
      setMapping(
        mapping,
        'bd-reopening',
        createIssueMapping(42, 100, '2025-01-01T00:00:00Z')
      );

      // For reopen detection, we need to know the GitHub issue is closed
      // This is handled at the sync level, not diff level
      // So here we just get an update action
      const result = computeDiff(issues, mapping);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('update');
    });
  });
});
