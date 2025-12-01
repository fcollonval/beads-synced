/**
 * Beads issue status values
 */
export type BeadsStatus = 'open' | 'in_progress' | 'blocked' | 'closed';

/**
 * Beads issue type values
 */
export type BeadsIssueType = 'bug' | 'feature' | 'task' | 'epic' | 'chore';

/**
 * Beads priority levels (0 = highest, 4 = lowest)
 */
export type BeadsPriority = 0 | 1 | 2 | 3 | 4;

/**
 * Dependency relationship types
 */
export type DependencyType = 'blocks' | 'blocked-by' | 'relates-to' | 'parent-child';

/**
 * A dependency reference in a beads issue
 */
export interface BeadsDependency {
  id: string;
  type: DependencyType;
}

/**
 * A comment on a beads issue
 */
export interface BeadsComment {
  id: string;
  author: string;
  created_at: string;
  body: string;
}

/**
 * A beads issue as stored in issues.jsonl
 */
export interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string[];
  notes?: string;
  status: BeadsStatus;
  priority?: BeadsPriority;
  issue_type?: BeadsIssueType;
  assignee?: string;
  labels?: string[];
  dependencies?: BeadsDependency[];
  external_ref?: string;
  close_reason?: string;
  comments?: BeadsComment[];
  created_at: string;
  updated_at: string;
  estimated_time?: string;
}

/**
 * Comment mapping within an issue mapping
 */
export interface CommentMapping {
  github_comment_id: number;
}

/**
 * Mapping entry for a single beads issue to GitHub issue
 */
export interface IssueMapping {
  github_issue_number: number;
  github_issue_id: number;
  last_sync_at: string;
  beads_updated_at: string;
  adopted_from_external_ref: boolean;
  comments: Record<string, CommentMapping>;
}

/**
 * Sync metadata stored in the mapping file
 */
export interface SyncMetadata {
  last_full_sync: string;
}

/**
 * The complete mapping file structure
 */
export interface MappingFile {
  version: number;
  mappings: Record<string, IssueMapping>;
  sync_metadata: SyncMetadata;
}

/**
 * Configuration options for the sync action
 */
export interface SyncConfig {
  githubToken: string;
  beadsFile: string;
  mappingFile: string;
  dryRun: boolean;
  syncComments: boolean;
  syncStatuses: BeadsStatus[];
  syncPriorities: BeadsPriority[];
  syncLabels: string[];
  labelPrefix: string;
  addSyncMarker: boolean;
  closeDeleted: boolean;
  autoCommitMapping: boolean;
  commitMessage: string;
  owner: string;
  repo: string;
}

/**
 * Types of sync actions that can be performed
 */
export type SyncActionType = 'create' | 'update' | 'close' | 'reopen' | 'adopt';

/**
 * A sync action to be performed on a GitHub issue
 */
export interface SyncAction {
  type: SyncActionType;
  beadsIssue: BeadsIssue;
  githubIssueNumber?: number;
  reason: string;
}

/**
 * A comment sync action
 */
export interface CommentSyncAction {
  beadsIssueId: string;
  githubIssueNumber: number;
  comment: BeadsComment;
}

/**
 * Result of the diff operation
 */
export interface DiffResult {
  actions: SyncAction[];
  commentActions: CommentSyncAction[];
  deletedIssueIds: string[];
}

/**
 * Summary of sync results
 */
export interface SyncResult {
  created: number;
  updated: number;
  closed: number;
  reopened: number;
  adopted: number;
  commentsSynced: number;
  errors: SyncError[];
}

/**
 * An error that occurred during sync
 */
export interface SyncError {
  beadsIssueId: string;
  action: SyncActionType | 'comment';
  message: string;
}

/**
 * Label configuration for priority labels
 */
export interface LabelConfig {
  name: string;
  color: string;
  description: string;
}

/**
 * Default label configurations
 */
export const PRIORITY_LABELS: Record<BeadsPriority, LabelConfig> = {
  0: { name: 'priority:p0', color: 'b60205', description: 'Critical priority' },
  1: { name: 'priority:p1', color: 'd93f0b', description: 'High priority' },
  2: { name: 'priority:p2', color: 'fbca04', description: 'Medium priority' },
  3: { name: 'priority:p3', color: '0e8a16', description: 'Low priority' },
  4: { name: 'priority:p4', color: 'c5def5', description: 'Minimal priority' },
};

export const TYPE_LABELS: Record<BeadsIssueType, LabelConfig> = {
  bug: { name: 'type:bug', color: 'b60205', description: 'Bug report' },
  feature: { name: 'type:feature', color: '0e8a16', description: 'New feature' },
  task: { name: 'type:task', color: '1d76db', description: 'Task' },
  epic: { name: 'type:epic', color: '5319e7', description: 'Epic' },
  chore: { name: 'type:chore', color: 'c5def5', description: 'Chore/maintenance' },
};

export const SYNC_MARKER_LABEL: LabelConfig = {
  name: 'beads-synced',
  color: '6f42c1',
  description: 'Issue synced from beads',
};

export const BLOCKED_LABEL: LabelConfig = {
  name: 'beads-blocked',
  color: 'd93f0b',
  description: 'Issue has open blockers',
};
