import { MappingFile, IssueMapping } from './types';

/**
 * Create a new empty mapping file structure
 */
export function createEmptyMapping(): MappingFile {
  return {
    version: 1,
    mappings: {},
    sync_metadata: {
      last_full_sync: new Date().toISOString(),
    },
  };
}

/**
 * Get the mapping for a beads issue ID
 */
export function getMapping(
  mappingFile: MappingFile,
  beadsId: string
): IssueMapping | undefined {
  return mappingFile.mappings[beadsId];
}

/**
 * Set the mapping for a beads issue ID
 */
export function setMapping(
  mappingFile: MappingFile,
  beadsId: string,
  mapping: IssueMapping
): void {
  mappingFile.mappings[beadsId] = mapping;
}

/**
 * Remove the mapping for a beads issue ID
 */
export function removeMapping(mappingFile: MappingFile, beadsId: string): void {
  delete mappingFile.mappings[beadsId];
}

/**
 * Get the GitHub comment ID for a beads comment
 */
export function getCommentMapping(
  mappingFile: MappingFile,
  beadsIssueId: string,
  commentId: string
): number | undefined {
  const issueMapping = mappingFile.mappings[beadsIssueId];
  if (!issueMapping) {
    return undefined;
  }
  return issueMapping.comments[commentId]?.github_comment_id;
}

/**
 * Set the GitHub comment ID for a beads comment
 */
export function setCommentMapping(
  mappingFile: MappingFile,
  beadsIssueId: string,
  commentId: string,
  githubCommentId: number
): void {
  const issueMapping = mappingFile.mappings[beadsIssueId];
  if (!issueMapping) {
    return;
  }
  issueMapping.comments[commentId] = { github_comment_id: githubCommentId };
}

/**
 * Serialize a mapping file to JSON string
 */
export function serializeMapping(mappingFile: MappingFile): string {
  return JSON.stringify(mappingFile, null, 2);
}

/**
 * Deserialize a JSON string to a mapping file
 * Returns an empty mapping if the string is empty
 */
export function deserializeMapping(content: string): MappingFile {
  if (!content.trim()) {
    return createEmptyMapping();
  }
  return JSON.parse(content) as MappingFile;
}

/**
 * Get all beads IDs that have mappings
 */
export function getMappedBeadsIds(mappingFile: MappingFile): string[] {
  return Object.keys(mappingFile.mappings);
}

/**
 * Update the last sync timestamp
 */
export function updateLastSyncTime(mappingFile: MappingFile): void {
  mappingFile.sync_metadata.last_full_sync = new Date().toISOString();
}

/**
 * Create a new issue mapping entry
 */
export function createIssueMapping(
  githubIssueNumber: number,
  githubIssueId: number,
  beadsUpdatedAt: string,
  adoptedFromExternalRef: boolean = false
): IssueMapping {
  return {
    github_issue_number: githubIssueNumber,
    github_issue_id: githubIssueId,
    last_sync_at: new Date().toISOString(),
    beads_updated_at: beadsUpdatedAt,
    adopted_from_external_ref: adoptedFromExternalRef,
    comments: {},
  };
}
