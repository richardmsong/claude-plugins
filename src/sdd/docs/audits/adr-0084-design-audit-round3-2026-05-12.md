# ADR-0084 Design Audit — Round 3

**Document:** `src/sdd/docs/adr-0084-dashboard-git-state-overlay.md`
**Audit date:** 2026-05-12
**Auditor:** decision-invariant-evaluator
**Audit type:** Layer-1 round-trip — decision-invariant consistency, cross-section consistency, registry alignment, structural checks

---

## Verdict

**CLEAN. No blocking gaps remain.**

All three Round 1 blocking gaps are resolved. All three Round 2 (interrupted) findings are resolved. No new blocking issues were found. The design is ready for promotion to `implemented` once the production implementation passes the verifier tests.

---

## Evidence reviewed

| Artifact | Result |
|----------|--------|
| `sdd verify` structural checks | All PASS for registry and ADR structural checks. `structural.adr.adr-0084-dashboard-git-state-overlay.md` PASS. `structural.registry.no_and_in_definition` PASS (registry definitions for all five invariants are free of `\band\b` matches). |
| Five invariants in `spec/registry.yaml` | All five present at `status: active` with correct `verifier`, `requires`, `glossary_terms: []` fields. |
| ADR Invariant Delta vs. registry | Definitions match in substance. Registry wording for `blame_uncommitted_lines_structured` replaced `≥` with `at-least`; for `diff_endpoint_three_modes` replaced "and both `line_start` and `line_end`" with "plus both `line_start`/`line_end`" — both changes were necessary to pass `registry.no_and_in_definition`. No semantic loss. |
| `overlay_parser_classifies_lines` definition parity | ADR and registry state identically: `lineNo` = RHS for added, RHS for context, LHS for removed. Matches test fixtures in `overlay-model.test.ts`. |
| `verifier_unique` — three overlay invariants | Verifier paths carry `::parseUnifiedDiff`, `::computeOverlay`, `::computeGutterModel` suffixes. No shared path. |
| Component Changes "removed lines" wording | Spells out LHS/RHS sourcing explicitly. No stale "interpolated" language. |
| Partial-range behavior | `diff_endpoint_three_modes` definition explicitly names partial-range (exactly one of `line_start`/`line_end`) as HTTP 400. Tests in `routes-diff.test.ts` (lines 189–241) assert 400 for both variants. Consistent. |
| `"modified"` kind in `OverlayLine` | Removed from `OverlayLine` output spec. `overlay_merger_synthesizes_removals` defines output kinds as `"kept"`, `"added"`, `"removed"` only. Decision History (Why `OverlayLine` has no `"modified"` kind) explains the rationale. `"modified"` survives only in `UncommittedRange` (blame gutter concern, separate type). No contradiction. |
| Decision-to-invariant round-trip | Five decisions map to five registered invariants (see table below). Advisory items from Round 1 remain advisory; no new unregistered behavioral contracts. |

---

## Decision-to-invariant round-trip

| Decision row | Invariant registered | Assessment |
|---|---|---|
| Diff display mode (overlay, green/red — no `"modified"` kind in OverlayLine) | `overlay_parser_classifies_lines`, `overlay_merger_synthesizes_removals` | Clean |
| Uncommitted detection (`git diff HEAD`) | `blame_uncommitted_lines_structured` | Clean |
| Diff source unification (`gitDiff` helper) | Advisory only — documented rationale in Decision History | Acceptable |
| API shape (three modes + 400 for partial-range) | `diff_endpoint_three_modes` | Clean |
| Working-tree info in `/api/blame` (structured shape) | `blame_uncommitted_lines_structured` | Clean |
| Gutter WIP marker precedence | `gutter_wip_precedence` | Clean |
| Exit gesture (ESC/toggle) | None — deferred as UI gesture, noted in Advisory B from Round 1 | Acceptable |
| Stacking (mutual exclusion) | None — deferred as UI state | Acceptable |
| Verifier strategy (pure functions) | N/A — methodology decision | Clean |

---

## Implementation status (informational — not a design gap)

The `sdd verify` pipeline currently exits non-zero due to two pre-implementation failures unrelated to the design document itself:

1. **`verify[0]` (`go test ./spec/...`):** FAIL due to a parse error in `adr-0080-eval-verifier-mechanism.md` ("unknown sub-block kind `Added (invariants)`") — a pre-existing issue in a different ADR, not introduced by ADR-0084.

2. **`verify[1]` (`bun test tests/`):** 12 tests RED across three files:
   - `routes-diff.test.ts` modes (b) and (c) — 5 tests: `handleDiff` does not yet implement full-file-commit or working-tree modes. Correctly marked RED in the test file header ("RED until dev-harness lands the production change").
   - `routes-blame.test.ts` ADR-0084 structured shape — 2 tests: `handleBlame` still returns `number[]` for `uncommitted_lines`. Correctly expected to be RED before implementation.
   - `overlay-model.test.ts` — fails with module-not-found: `ui/src/lib/overlay-model.ts` does not exist yet. Correctly pre-declared with `@ts-expect-error` in the test file.
   - `boot-config-respect.test.ts` and `server-banner.test.ts` — 5 tests from ADR-0083, also pre-implementation RED (separate feature).

All 12 failures are correctly anticipated by the verifier test files' own comments. They are implementation gaps for dev-harness, not design gaps. The design document does not require modification.

---

## Advisory (carried forward from Round 1, no change in status)

**A. Overlay refresh on SSE reindex (User Flow step 5):** No invariant. Acceptable at draft; deferred UI behavior.

**B. Mode state machine (ESC/toggle/click-replace):** No invariant. Acceptable at draft; justified in Decision History.

**C. `gitDiff` helper unification:** No invariant. Advisory only; rationale documented.

These three advisories should be converted to explicit "Out" scope entries or noted in `## Invariant Delta` "Withdrawn" before promotion to `implemented`.
