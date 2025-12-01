import {
  BeadsIssue,
  BeadsPriority,
  BeadsIssueType,
  LabelConfig,
  PRIORITY_LABELS,
  TYPE_LABELS,
  SYNC_MARKER_LABEL,
  BLOCKED_LABEL,
  IN_PROGRESS_LABEL,
  BEADS_ID_LABEL_PREFIX,
} from './types';

export interface LabelOptions {
  addSyncMarker: boolean;
  labelPrefix?: string;
}

/**
 * Get all labels that should be applied to a GitHub issue
 */
export function getLabelsForIssue(
  issue: BeadsIssue,
  options: LabelOptions
): string[] {
  const labels: string[] = [];
  const prefix = options.labelPrefix || '';

  // Sync marker
  if (options.addSyncMarker) {
    labels.push(`${prefix}${SYNC_MARKER_LABEL.name}`);
  }

  // Beads ID label - always add to track the mapping
  labels.push(getBeadsIdLabel(issue.id, prefix));

  // Priority label
  if (issue.priority !== undefined) {
    const priorityLabel = PRIORITY_LABELS[issue.priority as BeadsPriority];
    if (priorityLabel) {
      labels.push(`${prefix}${priorityLabel.name}`);
    }
  }

  // Type label
  if (issue.issue_type) {
    const typeLabel = TYPE_LABELS[issue.issue_type as BeadsIssueType];
    if (typeLabel) {
      labels.push(`${prefix}${typeLabel.name}`);
    }
  }

  // Status labels
  if (issue.status === 'blocked') {
    labels.push(`${prefix}${BLOCKED_LABEL.name}`);
  } else if (issue.status === 'in_progress') {
    labels.push(`${prefix}${IN_PROGRESS_LABEL.name}`);
  }

  // Custom labels from beads
  if (issue.labels) {
    labels.push(...issue.labels);
  }

  // Epic labels for parent-child dependencies
  if (issue.dependencies) {
    for (const dep of issue.dependencies) {
      if (dep.type === 'parent-child') {
        labels.push(getEpicLabel(dep.id, prefix));
      }
    }
  }

  return labels;
}

/**
 * Get all predefined labels that should be created in the repository
 */
export function getAllRequiredLabels(prefix: string = ''): LabelConfig[] {
  const labels: LabelConfig[] = [];

  // Priority labels
  for (const priority of Object.values(PRIORITY_LABELS)) {
    labels.push({
      ...priority,
      name: `${prefix}${priority.name}`,
    });
  }

  // Type labels
  for (const type of Object.values(TYPE_LABELS)) {
    labels.push({
      ...type,
      name: `${prefix}${type.name}`,
    });
  }

  // Special labels
  labels.push({
    ...SYNC_MARKER_LABEL,
    name: `${prefix}${SYNC_MARKER_LABEL.name}`,
  });
  labels.push({
    ...BLOCKED_LABEL,
    name: `${prefix}${BLOCKED_LABEL.name}`,
  });
  labels.push({
    ...IN_PROGRESS_LABEL,
    name: `${prefix}${IN_PROGRESS_LABEL.name}`,
  });

  return labels;
}

/**
 * Generate the epic label name for a parent beads issue
 */
export function getEpicLabel(parentBeadsId: string, prefix: string = ''): string {
  return `${prefix}epic:${parentBeadsId}`;
}

/**
 * Create epic label config for a specific parent
 */
export function createEpicLabelConfig(
  parentBeadsId: string,
  prefix: string = ''
): LabelConfig {
  return {
    name: getEpicLabel(parentBeadsId, prefix),
    color: '5319e7',
    description: `Child of epic ${parentBeadsId}`,
  };
}

/**
 * Generate the beads ID label for an issue
 */
export function getBeadsIdLabel(beadsId: string, prefix: string = ''): string {
  return `${prefix}${BEADS_ID_LABEL_PREFIX}${beadsId}`;
}

/**
 * Extract the beads ID from a label name
 * Returns null if the label is not a beads ID label
 */
export function parseBeadsIdFromLabel(
  labelName: string,
  prefix: string = ''
): string | null {
  const fullPrefix = `${prefix}${BEADS_ID_LABEL_PREFIX}`;
  if (labelName.startsWith(fullPrefix)) {
    return labelName.slice(fullPrefix.length);
  }
  return null;
}

/**
 * Extract the beads ID from an array of label names
 * Returns null if no beads ID label is found
 */
export function extractBeadsIdFromLabels(
  labels: string[],
  prefix: string = ''
): string | null {
  for (const label of labels) {
    const beadsId = parseBeadsIdFromLabel(label, prefix);
    if (beadsId) {
      return beadsId;
    }
  }
  return null;
}
