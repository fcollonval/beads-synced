import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';

import { SyncConfig, BeadsStatus, BeadsPriority } from './types';
import { parseBeadsFile } from './parser';
import { deserializeMapping, serializeMapping } from './mapper';
import { GitHubClient } from './github';
import { runSync } from './sync';

/**
 * Get action inputs and build config
 */
function getConfig(): SyncConfig {
  const { owner, repo } = github.context.repo;

  // Parse status list
  const statusStr = core.getInput('sync-statuses') || 'open,in_progress,blocked,closed';
  const syncStatuses = statusStr.split(',').map((s) => s.trim()) as BeadsStatus[];

  // Parse priority list
  const priorityStr = core.getInput('sync-priorities') || '0,1,2,3,4';
  const syncPriorities = priorityStr
    .split(',')
    .map((p) => parseInt(p.trim(), 10)) as BeadsPriority[];

  // Parse label filter
  const labelsStr = core.getInput('sync-labels') || '';
  const syncLabels = labelsStr
    ? labelsStr.split(',').map((l) => l.trim())
    : [];

  return {
    githubToken: core.getInput('github-token', { required: true }),
    beadsFile: core.getInput('beads-file') || 'beads/issues.jsonl',
    mappingFile: core.getInput('mapping-file') || '.beads-sync/mapping.json',
    dryRun: core.getInput('dry-run') === 'true',
    syncComments: core.getInput('sync-comments') !== 'false',
    syncStatuses,
    syncPriorities,
    syncLabels,
    labelPrefix: core.getInput('label-prefix') || '',
    addSyncMarker: core.getInput('add-sync-marker') !== 'false',
    closeDeleted: core.getInput('close-deleted') !== 'false',
    autoCommitMapping: core.getInput('auto-commit-mapping') !== 'false',
    commitMessage:
      core.getInput('commit-message') ||
      'chore(beads-sync): update issue mapping',
    owner,
    repo,
  };
}

/**
 * Read file content, returning empty string if not found
 */
function readFileOrEmpty(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Ensure directory exists for a file path
 */
function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Main action entry point
 */
async function run(): Promise<void> {
  try {
    const config = getConfig();

    core.info(`Beads Syncer starting...`);
    core.info(`Repository: ${config.owner}/${config.repo}`);
    core.info(`Beads file: ${config.beadsFile}`);
    core.info(`Mapping file: ${config.mappingFile}`);
    if (config.dryRun) {
      core.info('DRY RUN MODE - no changes will be made');
    }

    // Read beads file
    const beadsContent = readFileOrEmpty(config.beadsFile);
    if (!beadsContent) {
      core.warning(`Beads file not found: ${config.beadsFile}`);
      core.info('Nothing to sync');
      return;
    }

    // Parse beads issues
    const parseResult = parseBeadsFile(beadsContent);
    core.info(`Parsed ${parseResult.issues.length} issues`);

    if (parseResult.errors.length > 0) {
      core.warning(`${parseResult.errors.length} parse errors:`);
      for (const err of parseResult.errors) {
        core.warning(`  Line ${err.line}: ${err.error}`);
      }
    }

    if (parseResult.issues.length === 0) {
      core.info('No valid issues to sync');
      return;
    }

    // Read mapping file
    const mappingContent = readFileOrEmpty(config.mappingFile);
    const mapping = deserializeMapping(mappingContent);

    // Create GitHub client
    const client = new GitHubClient({
      token: config.githubToken,
      owner: config.owner,
      repo: config.repo,
    });

    // Run sync
    const result = await runSync(parseResult.issues, mapping, client, config);

    // Save mapping file
    if (!config.dryRun) {
      ensureDir(config.mappingFile);
      fs.writeFileSync(config.mappingFile, serializeMapping(mapping));
      core.info(`Saved mapping file: ${config.mappingFile}`);
    }

    // Set outputs
    core.setOutput('created', result.created.toString());
    core.setOutput('updated', result.updated.toString());
    core.setOutput('closed', result.closed.toString());
    core.setOutput('comments-synced', result.commentsSynced.toString());

    // Summary
    core.info('');
    core.info('=== Sync Summary ===');
    core.info(`Created: ${result.created}`);
    core.info(`Updated: ${result.updated}`);
    core.info(`Closed: ${result.closed}`);
    core.info(`Reopened: ${result.reopened}`);
    core.info(`Adopted: ${result.adopted}`);
    core.info(`Comments synced: ${result.commentsSynced}`);

    if (result.errors.length > 0) {
      core.warning(`Errors: ${result.errors.length}`);
      for (const err of result.errors) {
        core.warning(`  ${err.beadsIssueId} (${err.action}): ${err.message}`);
      }
    }

    core.info('Sync complete!');
  } catch (error) {
    core.setFailed(`Sync failed: ${error}`);
  }
}

run();
