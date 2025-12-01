import { BeadsIssue, BeadsStatus } from './types';

/**
 * Error information for a failed parse
 */
export interface ParseError {
  line: number;
  content: string;
  error: string;
}

/**
 * Result of parsing a beads file
 */
export interface ParseResult {
  issues: BeadsIssue[];
  errors: ParseError[];
}

const VALID_STATUSES: BeadsStatus[] = ['open', 'in_progress', 'blocked', 'closed'];

/**
 * Parse a single line of JSONL into a BeadsIssue
 * Returns null if the line is empty or invalid JSON
 */
export function parseBeadsLine(line: string): BeadsIssue | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as BeadsIssue;
  } catch {
    return null;
  }
}

/**
 * Validate that a parsed object has all required BeadsIssue fields
 */
export function validateBeadsIssue(issue: BeadsIssue): boolean {
  if (!issue || typeof issue !== 'object') {
    return false;
  }

  // Required fields
  if (typeof issue.id !== 'string' || !issue.id) {
    return false;
  }

  if (typeof issue.title !== 'string' || !issue.title) {
    return false;
  }

  if (!VALID_STATUSES.includes(issue.status)) {
    return false;
  }

  if (typeof issue.created_at !== 'string' || !issue.created_at) {
    return false;
  }

  if (typeof issue.updated_at !== 'string' || !issue.updated_at) {
    return false;
  }

  return true;
}

/**
 * Parse a beads issues.jsonl file content
 * Returns valid issues and any parse errors encountered
 */
export function parseBeadsFile(content: string): ParseResult {
  const issues: BeadsIssue[] = [];
  const errors: ParseError[] = [];

  if (!content.trim()) {
    return { issues, errors };
  }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    const parsed = parseBeadsLine(line);

    if (parsed === null) {
      errors.push({
        line: lineNumber,
        content: line.substring(0, 100),
        error: 'Invalid JSON',
      });
      continue;
    }

    if (!validateBeadsIssue(parsed)) {
      errors.push({
        line: lineNumber,
        content: line.substring(0, 100),
        error: 'Missing required fields or invalid status',
      });
      continue;
    }

    issues.push(parsed);
  }

  return { issues, errors };
}
