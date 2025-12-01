import { describe, it, expect } from 'vitest';
import { generateIssueBody, extractBeadsIdFromBody } from '../src/template';
import { BeadsIssue, MappingFile } from '../src/types';
import { createEmptyMapping, setMapping, createIssueMapping } from '../src/mapper';

describe('template', () => {
  const minimalIssue: BeadsIssue = {
    id: 'bd-abc123',
    title: 'Test issue',
    status: 'open',
    created_at: '2025-11-25T10:00:00Z',
    updated_at: '2025-11-25T10:00:00Z',
  };

  describe('generateIssueBody', () => {
    it('should include beads-sync marker comment', () => {
      const body = generateIssueBody(minimalIssue, createEmptyMapping());

      expect(body).toContain('<!-- beads-sync:bd-abc123 -->');
    });

    it('should include warning banner', () => {
      const body = generateIssueBody(minimalIssue, createEmptyMapping());

      expect(body).toContain('> [!CAUTION]');
      expect(body).toContain('synced from beads');
      expect(body).toContain('Do not edit directly');
    });

    it('should include description if present', () => {
      const issue: BeadsIssue = {
        ...minimalIssue,
        description: 'This is the issue description.',
      };

      const body = generateIssueBody(issue, createEmptyMapping());

      expect(body).toContain('This is the issue description.');
    });

    it('should include acceptance criteria as checklist', () => {
      const issue: BeadsIssue = {
        ...minimalIssue,
        acceptance_criteria: ['First criterion', 'Second criterion'],
      };

      const body = generateIssueBody(issue, createEmptyMapping());

      expect(body).toContain('Acceptance Criteria');
      expect(body).toContain('- [ ] First criterion');
      expect(body).toContain('- [ ] Second criterion');
    });

    it('should include design notes in collapsible section', () => {
      const issue: BeadsIssue = {
        ...minimalIssue,
        design: 'Design notes here',
      };

      const body = generateIssueBody(issue, createEmptyMapping());

      expect(body).toContain('<details>');
      expect(body).toContain('Design Notes');
      expect(body).toContain('Design notes here');
    });

    it('should include working notes in collapsible section', () => {
      const issue: BeadsIssue = {
        ...minimalIssue,
        notes: 'Working notes here',
      };

      const body = generateIssueBody(issue, createEmptyMapping());

      expect(body).toContain('<details>');
      expect(body).toContain('Working Notes');
      expect(body).toContain('Working notes here');
    });

    it('should include metadata table', () => {
      const issue: BeadsIssue = {
        ...minimalIssue,
        assignee: 'alice',
        estimated_time: '2h',
      };

      const body = generateIssueBody(issue, createEmptyMapping());

      expect(body).toContain('**Beads ID**');
      expect(body).toContain('`bd-abc123`');
      expect(body).toContain('**Assignee (beads)**');
      expect(body).toContain('alice');
      expect(body).toContain('**Estimated Time**');
      expect(body).toContain('2h');
    });

    it('should render dependencies with GitHub issue links when mapped', () => {
      const mapping = createEmptyMapping();
      setMapping(mapping, 'bd-dep1', createIssueMapping(42, 100, '2025-01-01T00:00:00Z'));

      const issue: BeadsIssue = {
        ...minimalIssue,
        dependencies: [
          { id: 'bd-dep1', type: 'blocks' },
          { id: 'bd-unmapped', type: 'relates-to' },
        ],
      };

      const body = generateIssueBody(issue, mapping);

      expect(body).toContain('**Dependencies**');
      expect(body).toContain('#42 (blocks)');
      expect(body).toContain('bd-unmapped (relates-to)');
    });

    it('should not include sections for missing optional fields', () => {
      const body = generateIssueBody(minimalIssue, createEmptyMapping());

      expect(body).not.toContain('Acceptance Criteria');
      expect(body).not.toContain('Design Notes');
      expect(body).not.toContain('Working Notes');
      expect(body).not.toContain('**Dependencies**');
    });

    it('should include external_ref if present and not self-referential', () => {
      const issue: BeadsIssue = {
        ...minimalIssue,
        external_ref: 'JIRA-123',
      };

      const body = generateIssueBody(issue, createEmptyMapping());

      expect(body).toContain('**External Ref**');
      expect(body).toContain('JIRA-123');
    });
  });

  describe('extractBeadsIdFromBody', () => {
    it('should extract beads ID from issue body', () => {
      const body = '<!-- beads-sync:bd-xyz789 -->\nSome content';

      expect(extractBeadsIdFromBody(body)).toBe('bd-xyz789');
    });

    it('should return null if no beads marker found', () => {
      const body = 'Just some regular issue content';

      expect(extractBeadsIdFromBody(body)).toBeNull();
    });

    it('should handle complex body with marker', () => {
      const body = `Some preamble
<!-- beads-sync:bd-complex123 -->
> [!CAUTION]
More content here`;

      expect(extractBeadsIdFromBody(body)).toBe('bd-complex123');
    });
  });
});
