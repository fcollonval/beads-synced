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
} from '../src/mapper';
import { MappingFile, IssueMapping } from '../src/types';

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
});
