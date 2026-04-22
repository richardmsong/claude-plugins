# ADR: `--docs-dir` CLI flag for docs-dashboard

**Status**: implemented
**Status history**:
- 2026-04-22: accepted
- 2026-04-22: implemented — all scope CLEAN

## Overview

The docs-dashboard server gains a `--docs-dir <path>` CLI flag that overrides the default `docs/` directory location. The flag is threaded through `parseArgs → boot → indexAllDocs / startWatcher` so the dashboard can index a docs directory that is not at `<repoRoot>/docs/`.

## Motivation

After extracting the `spec-driven-dev` plugin from the mclaude monorepo into its own repository (claude-plugins), the docs directory lives at `spec-driven-dev/docs/` relative to the repo root — not `<repoRoot>/docs/`. The dashboard's `boot()` function hardcodes `const docsDir = join(repoRoot, "docs")`, so running the dashboard from anywhere inside the new repo produces `[docs-mcp] docs/ directory not found` and an empty index.

The same issue affects any repository where the docs corpus is not at the repo root. A `--docs-dir` flag makes the dashboard portable across repo layouts.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Flag name | `--docs-dir <path>` | Parallel to existing `--db-path` and `--port`. Descriptive. |
| Default behavior | When omitted, fall back to `join(repoRoot, "docs")` (unchanged). | Backwards compatible — existing repos with `docs/` at root need no flag. |
| Path resolution | Resolved relative to `cwd`, then checked for existence. Absolute paths also accepted. | Consistent with how `--db-path` works. |
| Threading | `parseArgs` returns `docsDir: string | null`; `boot()` accepts it as a parameter; `boot()` resolves the default if null. | Minimal change surface — `boot()` already accepts `dbPath` the same way. |

## Impact

- `docs/mclaude-docs-mcp/spec-docs-mcp.md` — update the Watcher and Content indexer sections to clarify that `docsDir` is a parameter, not hardcoded.
- `mclaude-docs-dashboard/src/server.ts` — `parseArgs` gains `--docs-dir`.
- `mclaude-docs-dashboard/src/boot.ts` — `boot()` signature gains `docsDir: string | null` parameter.

## Scope

**In:** `--docs-dir` flag, threaded through boot, with sensible default.

**Deferred:** auto-discovery of `docs/` in subdirectories, config file for defaults.
