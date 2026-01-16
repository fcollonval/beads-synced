# Beads to GitHub Issues Syncer

A GitHub Action that syncs issues from the [beads](https://github.com/steveyegge/beads) issue tracking system to GitHub Issues. This is a **one-way sync** where beads is the source of truth and GitHub Issues serves as a read-only mirror.

## Features

- **Automatic Sync** - Creates, updates, and closes GitHub Issues when beads issues change
- **One-Way Flow** - Beads is source of truth; GitHub is read-only mirror
- **Idempotent** - Safe to run multiple times without creating duplicates
- **Comment Sync** - Beads comments appear as GitHub issue comments
- **External Ref Adoption** - Adopt existing GitHub issues via `external_ref: "gh-42"`
- **Label Management** - Auto-creates priority, type, and epic labels
- **Dry Run Mode** - Preview changes without applying them

## Quick Start

1. Add the workflow to your repository:

```yaml
# .github/workflows/beads-sync.yml
name: Sync Beads to GitHub Issues

on:
  push:
    branches: [beads-sync]  # Use the branch used for beads synchronization
    paths: ['.beads/issues.jsonl']
  workflow_dispatch:

permissions:
  issues: write
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: fcollonval/beads-synced@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

2. Ensure your beads issues are exported to `beads/issues.jsonl`

3. Push to main - the action will sync your issues to GitHub Issues

## Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `github-token` | GitHub token for API access | **required** |
| `beads-file` | Path to beads issues.jsonl file | `.beads/issues.jsonl` |
| `dry-run` | Preview changes without applying | `false` |
| `sync-comments` | Sync beads comments to GitHub | `true` |
| `sync-statuses` | Which statuses to sync (comma-separated) | `open,in_progress,blocked,closed` |
| `sync-priorities` | Which priorities to sync (comma-separated) | `0,1,2,3,4` |
| `sync-labels` | Filter by beads labels (comma-separated) | `` |
| `label-prefix` | Prefix for auto-created labels | `` |
| `add-sync-marker` | Add `beads-synced` label to issues | `true` |
| `close-deleted` | Close GitHub issues when beads issue deleted | `true` |

## How It Works

```
beads/issues.jsonl  ──►  Sync Engine  ──►  GitHub Issues
        │                     │                   │
        │                     ▼                   │
        │         (beads ID ↔ GitHub #)           │
        └─────────────────────────────────────────┘
```

1. Parse `.beads/issues.jsonl`
3. Compute diff (what needs to be created/updated/closed)
4. Apply changes to GitHub Issues
5. Sync new comments
6. Save updated mapping

## Field Mapping

| Beads Field | GitHub Equivalent |
|-------------|-------------------|
| `title` | Issue title |
| `description` | Issue body (main section) |
| `design` | Collapsible "Design Notes" section |
| `acceptance_criteria` | Checklist in collapsible section |
| `notes` | Collapsible "Working Notes" section |
| `status` | Issue state (`closed` → closed, else open) |
| `priority` | Label (`priority:p0` through `priority:p4`) |
| `issue_type` | Label (`type:bug`, `type:feature`, etc.) |
| `assignee` | GitHub assignee (validated, warns if invalid) |
| `labels` | GitHub labels |
| `dependencies` | Listed in issue body with links |
| `comments` | GitHub issue comments |

## Labels

The action auto-creates these labels if they don't exist:

**Priority:**
- `priority:p0` (red) - Critical
- `priority:p1` (orange) - High
- `priority:p2` (yellow) - Medium
- `priority:p3` (green) - Low
- `priority:p4` (gray) - Minimal

**Type:**
- `type:bug` (red)
- `type:feature` (green)
- `type:task` (blue)
- `type:epic` (purple)
- `type:chore` (gray)

**Special:**
- `beads-synced` - Marks synced issues
- `beads-blocked` - Issues with `status: blocked`
- `epic:bd-xxx` - Child issues of an epic

## Adopting Existing Issues

If a beads issue has `external_ref: "gh-42"`, the syncer will adopt GitHub issue #42 instead of creating a new one:

```jsonl
{"id": "bd-abc", "title": "My Issue", "external_ref": "gh-42", ...}
```

This is useful when migrating existing GitHub issues to beads tracking.

## Issue Body Format

Synced issues include a warning banner:

```markdown
> [!CAUTION]
> This issue is synced from beads. Do not edit directly—changes will be overwritten.
> To update, use `bd update bd-abc` in the source repository.
```

## Outputs

| Output | Description |
|--------|-------------|
| `created` | Number of issues created |
| `updated` | Number of issues updated |
| `closed` | Number of issues closed |
| `comments-synced` | Number of comments synced |

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Package for distribution
npm run package
```

## License

MIT
