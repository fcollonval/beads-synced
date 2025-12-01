import {
  BeadsIssue,
  MappingFile,
  IssueMapping,
  SyncAction,
  CommentSyncAction,
  DiffResult,
} from './types';
import { getMapping, getMappedBeadsIds } from './mapper';

const GITHUB_EXTERNAL_REF_PATTERN = /^gh-(\d+)$/;

/**
 * Parse a GitHub issue number from an external_ref field
 * Returns the issue number if it matches "gh-NUMBER" format, null otherwise
 */
export function parseExternalRef(externalRef: string): number | null {
  const match = externalRef.match(GITHUB_EXTERNAL_REF_PATTERN);
  if (!match) {
    return null;
  }
  const num = parseInt(match[1], 10);
  return isNaN(num) ? null : num;
}

/**
 * Check if a beads issue needs to be synced based on updated_at timestamp
 */
export function needsUpdate(
  issue: BeadsIssue,
  mapping: IssueMapping
): boolean {
  const beadsUpdated = new Date(issue.updated_at).getTime();
  const lastSynced = new Date(mapping.beads_updated_at).getTime();
  return beadsUpdated > lastSynced;
}

/**
 * Compute the diff between beads issues and existing GitHub mappings
 * Returns the list of actions needed to sync
 */
export function computeDiff(
  issues: BeadsIssue[],
  mapping: MappingFile
): DiffResult {
  const actions: SyncAction[] = [];
  const commentActions: CommentSyncAction[] = [];
  const deletedIssueIds: string[] = [];

  const beadsIds = new Set(issues.map((i) => i.id));
  const mappedIds = getMappedBeadsIds(mapping);

  // Find deleted issues (in mapping but not in beads)
  for (const mappedId of mappedIds) {
    if (!beadsIds.has(mappedId)) {
      deletedIssueIds.push(mappedId);
    }
  }

  // Process each beads issue
  for (const issue of issues) {
    const existingMapping = getMapping(mapping, issue.id);

    if (!existingMapping) {
      // New issue - check for external_ref adoption
      if (issue.external_ref) {
        const ghIssueNumber = parseExternalRef(issue.external_ref);
        if (ghIssueNumber !== null) {
          actions.push({
            type: 'adopt',
            beadsIssue: issue,
            githubIssueNumber: ghIssueNumber,
            reason: 'Adopting existing GitHub issue from external_ref',
          });
          // Also check for new comments on adoption
          const newComments = getNewComments(issue, null, ghIssueNumber);
          commentActions.push(...newComments);
          continue;
        }
      }

      // Regular new issue
      actions.push({
        type: 'create',
        beadsIssue: issue,
        reason: 'New beads issue',
      });
      continue;
    }

    // Existing issue - check if update needed
    if (needsUpdate(issue, existingMapping)) {
      if (issue.status === 'closed') {
        actions.push({
          type: 'close',
          beadsIssue: issue,
          githubIssueNumber: existingMapping.github_issue_number,
          reason: 'Beads issue closed',
        });
      } else {
        actions.push({
          type: 'update',
          beadsIssue: issue,
          githubIssueNumber: existingMapping.github_issue_number,
          reason: 'Beads issue updated',
        });
      }
    }

    // Check for new comments
    const newComments = getNewComments(
      issue,
      existingMapping,
      existingMapping.github_issue_number
    );
    commentActions.push(...newComments);
  }

  return { actions, commentActions, deletedIssueIds };
}

/**
 * Get comments that haven't been synced yet
 */
function getNewComments(
  issue: BeadsIssue,
  existingMapping: IssueMapping | null,
  githubIssueNumber: number
): CommentSyncAction[] {
  if (!issue.comments || issue.comments.length === 0) {
    return [];
  }

  const syncedCommentIds = new Set(
    existingMapping ? Object.keys(existingMapping.comments) : []
  );

  return issue.comments
    .filter((comment) => !syncedCommentIds.has(comment.id))
    .map((comment) => ({
      beadsIssueId: issue.id,
      githubIssueNumber,
      comment,
    }));
}
