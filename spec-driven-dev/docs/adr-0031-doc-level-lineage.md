# ADR: Doc-Level Lineage

**Status**: implemented
**Status history**:
- 2026-04-21: accepted
- 2026-04-22: implemented — retroactive promotion, all scope verified

## Overview

`get_lineage` (docs-mcp tool), `/api/lineage` (dashboard HTTP endpoint), and the dashboard UI all now accept a document path alone — with no heading — and return or display one row per co-committed document, aggregated across every section of the queried doc. The reader or agent can now ask "which ADRs shaped this whole spec?" without iterating every H2 heading. Per-heading lineage (existing behaviour) is unchanged; doc-level lineage is an additive mode selected by omitting the heading.

## Motivation

The user observed, while browsing a spec in the dashboard, that lineage was reachable only per H2 heading. The doc-level question — "which ADRs shaped this spec as a whole?" — required mentally unioning the per-section popovers. For specs with ~10 H2 sections, each tied to a handful of ADRs, this is not a task a human should do.

ADR-0030 already collapsed the per-heading popover rows by co-committed document. This ADR takes the logical next step: let the user ask the collapsed question at the document level.

The same question is useful for agents. An agent summarising a spec's provenance currently has to call `get_lineage` once per H2 heading and dedupe client-side. Making the heading optional lets one call answer the question directly.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `get_lineage` input | `{doc_path: string, heading?: string}`. `heading` becomes optional. | Additive — existing callers continue to work unchanged. |
| Behaviour when heading omitted | Aggregate every lineage row where `section_a_doc = doc_path`, group by `section_b_doc`, return one `LineageResult` per co-committed doc. `heading` on the returned row is an empty string `""` (schema stays non-null — see below). | Mirrors ADR-0030's popover collapse but on the server side. Keeps the result shape the same regardless of mode. |
| `LineageResult.heading` when aggregated | `""` (empty string). | The schema stays `heading: string`, so existing consumers that read `heading` do not need to null-check. Callers that care about the distinction can check `input.heading` to know which mode they requested. |
| Aggregation semantics | `commit_count = SUM(commit_count)`; `last_commit = MAX(last_commit)` (picked per SQLite's `MAX` over the short-hash string — same logic already used by the doc-level graph queries). | Matches ADR-0030 aggregation. One source of truth for "collapse by doc." |
| Ordering when aggregated | `ORDER BY commit_count DESC` (unchanged). | Same rule as per-heading; keeps the most-relevant doc on top. |
| Status filter | Unchanged — still none (ADR-0027). `superseded`/`withdrawn`/`draft` rows all appear; `status` is returned per row for the caller to frame. | Consistent with ADR-0027. |
| Dashboard `/api/lineage` | `heading` query param becomes optional. When omitted, the handler calls `getLineage(doc, undefined)` and returns the aggregated rows. | Thin pass-through — no new endpoint path. |
| Dashboard UI | A `≡` icon is rendered next to the doc's H1 title on every spec and ADR detail page, matching the per-H2 treatment. Hovering/clicking opens a `LineagePopover` that calls `/api/lineage?doc=<p>` with no heading and renders the doc-level rows. | Consistent UX — the user already knows the `≡` affordance. |
| Popover row shape at doc level | Identical to the ADR-0030 collapsed row: `<count>× <doc_path>`, click → `#/adr/<slug>` or `#/spec/<path>`. | One popover component, one row format. |
| Final-row graph link | `#/graph?focus=<doc_path>` (no `section` param). | The popover is at doc level; the graph's local mode already accepts a doc focus. |

## Impact

- `docs/mclaude-docs-mcp/spec-docs-mcp.md` — `get_lineage` § updated to document the optional heading and the aggregation rule. The `LineageResult` schema is unchanged (`heading: string` stays; an empty string denotes aggregated mode).
- `docs/mclaude-docs-dashboard/spec-dashboard.md` — `/api/lineage` § updated to mark heading optional; LineagePopover § extended to describe the H1 affordance and the doc-level popover.
- `mclaude-docs-mcp/src/tools.ts` — `getLineage` signature + SQL branch for the aggregated path.
- `mclaude-docs-dashboard/src/routes.ts` — handler treats missing `heading` as doc-level.
- `mclaude-docs-dashboard/ui/` — H1 marker rendering in `MarkdownView` + `LineagePopover` rendering path that handles `heading == null`.
- No DB schema change. No scanner change. No graph change.

## Scope

**In:** optional `heading` on `get_lineage` + `/api/lineage`; H1 lineage marker + popover in the dashboard UI.

**Deferred:** A separate "per-section expansion" inside the doc-level popover (ADR-0030 already left this open); surfacing doc-level lineage in search results or graph hovers.
