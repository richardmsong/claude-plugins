# ADR: Dashboard uses unified docsRoot resolution

**Status**: accepted
**Status history**:
- 2026-04-24: accepted

## Overview

Replace the dashboard's `--docs-dir` flag and `findRepoRoot`-based DB path derivation with the same `--root` / `resolveDocsRoot` / `CLAUDE_PROJECT_DIR` priority chain used by docs-mcp. Both components derive docsRoot identically; the DB lives at `<docsRoot>/.agent/.docs-index.db`; the docs directory is always `<docsRoot>/docs/`.

## Motivation

The dashboard and MCP server index the same corpus but resolve paths differently. The MCP uses `--root` → `CLAUDE_PROJECT_DIR` → `cwd` (ADR-0048) and puts the DB at `<docsRoot>/.agent/.docs-index.db`. The dashboard uses `--docs-dir` for the docs directory and `<repoRoot>/.agent/.docs-index.db` for the DB. When `docsRoot != repoRoot` (e.g. `--root src/sdd`), they write to different DBs. This causes stale indexes and disk I/O errors from concurrent access to different files.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| docsRoot resolution | Import and call `resolveDocsRoot` from docs-mcp | Single implementation, identical behavior |
| CLI flag | Replace `--docs-dir` with `--root` | Same semantics as docs-mcp; `--docs-dir` is removed |
| DB path default | `<docsRoot>/.agent/.docs-index.db` | Matches docs-mcp; both share one DB when given the same root |
| git root | `findGitRoot(docsRoot)` (walk up from docsRoot) | Same as docs-mcp (ADR-0038) |
| `--db-path` override | Keep as-is | Explicit override still useful for testing |

## Impact

Updates `spec-dashboard.md` (Runtime, CLI Flags sections). Updates `spec-docs-mcp.md` (removes dashboard `--docs-dir` reference). Affects `docs-dashboard` component.

## Scope

- Dashboard `server.ts`: import `resolveDocsRoot` from docs-mcp, replace `--docs-dir` parsing and `findRepoRoot` with `--root` + `resolveDocsRoot` + `findGitRoot`
- Remove `findRepoRoot` from dashboard if no longer used
- DB path default changes from `<repoRoot>/.agent/` to `<docsRoot>/.agent/`
