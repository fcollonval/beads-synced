import { describe, it, expect } from 'vitest';
import {
  createEmptyMapping,
  getMapping,
  setMapping,
  removeMapping,
  getCommentMapping,
  setCommentMapping,
  serializeMapping,
  deserializeMapping,
  getMappedBeadsIds,
  buildMappingFromGitHubIssues,
} from '../src/mapper';
import { MappingFile, IssueMapping } from '../src/types';
import { GitHubIssue } from '../src/github';

describe('mapper', () => {
  describe('createEmptyMapping', () => {
    it('should create a valid empty mapping file structure', () => {
      const mapping = createEmptyMapping();

      expect(mapping.version).toBe(1);
      expect(mapping.mappings).toEqual({});
      expect(mapping.sync_metadata).toBeDefined();
      expect(mapping.sync_metadata.last_full_sync).toBeDefined();
    });
  });

  describe('getMapping / setMapping / removeMapping', () => {
    it('should return undefined for non-existent mapping', () => {
      const mapping = createEmptyMapping();

      expect(getMapping(mapping, 'bd-nonexistent')).toBeUndefined();
    });

    it('should set and get a mapping', () => {
      const mapping = createEmptyMapping();
      const issueMapping: IssueMapping = {
        github_issue_number: 42,
        github_issue_id: 123456,
        last_sync_at: '2025-11-25T10:00:00Z',
        beads_updated_at: '2025-11-25T10:00:00Z',
        adopted_from_external_ref: false,
        comments: {},
      };

      setMapping(mapping, 'bd-abc', issueMapping);

      expect(getMapping(mapping, 'bd-abc')).toEqual(issueMapping);
    });

    it('should remove a mapping', () => {
      const mapping = createEmptyMapping();
      const issueMapping: IssueMapping = {
        github_issue_number: 42,
        github_issue_id: 123456,
        last_sync_at: '2025-11-25T10:00:00Z',
        beads_updated_at: '2025-11-25T10:00:00Z',
        adopted_from_external_ref: false,
        comments: {},
      };

      setMapping(mapping, 'bd-abc', issueMapping);
      removeMapping(mapping, 'bd-abc');

      expect(getMapping(mapping, 'bd-abc')).toBeUndefined();
    });
  });

  describe('getCommentMapping / setCommentMapping', () => {
    it('should return undefined for non-existent comment mapping', () => {
      const mapping = createEmptyMapping();

      expect(getCommentMapping(mapping, 'bd-abc', '1')).toBeUndefined();
    });

    it('should return undefined if issue mapping does not exist', () => {
      const mapping = createEmptyMapping();

      expect(getCommentMapping(mapping, 'bd-nonexistent', '1')).toBeUndefined();
    });

    it('should set and get comment mapping', () => {
      const mapping = createEmptyMapping();
      const issueMapping: IssueMapping = {
        github_issue_number: 42,
        github_issue_id: 123456,
        last_sync_at: '2025-11-25T10:00:00Z',
        beads_updated_at: '2025-11-25T10:00:00Z',
        adopted_from_external_ref: false,
        comments: {},
      };

      setMapping(mapping, 'bd-abc', issueMapping);
      setCommentMapping(mapping, 'bd-abc', '1', 999888);

      expect(getCommentMapping(mapping, 'bd-abc', '1')).toBe(999888);
    });

    it('should not set comment mapping if issue mapping does not exist', () => {
      const mapping = createEmptyMapping();

      setCommentMapping(mapping, 'bd-nonexistent', '1', 999888);

      expect(getCommentMapping(mapping, 'bd-nonexistent', '1')).toBeUndefined();
    });
  });

  describe('serializeMapping / deserializeMapping', () => {
    it('should serialize to valid JSON', () => {
      const mapping = createEmptyMapping();
      setMapping(mapping, 'bd-abc', {
        github_issue_number: 42,
        github_issue_id: 123456,
        last_sync_at: '2025-11-25T10:00:00Z',
        beads_updated_at: '2025-11-25T10:00:00Z',
        adopted_from_external_ref: false,
        comments: {},
      });

      const serialized = serializeMapping(mapping);

      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('should deserialize back to equivalent object', () => {
      const mapping = createEmptyMapping();
      setMapping(mapping, 'bd-abc', {
        github_issue_number: 42,
        github_issue_id: 123456,
        last_sync_at: '2025-11-25T10:00:00Z',
        beads_updated_at: '2025-11-25T10:00:00Z',
        adopted_from_external_ref: false,
        comments: { '1': { github_comment_id: 999 } },
      });

      const serialized = serializeMapping(mapping);
      const deserialized = deserializeMapping(serialized);

      expect(deserialized.version).toBe(mapping.version);
      expect(deserialized.mappings['bd-abc']).toEqual(mapping.mappings['bd-abc']);
    });

    it('should throw on invalid JSON', () => {
      expect(() => deserializeMapping('not json')).toThrow();
    });

    it('should return empty mapping for empty string', () => {
      const result = deserializeMapping('');

      expect(result.version).toBe(1);
      expect(result.mappings).toEqual({});
    });
  });

  describe('getMappedBeadsIds', () => {
    it('should return empty array for empty mapping', () => {
      const mapping = createEmptyMapping();

      expect(getMappedBeadsIds(mapping)).toEqual([]);
    });

    it('should return all beads IDs in the mapping', () => {
      const mapping = createEmptyMapping();
      setMapping(mapping, 'bd-1', {
        github_issue_number: 1,
        github_issue_id: 100,
        last_sync_at: '2025-01-01T00:00:00Z',
        beads_updated_at: '2025-01-01T00:00:00Z',
        adopted_from_external_ref: false,
        comments: {},
      });
      setMapping(mapping, 'bd-2', {
        github_issue_number: 2,
        github_issue_id: 200,
        last_sync_at: '2025-01-01T00:00:00Z',
        beads_updated_at: '2025-01-01T00:00:00Z',
        adopted_from_external_ref: false,
        comments: {},
      });

      const ids = getMappedBeadsIds(mapping);

      expect(ids).toContain('bd-1');
      expect(ids).toContain('bd-2');
      expect(ids).toHaveLength(2);
    });
  });

  describe('buildMappingFromGitHubIssues', () => {
    const makeGitHubIssue = (
      number: number,
      labels: string[],
      beadsId: string = '',
      state: 'open' | 'closed' = 'open',
    ): GitHubIssue => ({
      number,
      id: number * 100,
      state,
      title: `${beadsId ? '[' + beadsId + '] ' : ''}Issue ${number}`,
      body: null,
      labels,
    });

    it('should return empty mapping for empty issues array', () => {
      const mapping = buildMappingFromGitHubIssues([]);

      expect(getMappedBeadsIds(mapping)).toHaveLength(0);
    });

    it('should extract beads ID from labels and create mapping', () => {
      const issues = [
        makeGitHubIssue(1, ['beads-synced', 'beads-id:bd-abc123', 'type:bug']),
        makeGitHubIssue(2, ['beads-synced', 'beads-id:bd-xyz789', 'priority:p1']),
      ];

      const mapping = buildMappingFromGitHubIssues(issues, undefined, 'label');

      expect(getMapping(mapping, 'bd-abc123')).toBeDefined();
      expect(getMapping(mapping, 'bd-abc123')?.github_issue_number).toBe(1);
      expect(getMapping(mapping, 'bd-abc123')?.github_issue_id).toBe(100);

      expect(getMapping(mapping, 'bd-xyz789')).toBeDefined();
      expect(getMapping(mapping, 'bd-xyz789')?.github_issue_number).toBe(2);
      expect(getMapping(mapping, 'bd-xyz789')?.github_issue_id).toBe(200);
    });

    it('should skip issues without beads ID label', () => {
      const issues = [
        makeGitHubIssue(1, ['beads-synced', 'beads-id:bd-abc123']),
        makeGitHubIssue(2, ['beads-synced', 'type:bug']), // No beads-id label
        makeGitHubIssue(3, ['random-label']), // Not a synced issue
      ];

      const mapping = buildMappingFromGitHubIssues(issues, undefined, 'label');

      expect(getMappedBeadsIds(mapping)).toHaveLength(1);
      expect(getMapping(mapping, 'bd-abc123')).toBeDefined();
    });

    it('should extract beads ID from title and create mapping', () => {
      const issues = [
        makeGitHubIssue(1, ['beads-synced', 'beads-id:bd-abc123', 'type:bug'], 'bd-abc123'),
        makeGitHubIssue(2, ['beads-synced', 'beads-id:bd-xyz789', 'priority:p1'], 'bd-xyz789'),
      ];

      const mapping = buildMappingFromGitHubIssues(issues);

      expect(getMapping(mapping, 'bd-abc123')).toBeDefined();
      expect(getMapping(mapping, 'bd-abc123')?.github_issue_number).toBe(1);
      expect(getMapping(mapping, 'bd-abc123')?.github_issue_id).toBe(100);

      expect(getMapping(mapping, 'bd-xyz789')).toBeDefined();
      expect(getMapping(mapping, 'bd-xyz789')?.github_issue_number).toBe(2);
      expect(getMapping(mapping, 'bd-xyz789')?.github_issue_id).toBe(200);
    });

    it('should skip issues without beads ID in title', () => {
      const issues = [
        makeGitHubIssue(1, ['beads-synced', 'beads-id:bd-abc123'], 'bd-abc123'),
        makeGitHubIssue(2, ['beads-synced', 'type:bug']), // No beads-id in title
        makeGitHubIssue(3, ['random-label']), // Not a synced issue
      ];

      const mapping = buildMappingFromGitHubIssues(issues);

      expect(getMappedBeadsIds(mapping)).toHaveLength(1);
      expect(getMapping(mapping, 'bd-abc123')).toBeDefined();
    });

    it('should handle label prefix correctly', () => {
      const issues = [
        makeGitHubIssue(1, ['myprefix-beads-synced', 'myprefix-beads-id:bd-prefixed']),
      ];

      const mapping = buildMappingFromGitHubIssues(issues, 'myprefix-', 'label');

      expect(getMapping(mapping, 'bd-prefixed')).toBeDefined();
      expect(getMapping(mapping, 'bd-prefixed')?.github_issue_number).toBe(1);
    });

    it('should include both open and closed issues', () => {
      const issues = [
        makeGitHubIssue(1, ['beads-synced', 'beads-id:bd-open'], 'open'),
        makeGitHubIssue(2, ['beads-synced', 'beads-id:bd-closed'], 'closed'),
      ];

      const mapping = buildMappingFromGitHubIssues(issues, undefined, 'label');

      expect(getMapping(mapping, 'bd-open')).toBeDefined();
      expect(getMapping(mapping, 'bd-closed')).toBeDefined();
    });

    it('should set beads_updated_at to epoch to trigger update', () => {
      const issues = [makeGitHubIssue(1, ['beads-id:bd-test'])];

      const mapping = buildMappingFromGitHubIssues(issues, undefined, 'label');

      expect(getMapping(mapping, 'bd-test')?.beads_updated_at).toBe('1970-01-01T00:00:00Z');
    });
  });
});
