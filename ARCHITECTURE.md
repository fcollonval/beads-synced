# Beads to GitHub Issues Syncer - Architecture Plan

## Overview

A GitHub Action that syncs issues from the [beads](https://github.com/steveyegge/beads) issue tracking system (stored in `beads/issues.jsonl`) to GitHub Issues. This is a **one-way sync** where beads is the source of truth and GitHub Issues serves as a read-only mirror.

## Goals

1. **Automatic Sync** - Create/update/close GitHub Issues when beads issues change
2. **One-Way Flow** - Beads is source of truth; GitHub is read-only mirror
3. **Idempotent** - Safe to run multiple times without creating duplicates
4. **Comment Sync** - Beads comments appear as GitHub issue comments
5. **Auditable** - Clear logs and mapping history

## Architecture Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Repository                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  beads/issues.jsonl        .beads-sync/mapping.json                │
│  (Source of truth for      (Beads ID ↔ GitHub Issue #              │
│   beads issues)             mapping table)                          │
│                                                                     │
└──────────────┬──────────────────────────────────┬───────────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────────┐      ┌──────────────────────────────────┐
│   GitHub Action Trigger   │      │     GitHub Issues API            │
│   - push to main         │      │     - Create issues              │
│   - workflow_dispatch    │      │     - Update issues              │
│   - schedule (cron)      │      │     - Close issues               │
│                          │      │     - Create comments            │
│                          │      │     - Manage labels              │
└──────────────┬───────────┘      └──────────────────────────────────┘
               │                                  ▲
               ▼                                  │
┌─────────────────────────────────────────────────┴───────────────────┐
│                         Sync Engine                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Parse beads/issues.jsonl                                       │
│  2. Load mapping from .beads-sync/mapping.json                     │
│  3. Diff current state vs GitHub Issues                            │
│  4. Apply changes (create/update/close issues)                     │
│  5. Sync comments (create new beads comments as GitHub comments)   │
│  6. Update mapping file                                            │
│  7. Commit mapping changes (if configured)                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Beads → GitHub (One-Way Sync)

```
1. Developer updates beads issue via `bd` CLI
2. `bd` exports to beads/issues.jsonl
3. Developer commits and pushes
4. GitHub Action triggers on push
5. Sync engine:
   a. Reads issues.jsonl
   b. Loads ID mapping
   c. Checks for external_ref fields pointing to existing GitHub issues
   d. For each beads issue:
      - Has external_ref (e.g., "gh-42") → Adopt existing GitHub issue
      - No mapping → Create GitHub Issue
      - Has mapping → Compare and update if changed
      - Beads status=closed → Close GitHub Issue with comment
   e. For deleted beads issues (in mapping but not in JSONL):
      → Close GitHub Issue with "deleted from beads" comment
   f. Sync new beads comments as GitHub issue comments
   g. Save updated mapping
```

## Key Design Decisions

### 1. ID Mapping Strategy

**Problem**: Beads uses hash IDs (`bd-a1b2`), GitHub uses sequential numbers.

**Solution**: Maintain a mapping file `.beads-sync/mapping.json`:

```json
{
  "version": 1,
  "mappings": {
    "bd-a1b2": {
      "github_issue_number": 42,
      "github_issue_id": 1234567890,
      "last_sync_at": "2025-11-25T14:56:49Z",
      "beads_updated_at": "2025-11-25T14:56:49Z",
      "adopted_from_external_ref": false,
      "comments": {
        "1": { "github_comment_id": 9876543210 },
        "2": { "github_comment_id": 9876543211 }
      }
    }
  },
  "sync_metadata": {
    "last_full_sync": "2025-11-25T15:00:00Z"
  }
}
```

**External Ref Handling**: If a beads issue has `external_ref: "gh-42"`, the syncer will:
1. Parse the GitHub issue number from the ref
2. Verify the issue exists in this repository
3. Adopt it into the mapping with `adopted_from_external_ref: true`
4. Begin syncing updates to that issue instead of creating a new one

### 2. Field Mapping

| Beads Field | GitHub Equivalent | Notes |
|-------------|-------------------|-------|
| `id` | Body footer | Store as reference link |
| `title` | Title | Direct mapping |
| `description` | Body (main section) | Markdown supported |
| `design` | Body (collapsible) | Under "Design" section |
| `acceptance_criteria` | Body (checklist) | Convert to task list |
| `notes` | Body (collapsible) | Under "Notes" section |
| `status` | State | `closed` → closed, else open |
| `priority` | Label | `priority:p0`, `priority:p1`, etc. |
| `issue_type` | Label | `type:bug`, `type:feature`, etc. |
| `assignee` | Assignee | Try to assign; skip with warning if invalid |
| `labels` | Labels | Direct mapping |
| `dependencies` | Body section | List with links to other GitHub issues |
| `dependencies` (parent-child) | Label | `epic:bd-xxx` label on child issues |
| `external_ref` | Body section | Shown if not self-referential |
| `close_reason` | Closing comment | Added when closing |
| `comments` | Issue comments | Each beads comment → GitHub comment |

### 3. GitHub Issue Body Template

```markdown
<!-- beads-sync:bd-a1b2 -->
> [!CAUTION]
> This issue is synced from beads. Do not edit directly—changes will be overwritten.
> To update, use `bd update bd-a1b2` in the source repository.

{description}

<details>
<summary>Acceptance Criteria</summary>

{acceptance_criteria as checklist}

</details>

<details>
<summary>Design Notes</summary>

{design}

</details>

<details>
<summary>Working Notes</summary>

{notes}

</details>

---

| Field | Value |
|-------|-------|
| **Beads ID** | `bd-a1b2` |
| **Dependencies** | #42 (blocks), #43 (related) |
| **Estimated Time** | 2h |
| **Assignee (beads)** | alice |
```

**Note**: Dependencies are rendered as links to the corresponding GitHub issues (using the mapping). If a dependency hasn't been synced yet, it shows the beads ID instead.

### 4. Sync Strategy (No Conflicts)

Since this is a **one-way sync**, there are no conflicts to resolve:
- Beads is always the source of truth
- GitHub issues are overwritten on each sync
- Any manual edits to GitHub issues will be overwritten
- A warning banner in the issue body reminds users not to edit directly

**Deletion Handling**:
- When a beads issue is deleted (present in mapping but not in JSONL)
- The corresponding GitHub issue is **closed** (not deleted)
- A comment is added: "This issue was deleted from beads tracking"
- Preserves history and is reversible

### 5. Label Management

Auto-create labels if they don't exist:
- `priority:p0` (red), `priority:p1` (orange), `priority:p2` (yellow), `priority:p3` (blue), `priority:p4` (gray)
- `type:bug` (red), `type:feature` (green), `type:task` (blue), `type:epic` (purple), `type:chore` (gray)
- `beads-synced` (marker label for synced issues)
- `beads-blocked` (for issues with open blockers)
- `epic:bd-xxx` (dynamically created for parent-child relationships)

**Epic Labels**: When a beads issue has a `parent-child` dependency, the child issue gets an `epic:bd-xxx` label (where `bd-xxx` is the parent's beads ID). This allows filtering all issues belonging to an epic.

## Implementation Plan

### Phase 1: Core Sync Engine

1. **Parser Module** (`src/parser.ts`)
   - Read and parse `beads/issues.jsonl`
   - Validate issue schema
   - Handle malformed entries gracefully

2. **Mapper Module** (`src/mapper.ts`)
   - Load/save mapping file
   - CRUD operations on mappings
   - Track comment ID mappings
   - Migration support for schema changes

3. **GitHub Client Module** (`src/github.ts`)
   - Wrapper around `@octokit/rest`
   - Create/update/close issues
   - Create issue comments
   - Label management
   - Assignee validation (skip invalid with warning)
   - Rate limit handling with exponential backoff

4. **Diff Engine** (`src/diff.ts`)
   - Compare beads issues to GitHub issues
   - Generate list of actions (create/update/close)
   - Detect new comments to sync
   - Handle external_ref adoption

5. **Sync Orchestrator** (`src/sync.ts`)
   - Coordinate the sync process
   - Apply changes in correct order
   - Handle deletions (close with comment)
   - Handle errors gracefully (continue on single issue failure)

6. **Template Module** (`src/template.ts`)
   - Generate issue body from beads fields
   - Include "do not edit" warning banner
   - Render dependencies as links
   - Collapsible sections for design/notes

7. **GitHub Action Workflow** (`.github/workflows/beads-sync.yml`)
   - Trigger configuration
   - Environment setup
   - Secrets management

### Phase 2: Polish & Reliability

1. **Dry Run Mode** - Preview changes without applying
2. **Selective Sync** - Filter by labels, status, priority
3. **Better Error Reporting** - Detailed logs, summary output
4. **Retry Logic** - Handle transient GitHub API failures

### Phase 3: Advanced Features (Future)

1. **Dependency Visualization** - Mermaid diagram in issue body
2. **Metrics/Summary** - PR comment with sync statistics
3. **Webhook Mode** - Real-time sync (if needed)

## Project Structure

```
beads-syncer/
├── .github/
│   └── workflows/
│       └── beads-sync.yml       # Main workflow
├── src/
│   ├── index.ts                 # Entry point
│   ├── parser.ts                # JSONL parser
│   ├── mapper.ts                # ID mapping (issues + comments)
│   ├── github.ts                # GitHub API client
│   ├── diff.ts                  # Diff engine
│   ├── sync.ts                  # Sync orchestrator
│   ├── template.ts              # Issue body templating
│   ├── labels.ts                # Label management
│   ├── comments.ts              # Comment sync logic
│   └── types.ts                 # TypeScript types
├── __tests__/                   # Test files
│   ├── parser.test.ts
│   ├── mapper.test.ts
│   ├── diff.test.ts
│   └── template.test.ts
├── action.yml                   # GitHub Action metadata
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration Options

```yaml
# In repository's workflow file
- uses: your-org/beads-syncer@v1
  with:
    # Required
    github-token: ${{ secrets.GITHUB_TOKEN }}

    # Optional - paths
    beads-file: 'beads/issues.jsonl'         # Default
    mapping-file: '.beads-sync/mapping.json' # Default

    # Optional - sync behavior
    dry-run: false                           # Preview without making changes
    sync-comments: true                      # Sync beads comments to GitHub

    # Optional - filtering
    sync-statuses: 'open,in_progress,blocked,closed'  # Which statuses to sync
    sync-priorities: '0,1,2,3,4'             # Which priorities to sync
    sync-labels: ''                          # Filter by beads labels (comma-separated)

    # Optional - GitHub issue settings
    label-prefix: ''                         # Prefix for auto-created labels
    add-sync-marker: true                    # Add 'beads-synced' label
    close-deleted: true                      # Close GitHub issues when beads issue deleted

    # Optional - mapping file commit
    auto-commit-mapping: true                # Commit mapping file changes
    commit-message: 'chore(beads-sync): update issue mapping'
```

## Security Considerations

1. **Token Permissions**: Minimal required scopes
   - `issues: write` - Create/update issues
   - `contents: write` - Update mapping file (if auto-commit)

2. **Input Validation**: Sanitize all beads content before creating GitHub issues

3. **Rate Limiting**: Respect GitHub API limits, implement exponential backoff

4. **Secrets**: Never log tokens or sensitive data

## Error Handling

1. **Malformed JSONL**: Skip invalid lines, log warnings
2. **API Failures**: Retry with backoff, fail gracefully
3. **Mapping Conflicts**: Log and continue, don't block entire sync
4. **Missing Permissions**: Clear error messages with required scopes

## Testing Strategy

1. **Unit Tests**: Parser, mapper, diff engine
2. **Integration Tests**: GitHub API interactions (mocked)
3. **E2E Tests**: Full sync flow with test repository
4. **Snapshot Tests**: Issue body template rendering

## Rollout Plan

1. **Alpha**: Internal testing with single repository
2. **Beta**: Select users, gather feedback
3. **GA**: Public release with documentation

## Resolved Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Deletions** | Close with comment | Preserves history, reversible, doesn't require admin permissions |
| **Comments** | Sync to GitHub comments | Full parity between systems; each beads comment becomes a GitHub comment |
| **Reactions** | No sync | Beads doesn't have a reactions field; keep it simple |
| **Projects** | No integration | Keep scope manageable; users can manually add to projects |
| **Milestones** | Use labels instead | `epic:bd-xxx` labels on child issues; simpler than milestone management |
| **Sync direction** | Beads → GitHub only | One-way sync eliminates conflicts; beads is source of truth |
| **Assignees** | Skip invalid with warning | Try to assign; if username doesn't exist on GitHub, log warning and continue |
| **External refs** | Honor existing | If `external_ref: "gh-42"` exists, adopt that issue instead of creating new |
| **Cross-repo** | Same repo only | Simpler permissions; issues stay in the same repo as beads files |

## Success Metrics

- Sync latency < 30 seconds from push
- Zero duplicate issues created
- 99%+ sync success rate
- Clear audit trail for all changes
