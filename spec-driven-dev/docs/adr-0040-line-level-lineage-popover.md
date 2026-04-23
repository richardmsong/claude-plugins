# ADR: Line-level lineage popover

**Status**: implemented
**Status history**:
- 2026-04-22: draft
- 2026-04-22: accepted — paired with spec-dashboard.md, spec-docs-mcp.md
- 2026-04-23: implemented — all scope CLEAN

## Overview

Extend the docs dashboard so that hovering over any rendered block (paragraph, heading, list item, table row, code block) in a spec or ADR detail view highlights the block and shows a popover with ADR lineage information for the source lines that produced that block. Currently lineage popovers only appear on H2 headings via the `≡` icon; this brings lineage to every part of the document.

## Motivation

The current H2-level popover answers "which ADRs shaped this section?" but sections can span dozens of lines with different histories. When reviewing a spec, the user wants to know *why a specific line exists* — which ADR introduced it, and what other docs were co-modified in the same commit. This surfaces git-blame-level attribution joined with the existing lineage data, directly in the dashboard UI.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data source | `git blame --porcelain` per file, joined with lineage data | Blame provides line-to-commit mapping. The lineage table provides commit-to-ADR co-modification data. Joining them answers "which ADRs shaped this line." |
| Popover content | ADR information per block — which ADRs were co-committed with the commit(s) that last touched the source lines of this block | The user wants ADR context, not raw commit metadata. Author/date/summary are secondary; the primary value is "this line exists because of ADR-0030." |
| Popover trigger | Hover with highlight — hovering a rendered block highlights it visually, and after a short debounce the popover appears | The highlight gives immediate feedback that the block is interactive. No extra icons needed — the highlight IS the affordance. |
| Storage | SQLite `blame` table, rebuilt whenever docs change | The watcher already fires on file changes. Blame data is recomputed for changed files and stored in the DB. This makes the API a simple SELECT, not a git subprocess per request. The existing DB is already the central cache for all doc data. |
| Unstaged/working copy | If a file has uncommitted changes, blame the committed lines normally; new/modified lines (not yet committed) inherit the lineage of their containing H2 section | The user said "if the file is in the working copy, still show lineage." Uncommitted lines can't have blame data, but they belong to a section that has lineage. Fall back to section-level lineage for uncommitted content. |
| Line mapping | Block-level attribution — each rendered markdown block (paragraph, list item, table row, heading, code block) maps to a source line range | Perfect per-character line mapping is impossible after markdown rendering. Block-level is correct for all constructs. The markdown parser already tracks line numbers per section — extend it to track per block. |
| API endpoint | `GET /api/blame?doc=<path>[&since=<date>&ref=<branch>]` returning per-block blame+lineage data | One call per doc view. Client caches the response and looks up the hovered block locally. Optional `since` and `ref` params enable range-filtered blame. |
| Inline diff | Clicking an ADR entry in the popover expands to show the diff hunk from that commit for the current block's lines | Shows exactly what changed — the user sees the before/after without leaving the dashboard. Uses `git show <commit> -- <file>` filtered to the relevant line range. |
| Blame gutter | VS Code-style gutter on the left margin of the rendered doc showing abbreviated commit + author per line | Always visible, gives at-a-glance attribution. Hovering a gutter entry opens the full popover. Groups consecutive lines with the same commit into a single gutter annotation. |
| Range filter | UI control (dropdown or date picker) to filter blame to a time range or branch | Answers "what changed since last week?" or "what changed on this branch vs main?" Passes `since`/`ref` params to the blame API. |

## User Flow

### Blame gutter (always visible)
1. User opens a spec or ADR detail page in the dashboard.
2. A blame gutter appears on the left margin of the rendered content. Each gutter annotation shows an abbreviated commit hash and author name. Consecutive lines from the same commit are grouped into a single annotation spanning those lines.
3. Hovering a gutter annotation highlights the corresponding block(s) and opens the popover.

### Block hover + popover
4. User moves the mouse over any rendered block (paragraph, list item, heading, etc.).
5. The block highlights (subtle background color change) indicating it's interactive.
6. After ~300ms debounce, a popover appears near the block showing:
   - The ADR(s) whose commits last touched those source lines, with title and status badge.
   - Commit date and author as secondary info.
   - If the block is uncommitted/modified: section-level lineage with a "(working copy)" indicator.
7. User can click to pin the popover (same pin/dismiss as existing LineagePopover).
8. Moving to another block dismisses the unpinned popover and highlights the new block.
9. Esc or click-outside dismisses a pinned popover.

### Inline diff (from pinned popover)
10. In a pinned popover, each ADR entry has an expand toggle.
11. Clicking it shows the diff hunk from that commit for the current block's lines — a before/after view rendered inline in the popover.

### Range filter
12. A dropdown/date picker at the top of the detail page allows filtering blame to a time range (e.g., "since 2026-04-01") or a branch (e.g., "changes on this branch vs main").
13. The gutter and popovers update to reflect the filtered blame data. Lines untouched in the selected range have no gutter annotation and no popover.

## Component Changes

### docs-dashboard (backend — server.ts / routes.ts)
- New `GET /api/blame?doc=<path>[&since=<date>&ref=<branch>]` endpoint.
  - Reads blame data from the `blame_lines` table.
  - Self-joins `blame_lines` on commit hash to find ADR docs that share the same commit — i.e., "which ADRs were modified in the same commit that last touched this line?"
  - When `since` or `ref` params are provided, runs `git blame --since=<date>` or `git blame <ref> -- <file>` instead of reading from the cached table (range-filtered blame is computed on demand, not cached).
  - Returns structured JSON grouped by source line ranges (blocks).
