import { BeadsIssue, MappingFile } from './types';
import { getMapping } from './mapper';

const BEADS_SYNC_MARKER_PATTERN = /<!-- beads-sync:(bd-[a-zA-Z0-9]+) -->/;

/**
 * Generate the GitHub issue body from a beads issue
 */
export function generateIssueBody(
  issue: BeadsIssue,
  mapping: MappingFile
): string {
  const sections: string[] = [];

  // Marker comment for identification
  sections.push(`<!-- beads-sync:${issue.id} -->`);

  // Warning banner
  sections.push(`> [!CAUTION]
> This issue is synced from beads. Do not edit directly—changes will be overwritten.
> To update, use \`bd update ${issue.id}\` in the source repository.`);

  // Description
  if (issue.description) {
    sections.push(issue.description);
  }

  // Acceptance criteria
  if (issue.acceptance_criteria && issue.acceptance_criteria.length > 0) {
    const checklist = issue.acceptance_criteria
      .map((criterion) => `- [ ] ${criterion}`)
      .join('\n');
    sections.push(`<details>
<summary>Acceptance Criteria</summary>

${checklist}

</details>`);
  }

  // Design notes
  if (issue.design) {
    sections.push(`<details>
<summary>Design Notes</summary>

${issue.design}

</details>`);
  }

  // Working notes
  if (issue.notes) {
    sections.push(`<details>
<summary>Working Notes</summary>

${issue.notes}

</details>`);
  }

  // Metadata table
  const metadataRows: string[] = [];
  metadataRows.push(`| **Beads ID** | \`${issue.id}\` |`);

  // Dependencies
  if (issue.dependencies && issue.dependencies.length > 0) {
    const depStrings = issue.dependencies.map((dep) => {
      const depMapping = getMapping(mapping, dep.id);
      if (depMapping) {
        return `#${depMapping.github_issue_number} (${dep.type})`;
      }
      return `${dep.id} (${dep.type})`;
    });
    metadataRows.push(`| **Dependencies** | ${depStrings.join(', ')} |`);
  }

  // Estimated time
  if (issue.estimated_time) {
    metadataRows.push(`| **Estimated Time** | ${issue.estimated_time} |`);
  }

  // Assignee
  if (issue.assignee) {
    metadataRows.push(`| **Assignee (beads)** | ${issue.assignee} |`);
  }

  // External ref (only if not self-referential)
  if (issue.external_ref) {
    metadataRows.push(`| **External Ref** | ${issue.external_ref} |`);
  }

  if (metadataRows.length > 0) {
    sections.push('---');
    sections.push(`| Field | Value |
|-------|-------|
${metadataRows.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Extract the beads ID from a GitHub issue body
 * Returns null if no beads marker is found
 */
export function extractBeadsIdFromBody(body: string): string | null {
  const match = body.match(BEADS_SYNC_MARKER_PATTERN);
  return match ? match[1] : null;
}

/**
 * Generate a closing comment for an issue
 */
export function generateClosingComment(issue: BeadsIssue): string {
  const parts = ['This issue was closed in beads.'];

  if (issue.close_reason) {
    parts.push(`\n\n**Reason:** ${issue.close_reason}`);
  }

  parts.push(`\n\n---\n*Synced from beads issue \`${issue.id}\`*`);

  return parts.join('');
}

/**
 * Generate a deletion comment for an issue removed from beads
 */
export function generateDeletionComment(beadsId: string): string {
  return `This issue was deleted from beads tracking.\n\n---\n*Previously tracked as beads issue \`${beadsId}\`*`;
}

/**
 * Format a beads comment for GitHub
 */
export function formatBeadsComment(
  comment: { author: string; created_at: string; body: string },
  beadsIssueId: string
): string {
  const timestamp = new Date(comment.created_at).toISOString();
  return `**${comment.author}** commented on ${timestamp}:

${comment.body}

---
*Synced from beads issue \`${beadsIssueId}\`*`;
}
