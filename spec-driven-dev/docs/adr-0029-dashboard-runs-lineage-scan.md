# ADR: Dashboard Boot Runs `runLineageScan`

**Status**: accepted
**Status history**:
- 2026-04-21: accepted

## Overview

`mclaude-docs-dashboard`'s boot sequence now runs `runLineageScan(db, repoRoot)` after `indexAllDocs` and before `startWatcher`. This makes the dashboard self-sufficient: it populates its own lineage data from `git log` regardless of whether `mclaude-docs-mcp` has ever been launched against the same DB.

## Motivation

Observed while browsing `/specs/...` in the dashboard: every spec showed **zero co-committed sections** in its H2 hover popovers, and the graph rendered nodes with no edges. Root cause: `SELECT COUNT(*) FROM lineage` returned 0.

The dashboard's boot sequence (`mclaude-docs-dashboard/src/boot.ts`) ran `indexAllDocs` but never ran `runLineageScan`. Lineage is populated lazily by the docs-mcp server on *its* boot (per `docs/mclaude-docs-mcp/spec-docs-mcp.md`). Because the user launched the dashboard standalone without ever running the MCP server, the `lineage` table stayed empty and every lineage-derived view rendered as if the corpus had no co-commits.

The dashboard cannot rely on docs-mcp having run — they are independent entry points into the same shared DB, and both must be capable of bootstrapping the index from scratch.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Who populates `lineage`? | Both dashboard and docs-mcp run `runLineageScan` on boot. | Each entry point must leave the DB in a fully-indexed state for its own UI. The scanner is idempotent (resumes from `metadata.last_lineage_commit`), so running both is cheap. |
| Order within boot | `indexAllDocs` → `runLineageScan` → `startWatcher` | Mirrors the docs-mcp boot order from `docs/mclaude-docs-mcp/spec-docs-mcp.md` § Runtime, so both entry points produce identical DB state. |
| Failure policy | Catch-and-log, non-fatal (same policy as `indexAllDocs` already uses). | The dashboard is still useful without lineage edges (it can list docs and render markdown). Crashing on a git error would be worse than degrading. |
| Watcher re-scan on HEAD advance | Unchanged — `startWatcher` already detects HEAD advance and re-runs the scanner. | Already specified. This ADR only adds the initial scan. |

## Impact

- `docs/mclaude-docs-dashboard/spec-dashboard.md` — Runtime § is updated to add `runLineageScan` to the boot sequence.
- `mclaude-docs-dashboard/src/boot.ts` — calls `runLineageScan` between `indexAllDocs` and `startWatcher`.
- New import from `mclaude-docs-mcp/lineage-scanner` (the subpath already exists in docs-mcp's `exports` map, so no change is needed there).
- No change to docs-mcp, no change to the DB schema, no change to the scanner itself.

## Scope

**In:** add the initial scan to dashboard boot; update spec.

**Deferred:** Nothing — this is a surgical fix.
