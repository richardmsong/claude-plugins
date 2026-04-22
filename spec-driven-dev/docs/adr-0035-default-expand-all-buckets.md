# ADR: Default all ADR status buckets to expanded

**Status**: implemented
**Status history**:
- 2026-04-22: accepted
- 2026-04-22: implemented — all scope CLEAN

## Overview

The docs dashboard's Landing page now defaults all ADR status buckets (Draft, Accepted, Implemented, Superseded, Withdrawn, Unspecified) to expanded. Previously only the Draft bucket was expanded by default, requiring users to click into each status group to see its ADRs.

## Motivation

With a growing number of ADRs across statuses, the user wants to see all ADRs at a glance without clicking to expand each bucket. The collapse/expand toggle remains available for users who want to hide a status group.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default expand state | All buckets expanded | The ADR list is the primary navigation; hiding most of it behind clicks slows browsing. Users can still collapse individual buckets. |

## Impact

- `docs/mclaude-docs-dashboard/spec-dashboard.md` — update Landing route description to say all buckets expanded by default.
- `docs-dashboard/ui/src/routes/Landing.tsx` — change `DEFAULT_EXPANDED` constant.

## Scope

**In:** Change default expand state to all-true.
**Deferred:** Persisting expand/collapse state across page navigations or sessions.
