# ADR: LineagePopover Collapses Rows by Doc

**Status**: implemented
**Status history**:
- 2026-04-21: accepted
- 2026-04-22: implemented — retroactive promotion, all scope verified

## Overview

The dashboard's `LineagePopover` now renders one row per co-committed document, summing `commit_count` and taking `MAX(last_commit)` across every heading of that document that appeared in the raw `/api/lineage` response. The reader sees "which ADRs shaped this spec section," not "every heading within every ADR that happened to be edited in the same commit." The underlying `/api/lineage` endpoint is unchanged — it still returns section-granular `LineageResult[]` from docs-mcp's `get_lineage`. The collapse is a pure presentation concern.

## Motivation

Observed on a running dashboard: hovering the `≡` icon on a spec H2 produced a popover with multiple entries from the same ADR — each corresponding to a different H2 inside that ADR that had also been touched by the shared commit. The reader-level question the popover answers is "which ADRs led to this section?" — the per-heading expansion dilutes that with N-way fanout that means nothing to a human scanning the list.

Collapsing at the popover level (rather than changing `/api/lineage`) keeps the dashboard's section-level JSON aligned with docs-mcp's `get_lineage` tool contract. Agents calling the MCP tool get the full resolution they need; humans using the popover get the aggregated answer they want. The section-level detail remains representable in the UI — a future disclosure inside the popover, a dedicated "lineage drill-down" view, or any other surface can consume the same `/api/lineage` response. This ADR deliberately does not drop resolution at the data layer; it only hides it at this one presentation surface.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to collapse | Client-side in `LineagePopover`. `/api/lineage` response shape and the `getLineage` tool shape are unchanged. | Preserves parity with docs-mcp's tool-facing contract. The dashboard is free to shape its own presentation. |
| Collapse key | `(section_b_doc)` — the other document's path. | "Which *document* shaped this section" is the reader-level question. Heading of the other document is not useful here. |
| Aggregation | `count = SUM(commit_count)` and `last_commit = MAX by commit date`. Because docs-mcp's `LineageResult` does not carry a commit date, take `last_commit` from the row with the highest `commit_count` as a proxy (ties: the first row in the response). If all rows share one `commit_count`, the first row's `last_commit` wins. | `commit_count` is monotonic with recency only in a rough sense, but it is what the popover already sorts by and what docs-mcp exposes. Revisit if users complain. |
| Sort order | Unchanged — descending by collapsed `count`. | Matches existing popover ordering; the most-relevant ADR stays on top. |
| Row click target | `#/adr/<slug>` or `#/spec/<path>` — no `§heading` anchor. | The row no longer identifies a single heading. Landing on the doc's top is the predictable behaviour. |
| Status framing | Unchanged — rows whose doc is `superseded`/`withdrawn` render muted; `draft` renders dashed. | Status is per-doc, so the framing still works after the collapse. |
| Final row | Unchanged — "Open graph centered here" still appears. | Graph centring is on the *current* doc+heading; the collapse does not affect it. |

## Impact

- `docs/mclaude-docs-dashboard/spec-dashboard.md` — the LineagePopover § is updated in this commit to describe per-doc rows and the collapse algorithm.
- `mclaude-docs-dashboard/ui/src/components/LineagePopover.tsx` — collapses the `LineageResult[]` response by `section_b_doc` before rendering, sums `count`, picks `last_commit`, and drops the `§heading` from row text + href.
- No change to `/api/lineage`, no change to docs-mcp, no change to the DB schema, no change to the graph — only `LineagePopover` is touched.

## Scope

**In:** presentation-level collapse in `LineagePopover`.

**Deferred:** adding `commit_date` to `LineageResult` (docs-mcp change — out of scope for a UX tweak); exposing per-heading details via a "details" disclosure; keyboard navigation through collapsed rows.
