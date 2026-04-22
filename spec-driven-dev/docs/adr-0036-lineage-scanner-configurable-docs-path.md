# ADR: Lineage scanner accepts configurable docs path

**Status**: accepted
**Status history**:
- 2026-04-22: accepted

## Overview

The lineage scanner (`src/lineage-scanner.ts`) hardcodes `docs/*.md` as the git pathspec in every git command (`git log`, `git diff-tree`, `git diff`) and in the `parseDiffHunks` filter. When docs live in a subdirectory (e.g. `spec-driven-dev/docs/`), the scanner finds zero commits and produces zero lineage edges. This ADR adds a `docsDir` parameter to `runLineageScan` so the scanner uses the correct repo-root-relative path.

## Motivation

After extracting the `spec-driven-dev` plugin to its own repo, docs live at `spec-driven-dev/docs/` relative to the git root. ADR-0032 made the docs directory configurable for the dashboard and indexer, but the lineage scanner was missed. The dashboard shows zero lineage for all docs — the `≡` hover produces no results because the scanner never found any co-committed docs.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scanner signature | `runLineageScan(db, repoRoot, docsDir)` — add `docsDir: string` as third parameter. `docsDir` is the absolute path to the docs directory (same value passed to `indexAllDocs` and `startWatcher`). | Consistent with how the indexer and watcher already accept `docsDir`. |
| Derive git pathspec | Compute `relDocsDir = relative(repoRoot, docsDir)` to get the repo-root-relative path (e.g. `spec-driven-dev/docs`). Use `${relDocsDir}/*.md` as the git pathspec in all git commands. | Git pathspecs are relative to repo root. The scanner runs git from `repoRoot` as cwd. |
| `getModifiedDocFiles` filter | Change `f.startsWith("docs/")` to `f.startsWith(relDocsDir + "/")` (or `f.startsWith(relDocsDir)` when relDocsDir has trailing slash). | The filter must match the pathspec. |
| `parseDiffHunks` filter | Change `currentFile.startsWith("docs/")` to `currentFile.startsWith(relDocsDir + "/")`. | Same reason — hunks outside the docs dir should be ignored. |
| Callers | MCP entrypoint (`src/index.ts`) passes `docsDir` to `runLineageScan`. Dashboard `boot.ts` already resolves `docsDir` and passes it to `startWatcher` which calls `runLineageScan` — thread `docsDir` through. Watcher's `runReindex` also calls `runLineageScan` — thread `docsDir` there too. | All three call sites need the correct path. |
| Default behavior | When `docsDir` resolves to `<repoRoot>/docs`, the pathspec is `docs/*.md` — identical to current behavior. No breaking change for repos with standard layout. | Backwards compatible. |

## Impact

- `docs/mclaude-docs-mcp/spec-docs-mcp.md` — update Lineage scanner section to document the `docsDir` parameter and repo-root-relative pathspec derivation.
- `docs-mcp/src/lineage-scanner.ts` — add `docsDir` param to `runLineageScan`, `getModifiedDocFiles`, `getCommitDiffHunks`, `parseDiffHunks`; replace hardcoded `docs/` with derived relative path.
- `docs-mcp/src/index.ts` — pass `docsDir` to `runLineageScan`.
- `docs-mcp/src/watcher.ts` — pass `docsDir` to `runLineageScan`.
- `docs-mcp/tests/lineage-scanner.test.ts` — update tests to pass `docsDir`.

## Scope

**In:** Thread `docsDir` through the lineage scanner and all callers.
**Deferred:** Making the MCP server's own docs dir configurable via `--docs-dir` (currently hardcoded to `<repoRoot>/docs/` in `index.ts`; dashboard-only per ADR-0032).
