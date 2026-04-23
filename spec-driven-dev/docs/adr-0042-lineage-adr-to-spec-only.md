# ADR: Lineage edges restricted to ADR↔spec pairs

**Status**: accepted
**Status history**:
- 2026-04-23: accepted — paired with spec-docs-mcp.md

## Overview

Restrict the lineage scanner to only emit edges where at least one side is an ADR. Spec↔spec co-commit edges are filtered out. This makes the lineage model answer "which ADR shaped this spec section?" without noise from unrelated spec co-edits.

## Motivation

The lineage system's purpose is decision provenance: tracing which ADR decisions shaped each spec section. When two specs are edited in the same commit (e.g., during a broad refactor), the scanner currently creates spec↔spec edges that are meaningless — they don't convey any decision. These edges dilute the signal in `get_lineage` results and in the dashboard's lineage graph and popovers.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Filter location | In `processCommitForLineage`, skip pairs where neither file is an ADR | Simple, single-point filter. The category is derivable from the file path (`adr-*.md`). No DB schema change needed. |
| Category detection | Check if filename matches `adr-*.md` pattern | Consistent with how `content-indexer.ts` classifies documents. No need to query the DB for category. |
| Existing spec↔spec rows | Leave them in the DB; they'll age out naturally as the scanner only adds new edges going forward. Optionally, a one-time cleanup DELETE can be run. | Simpler than a migration. Old edges don't cause correctness issues — just noise. |

## Impact

- `docs/mclaude-docs-mcp/spec-docs-mcp.md` — update Lineage scanner section to document the ADR↔spec filter.
- `docs-mcp/src/lineage-scanner.ts` — add category filter in `processCommitForLineage`.

## Scope

- Filter new lineage edges to ADR↔spec pairs only.
- Optionally clean up existing spec↔spec rows (not required).
