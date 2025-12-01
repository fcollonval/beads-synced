import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSync, filterIssues } from '../src/sync';
import { BeadsIssue, BeadsStatus, MappingFile, SyncConfig } from '../src/types';
import { GitHubClient } from '../src/github';
import { createEmptyMapping, setMapping, createIssueMapping } from '../src/mapper';

// Mock the GitHub client
vi.mock('../src/github', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    closeIssue: vi.fn(),
    reopenIssue: vi.fn(),
    getIssue: vi.fn(),
    createComment: vi.fn(),
    ensureLabels: vi.fn(),
    filterValidAssignees: vi.fn().mockResolvedValue([]),
  })),
}));

describe('sync', () => {
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

  const makeConfig = (overrides: Partial<SyncConfig> = {}): SyncConfig => ({
    githubToken: 'test-token',
    beadsFile: 'beads/issues.jsonl',
    dryRun: false,
    syncComments: false,
    syncStatuses: ['open', 'in_progress', 'blocked', 'closed'],
    syncPriorities: [0, 1, 2, 3, 4],
    syncLabels: [],
    labelPrefix: '',
    addSyncMarker: true,
    closeDeleted: false,
    owner: 'test-owner',
    repo: 'test-repo',
    ...overrides,
  });

  describe('filterIssues', () => {
    it('should filter issues by status', () => {
      const issues = [
        makeIssue('bd-1', 'open'),
        makeIssue('bd-2', 'closed'),
        makeIssue('bd-3', 'in_progress'),
      ];
      const config = makeConfig({ syncStatuses: ['open', 'in_progress'] });

      const filtered = filterIssues(issues, config);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((i) => i.id)).toEqual(['bd-1', 'bd-3']);
    });

    it('should include closed issues when syncStatuses includes closed', () => {
      const issues = [
        makeIssue('bd-1', 'open'),
        makeIssue('bd-2', 'closed'),
      ];
      const config = makeConfig({ syncStatuses: ['open', 'closed'] });

      const filtered = filterIssues(issues, config);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((i) => i.status)).toContain('closed');
    });
  });

  describe('runSync - status handling', () => {
    let mockClient: {
      createIssue: ReturnType<typeof vi.fn>;
      updateIssue: ReturnType<typeof vi.fn>;
      closeIssue: ReturnType<typeof vi.fn>;
      reopenIssue: ReturnType<typeof vi.fn>;
      getIssue: ReturnType<typeof vi.fn>;
      createComment: ReturnType<typeof vi.fn>;
      ensureLabels: ReturnType<typeof vi.fn>;
      filterValidAssignees: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockClient = {
        createIssue: vi.fn().mockResolvedValue({ number: 1, id: 100 }),
        updateIssue: vi.fn().mockResolvedValue({ number: 1, id: 100 }),
        closeIssue: vi.fn().mockResolvedValue({ number: 1, id: 100 }),
        reopenIssue: vi.fn().mockResolvedValue({ number: 1, id: 100 }),
        getIssue: vi.fn().mockResolvedValue({ number: 1, id: 100, state: 'open' }),
        createComment: vi.fn().mockResolvedValue({ id: 1 }),
        ensureLabels: vi.fn().mockResolvedValue(undefined),
        filterValidAssignees: vi.fn().mockResolvedValue([]),
      };
    });

    it('should close newly created issue when beads status is closed', async () => {
      const issues = [makeIssue('bd-closed', 'closed')];
      const mapping = createEmptyMapping();
      const config = makeConfig();

      await runSync(issues, mapping, mockClient as unknown as GitHubClient, config);

      // Should create the issue first
      expect(mockClient.createIssue).toHaveBeenCalledTimes(1);
      // Should then close it because status is 'closed'
      expect(mockClient.closeIssue).toHaveBeenCalledTimes(1);
      expect(mockClient.closeIssue).toHaveBeenCalledWith(1, expect.any(String));
    });

    it('should NOT close newly created issue when beads status is open', async () => {
      const issues = [makeIssue('bd-open', 'open')];
      const mapping = createEmptyMapping();
      const config = makeConfig();

      await runSync(issues, mapping, mockClient as unknown as GitHubClient, config);

      expect(mockClient.createIssue).toHaveBeenCalledTimes(1);
      expect(mockClient.closeIssue).not.toHaveBeenCalled();
    });

    it('should NOT close newly created issue when beads status is in_progress', async () => {
      const issues = [makeIssue('bd-inprogress', 'in_progress')];
      const mapping = createEmptyMapping();
      const config = makeConfig();

      await runSync(issues, mapping, mockClient as unknown as GitHubClient, config);

      expect(mockClient.createIssue).toHaveBeenCalledTimes(1);
      expect(mockClient.closeIssue).not.toHaveBeenCalled();
    });

    it('should NOT close newly created issue when beads status is blocked', async () => {
      const issues = [makeIssue('bd-blocked', 'blocked')];
      const mapping = createEmptyMapping();
      const config = makeConfig();

      await runSync(issues, mapping, mockClient as unknown as GitHubClient, config);

      expect(mockClient.createIssue).toHaveBeenCalledTimes(1);
      expect(mockClient.closeIssue).not.toHaveBeenCalled();
    });

    it('should close adopted issue when beads status is closed', async () => {
      const issues = [
        makeIssue('bd-adopt-closed', 'closed', { external_ref: 'gh-99' }),
      ];
      const mapping = createEmptyMapping();
      const config = makeConfig();

      mockClient.getIssue.mockResolvedValue({ number: 99, id: 199, state: 'open' });

      await runSync(issues, mapping, mockClient as unknown as GitHubClient, config);

      // Should get and update the adopted issue
      expect(mockClient.getIssue).toHaveBeenCalledWith(99);
      expect(mockClient.updateIssue).toHaveBeenCalled();
      // Should close it because status is 'closed'
      expect(mockClient.closeIssue).toHaveBeenCalledWith(99, expect.any(String));
    });

    it('should NOT close adopted issue when beads status is open', async () => {
      const issues = [
        makeIssue('bd-adopt-open', 'open', { external_ref: 'gh-99' }),
      ];
      const mapping = createEmptyMapping();
      const config = makeConfig();

      mockClient.getIssue.mockResolvedValue({ number: 99, id: 199, state: 'open' });

      await runSync(issues, mapping, mockClient as unknown as GitHubClient, config);

      expect(mockClient.getIssue).toHaveBeenCalledWith(99);
      expect(mockClient.updateIssue).toHaveBeenCalled();
      expect(mockClient.closeIssue).not.toHaveBeenCalled();
    });

    it('should close existing issue when status changes to closed', async () => {
      const issues = [
        makeIssue('bd-existing', 'closed', {
          updated_at: '2025-01-02T00:00:00Z',
        }),
      ];
      const mapping = createEmptyMapping();
      setMapping(
        mapping,
        'bd-existing',
        createIssueMapping(42, 142, '2025-01-01T00:00:00Z')
      );
      const config = makeConfig();

      await runSync(issues, mapping, mockClient as unknown as GitHubClient, config);

      // Should update and close the issue
      expect(mockClient.updateIssue).toHaveBeenCalled();
      expect(mockClient.closeIssue).toHaveBeenCalledWith(42, expect.any(String));
    });

    it('should handle mixed statuses correctly in batch', async () => {
      const issues = [
        makeIssue('bd-open', 'open'),
        makeIssue('bd-closed', 'closed'),
        makeIssue('bd-in-progress', 'in_progress'),
      ];
      const mapping = createEmptyMapping();
      const config = makeConfig();

      // Make createIssue return sequential numbers
      let issueNum = 0;
      mockClient.createIssue.mockImplementation(() => {
        issueNum++;
        return Promise.resolve({ number: issueNum, id: issueNum * 100 });
      });

      await runSync(issues, mapping, mockClient as unknown as GitHubClient, config);

      // All three should be created
      expect(mockClient.createIssue).toHaveBeenCalledTimes(3);
      // Only the closed one should be closed
      expect(mockClient.closeIssue).toHaveBeenCalledTimes(1);
    });
  });
});