- New `GET /api/diff?doc=<path>&commit=<hash>&line_start=<n>&line_end=<n>` endpoint.
  - Runs `git show <commit> -- <file>` and extracts the diff hunks overlapping the requested line range.
  - Returns unified diff text for rendering in the popover.
- Blame recomputation integrated into the watcher's reindex callback — when a doc changes, re-run `git blame` for that file and update the `blame_lines` table.

### docs-dashboard (frontend — UI)
- New `LineBlamePopover` component showing ADR lineage per block, with expandable inline diff.
- New `BlameGutter` component rendering a left-margin gutter with commit annotations per line group.
- New `BlameRangeFilter` component — dropdown/date picker for `since` and `ref` params.
- `MarkdownView` extended:
  - Markdown renderer emits `data-line-start` / `data-line-end` attributes on each rendered block element.
  - After render, attach hover listeners that highlight the block and trigger the popover.
  - Renders `BlameGutter` alongside the markdown content.
- Blame data fetched once per doc view via `/api/blame?doc=<path>`, cached in component state. Refetched when range filter changes.

### docs-mcp
- New `blame_lines` table added to the shared SQLite schema (schema version bump).
- `git blame` parsing logic added (new `blame-scanner.ts`).

## Data Model

### New SQLite table: `blame_lines`

| Column       | Type    | Notes |
|--------------|---------|-------|
| `id`         | INTEGER | Primary key |
| `doc_id`     | INTEGER | FK → `documents.id`, ON DELETE CASCADE |
| `line_start` | INTEGER | 1-based start line in source markdown |
| `line_end`   | INTEGER | 1-based end line (for multi-line blocks) |
| `commit`     | TEXT    | Full commit hash from git blame |
| `author`     | TEXT    | Author name |
| `date`       | TEXT    | ISO date (YYYY-MM-DD) |
| `summary`    | TEXT    | First line of commit message |

Index: `(doc_id, line_start)` for fast range lookups.

### API response shape

```ts
interface BlameBlock {
  line_start: number;
  line_end: number;
  commit: string;
  author: string;
  date: string;
  summary: string;
  adrs: {                    // ADRs co-modified in the same commit
    doc_path: string;
    title: string | null;
    status: string | null;
  }[];
}

// GET /api/blame?doc=<path>[&since=<date>&ref=<branch>]
interface BlameResponse {
  blocks: BlameBlock[];
  uncommitted_lines: number[];  // line numbers with no blame (working copy)
}

// GET /api/diff?doc=<path>&commit=<hash>&line_start=<n>&line_end=<n>
interface DiffResponse {
  diff: string;              // unified diff text for the requested line range
}
```

## Error Handling

- File not in git history (new/untracked) -> return empty blocks + all lines as uncommitted. UI shows section-level lineage for every block.
- Git not available -> blame endpoint returns empty response. UI falls back to section-level lineage only (existing behavior).
- Blame table missing (old schema) -> `openDb` detects version mismatch and rebuilds.

## Security

No new auth surfaces — the dashboard is local-only (localhost). Blame data is derived from the local git repo.

## Impact

- `docs/mclaude-docs-dashboard/spec-dashboard.md` — add LineBlamePopover section, update MarkdownView section.
- `docs/mclaude-docs-mcp/spec-docs-mcp.md` — add `blame_lines` table to Data store section, document blame scanning.
- `docs-dashboard/src/routes.ts` — new blame endpoint.
- `docs-dashboard/ui/src/components/` — new LineBlamePopover component.
- `docs-dashboard/ui/src/components/MarkdownView.tsx` — block-level line attribution and hover.
- `docs-mcp/src/db.ts` — schema version bump, `blame_lines` table.
- `docs-mcp/src/` — blame scanning logic (new file or extension).

## Scope

**In scope:**
- `blame_lines` table populated via `git blame --porcelain`, rebuilt on file change.
- `/api/blame` endpoint joining blame + lineage to return ADR info per block.
- Block-level hover highlight + popover in the dashboard UI.
- Uncommitted lines fall back to section-level lineage.
- Pin/dismiss behavior matching existing popover.
- Inline diff view — clicking a block's popover entry expands to show what changed in the commit that touched this block.
- Per-line gutter annotations (VS Code style) — a blame gutter on the left margin showing commit hash + author per line, with the popover on hover.
- Blame across git ranges — ability to filter blame to a specific range (e.g., "changes since last week" or "changes on this branch").

## Open questions

(none — all resolved)

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| docs-mcp (schema + blame scanner) | ~200 | 100k | New `blame_lines` table, `blame-scanner.ts`, watcher integration |
| docs-dashboard backend (blame + diff endpoints) | ~150 | 80k | Two new routes, self-join query, git show for inline diff, range params |
| docs-dashboard frontend (BlameGutter) | ~200 | 100k | Gutter component, line grouping, commit annotation rendering |
| docs-dashboard frontend (LineBlamePopover + inline diff) | ~250 | 100k | Popover component, ADR display, expandable diff view |
| docs-dashboard frontend (MarkdownView + BlameRangeFilter) | ~200 | 100k | Block attribution, hover handlers, range filter dropdown |

**Total estimated tokens:** ~480k
**Estimated wall-clock:** 45-60 min
