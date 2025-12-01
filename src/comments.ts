import { CommentSyncAction, MappingFile } from './types';
import { GitHubClient } from './github';
import { formatBeadsComment } from './template';
import { setCommentMapping } from './mapper';
import * as core from '@actions/core';

/**
 * Sync beads comments to GitHub issue comments
 * Returns the number of comments synced
 */
export async function syncComments(
  commentActions: CommentSyncAction[],
  mapping: MappingFile,
  client: GitHubClient,
  dryRun: boolean
): Promise<number> {
  let synced = 0;

  for (const action of commentActions) {
    const formattedBody = formatBeadsComment(
      action.comment,
      action.beadsIssueId
    );

    if (dryRun) {
      core.info(
        `[DRY RUN] Would create comment on #${action.githubIssueNumber} ` +
          `(beads comment ${action.comment.id} by ${action.comment.author})`
      );
      continue;
    }

    try {
      const result = await client.createComment(
        action.githubIssueNumber,
        formattedBody
      );

      // Update mapping with the new comment ID
      setCommentMapping(
        mapping,
        action.beadsIssueId,
        action.comment.id,
        result.id
      );

      core.info(
        `Created comment on #${action.githubIssueNumber} ` +
          `(beads comment ${action.comment.id})`
      );
      synced++;
    } catch (error) {
      core.warning(
        `Failed to create comment on #${action.githubIssueNumber}: ${error}`
      );
    }
  }

  return synced;
}
