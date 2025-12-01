import * as core from '@actions/core';
import {
  BeadsIssue,
  MappingFile,
  SyncConfig,
  SyncResult,
  SyncAction,
  SyncError,
} from './types';
import { GitHubClient } from './github';
import {
  setMapping,
  createIssueMapping,
  getMapping,
  updateLastSyncTime,
} from './mapper';
import { computeDiff } from './diff';
import { generateIssueBody, generateClosingComment, generateDeletionComment } from './template';
import { getLabelsForIssue, getAllRequiredLabels, createEpicLabelConfig } from './labels';
import { syncComments } from './comments';

/**
 * Filter issues based on sync configuration
 */
export function filterIssues(
  issues: BeadsIssue[],
  config: SyncConfig
): BeadsIssue[] {
  return issues.filter((issue) => {
    // Filter by status
    if (!config.syncStatuses.includes(issue.status)) {
      return false;
    }

    // Filter by priority
    if (
      issue.priority !== undefined &&
      !config.syncPriorities.includes(issue.priority)
    ) {
      return false;
    }

    // Filter by labels
    if (config.syncLabels.length > 0) {
      const issueLabels = issue.labels || [];
      const hasMatchingLabel = config.syncLabels.some((l) =>
        issueLabels.includes(l)
      );
      if (!hasMatchingLabel) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Execute a sync action
 */
async function executeAction(
  action: SyncAction,
  mapping: MappingFile,
  client: GitHubClient,
  config: SyncConfig
): Promise<SyncError | null> {
  const { beadsIssue } = action;

  try {
    const body = generateIssueBody(beadsIssue, mapping);
    const labels = getLabelsForIssue(beadsIssue, {
      addSyncMarker: config.addSyncMarker,
      labelPrefix: config.labelPrefix,
    });

    // Validate and filter assignees
    let assignees: string[] = [];
    if (beadsIssue.assignee) {
      assignees = await client.filterValidAssignees([beadsIssue.assignee]);
    }

    switch (action.type) {
      case 'create': {
        if (config.dryRun) {
          core.info(`[DRY RUN] Would create issue: ${beadsIssue.title}`);
          return null;
        }

        const created = await client.createIssue({
          title: beadsIssue.title,
          body,
          labels,
          assignees,
        });

        setMapping(
          mapping,
          beadsIssue.id,
          createIssueMapping(
            created.number,
            created.id,
            beadsIssue.updated_at
          )
        );

        core.info(`Created issue #${created.number}: ${beadsIssue.title}`);
        break;
      }

      case 'update': {
        if (config.dryRun) {
          core.info(
            `[DRY RUN] Would update issue #${action.githubIssueNumber}: ${beadsIssue.title}`
          );
          return null;
        }

        await client.updateIssue({
          issueNumber: action.githubIssueNumber!,
          title: beadsIssue.title,
          body,
          labels,
          assignees,
        });

        // Update mapping timestamp
        const existingMapping = getMapping(mapping, beadsIssue.id);
        if (existingMapping) {
          existingMapping.beads_updated_at = beadsIssue.updated_at;
          existingMapping.last_sync_at = new Date().toISOString();
        }

        core.info(
          `Updated issue #${action.githubIssueNumber}: ${beadsIssue.title}`
        );
        break;
      }

      case 'close': {
        if (config.dryRun) {
          core.info(
            `[DRY RUN] Would close issue #${action.githubIssueNumber}: ${beadsIssue.title}`
          );
          return null;
        }

        // Also update the body before closing
        await client.updateIssue({
          issueNumber: action.githubIssueNumber!,
          title: beadsIssue.title,
          body,
          labels,
        });

        const closingComment = generateClosingComment(beadsIssue);
        await client.closeIssue(action.githubIssueNumber!, closingComment);

        // Update mapping timestamp
        const existingMapping = getMapping(mapping, beadsIssue.id);
        if (existingMapping) {
          existingMapping.beads_updated_at = beadsIssue.updated_at;
          existingMapping.last_sync_at = new Date().toISOString();
        }

        core.info(
          `Closed issue #${action.githubIssueNumber}: ${beadsIssue.title}`
        );
        break;
      }

      case 'adopt': {
        if (config.dryRun) {
          core.info(
            `[DRY RUN] Would adopt issue #${action.githubIssueNumber} for ${beadsIssue.id}`
          );
          return null;
        }

        // Verify the issue exists
        const existingIssue = await client.getIssue(action.githubIssueNumber!);
        if (!existingIssue) {
          return {
            beadsIssueId: beadsIssue.id,
            action: 'adopt',
            message: `GitHub issue #${action.githubIssueNumber} not found`,
          };
        }

        // Update the issue with beads content
        await client.updateIssue({
          issueNumber: action.githubIssueNumber!,
          title: beadsIssue.title,
          body,
          labels,
          assignees,
        });

        // Create mapping
        setMapping(
          mapping,
          beadsIssue.id,
          createIssueMapping(
            existingIssue.number,
            existingIssue.id,
            beadsIssue.updated_at,
            true // adopted_from_external_ref
          )
        );

        core.info(
          `Adopted issue #${action.githubIssueNumber} for ${beadsIssue.id}`
        );
        break;
      }

      case 'reopen': {
        if (config.dryRun) {
          core.info(
            `[DRY RUN] Would reopen issue #${action.githubIssueNumber}: ${beadsIssue.title}`
          );
          return null;
        }

        await client.reopenIssue(action.githubIssueNumber!);
        await client.updateIssue({
          issueNumber: action.githubIssueNumber!,
          title: beadsIssue.title,
          body,
          labels,
          assignees,
        });

        core.info(
          `Reopened issue #${action.githubIssueNumber}: ${beadsIssue.title}`
        );
        break;
      }
    }

    return null;
  } catch (error) {
    return {
      beadsIssueId: beadsIssue.id,
      action: action.type,
      message: String(error),
    };
  }
}

/**
 * Handle deleted beads issues by closing the corresponding GitHub issues
 */
async function handleDeletedIssues(
  deletedIds: string[],
  mapping: MappingFile,
  client: GitHubClient,
  config: SyncConfig
): Promise<number> {
  if (!config.closeDeleted) {
    return 0;
  }

  let closedCount = 0;

  for (const beadsId of deletedIds) {
    const issueMapping = getMapping(mapping, beadsId);
    if (!issueMapping) {
      continue;
    }

    if (config.dryRun) {
      core.info(
        `[DRY RUN] Would close #${issueMapping.github_issue_number} (deleted from beads)`
      );
      continue;
    }

    try {
      const comment = generateDeletionComment(beadsId);
      await client.closeIssue(issueMapping.github_issue_number, comment);
      core.info(
        `Closed #${issueMapping.github_issue_number} (deleted from beads: ${beadsId})`
      );
      closedCount++;
    } catch (error) {
      core.warning(
        `Failed to close #${issueMapping.github_issue_number}: ${error}`
      );
    }
  }

  return closedCount;
}

/**
 * Collect all epic labels needed for issues
 */
function collectEpicLabels(issues: BeadsIssue[], prefix: string): Set<string> {
  const epicIds = new Set<string>();

  for (const issue of issues) {
    if (issue.dependencies) {
      for (const dep of issue.dependencies) {
        if (dep.type === 'parent-child') {
          epicIds.add(dep.id);
        }
      }
    }
  }

  return epicIds;
}

/**
 * Main sync orchestrator
 */
export async function runSync(
  issues: BeadsIssue[],
  mapping: MappingFile,
  client: GitHubClient,
  config: SyncConfig
): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    closed: 0,
    reopened: 0,
    adopted: 0,
    commentsSynced: 0,
    errors: [],
  };

  // Filter issues based on config
  const filteredIssues = filterIssues(issues, config);
  core.info(`Processing ${filteredIssues.length} of ${issues.length} issues`);

  // Ensure required labels exist
  core.info('Ensuring required labels exist...');
  const requiredLabels = getAllRequiredLabels(config.labelPrefix);

  // Also create epic labels for any parent-child dependencies
  const epicIds = collectEpicLabels(filteredIssues, config.labelPrefix);
  for (const epicId of epicIds) {
    requiredLabels.push(createEpicLabelConfig(epicId, config.labelPrefix));
  }

  if (!config.dryRun) {
    await client.ensureLabels(requiredLabels);
  }

  // Compute diff
  const diff = computeDiff(filteredIssues, mapping);
  core.info(
    `Diff: ${diff.actions.length} actions, ` +
      `${diff.commentActions.length} comments, ` +
      `${diff.deletedIssueIds.length} deletions`
  );

  // Execute actions
  for (const action of diff.actions) {
    const error = await executeAction(action, mapping, client, config);

    if (error) {
      result.errors.push(error);
      continue;
    }

    if (!config.dryRun) {
      switch (action.type) {
        case 'create':
          result.created++;
          break;
        case 'update':
          result.updated++;
          break;
        case 'close':
          result.closed++;
          break;
        case 'reopen':
          result.reopened++;
          break;
        case 'adopt':
          result.adopted++;
          break;
      }
    }
  }

  // Handle deleted issues
  const deletionsClosed = await handleDeletedIssues(
    diff.deletedIssueIds,
    mapping,
    client,
    config
  );
  result.closed += deletionsClosed;

  // Sync comments if enabled
  if (config.syncComments) {
    result.commentsSynced = await syncComments(
      diff.commentActions,
      mapping,
      client,
      config.dryRun
    );
  }

  // Update sync metadata
  if (!config.dryRun) {
    updateLastSyncTime(mapping);
  }

  return result;
}
