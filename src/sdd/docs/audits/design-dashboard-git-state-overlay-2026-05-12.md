## Audit: 2026-05-12T15:30:00Z

**Document:** src/sdd/docs/adr-0084-dashboard-git-state-overlay.md

### Round 1

**Gaps found: 3**

1. `OverlayLine` `"modified"` kind appeared in User Flow/Component Changes but no invariant/test covered it.
2. Partial-range request behavior (`commit + only one of line_start/line_end`) was undefined in the ADR; existing tests in `routes-blame.test.ts` already asserted 400.
3. All five invariants in the Invariant Delta were not in `spec/registry.yaml`.

#### Fixes applied

| # | Gap | Cause | Resolution | Type |
|---|-----|-------|-----------|------|
| 1 | `OverlayLine` "modified" kind unregistered | User Flow conflated working-tree gutter kind (added/modified) with overlay body kind (added/kept/removed) | Dropped "modified" from `OverlayLine`; User Flow rewritten to route working-tree through the same parser+merger pipeline as commit overlays; `uncommitted_lines.kind` continues to drive only the gutter WIP marker | decision |
| 2 | Partial-range behavior undefined | ADR's three-modes definition didn't enumerate the failure case | Extended `methodology.dashboard.diff_endpoint_three_modes` definition to explicitly state HTTP 400 for partial-range, missing `doc`, or invalid commit hash | factual |
| 3 | Registry not updated | Registry append was omitted from the post-Q&A finalize step | Appended all five invariants to `src/sdd/spec/registry.yaml` section 12 | factual |

### Round 2 (interrupted)

The auditor was killed mid-pass but surfaced three additional findings before stopping:

1. `overlay_parser_classifies_lines` definition diverged between ADR delta and registry (registry was more complete).
2. `verifier_unique` violation: three invariants shared `overlay-model.test.ts` with no `::FuncName` suffix.
3. Stale "interpolated for removed lines" wording in Component Changes contradicted the now-explicit LHS/RHS sourcing.

#### Fixes applied

| # | Gap | Cause | Resolution | Type |
|---|-----|-------|-----------|------|
| 4 | Definition divergence on `overlay_parser_classifies_lines` | ADR's original definition omitted the removed-record clause that the verifier (now tightened) exercises | Updated ADR delta to match registry: lineNo for added=RHS, context=RHS, removed=LHS | factual |
| 5 | Verifier paths not unique | Three invariants pointed at the same `overlay-model.test.ts` path | Suffixed with `::parseUnifiedDiff`, `::computeOverlay`, `::computeGutterModel` in both ADR and registry | factual |
| 6 | Stale "interpolated" wording in Component Changes line 79 | Pre-existing draft language was not reconciled when the parser definition was made precise | Rewrote the bullet to explicitly state LHS for removed, RHS for added/context | factual |

Plus three precision-tightening fixes on the verifier code (via `invariant-compiler`): exact-value `lineNo` assertions for added records, strict adjacency ordering in `computeOverlay` test, partial-range HTTP 400 cases in `routes-diff.test.ts`.

### Round 3

CLEAN — no blocking gaps found. Three advisories (overlay SSE refresh, mode state machine as contract, `gitDiff` helper as contract) folded into the Scope section's explicit "Out" list.

### Result

**CLEAN** after 3 rounds, 6 total gaps resolved (4 factual fixes, 2 design decisions); plus 3 verifier-precision tightenings on the compiler side; plus 3 advisory items moved to explicit "Out" scope.
