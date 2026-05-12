# ADR-0084 Design Audit

**Document:** `src/sdd/docs/adr-0084-dashboard-git-state-overlay.md`
**Audit date:** 2026-05-12
**Auditor:** decision-invariant-evaluator
**Audit type:** Layer-1 (decision-invariant roundtrip, narrative coverage, cross-section consistency)

---

## Verdict

**3 blocking gaps. Not CLEAN.**

---

## Blocking Gap 1 — `OverlayLine` `"modified"` kind is specified but neither invariant-registered nor tested

**Location:** Component Changes section (line 80); User Flow step 3 (line 44); Overview (line 9); Decision row "Diff display mode" (line 24).

**What the ADR commits to:** `computeOverlay` returns `OverlayLine[]` where `kind` is one of `"kept" | "added" | "modified" | "removed"`. User Flow step 3 explicitly maps `kind: "modified"` to an amber background. The Overview says "modified lines get both [green and red]."

**What the invariant registers:** `methodology.dashboard.overlay_merger_synthesizes_removals` defines the output kinds as `"added"`, `"kept"`, and `"removed"` only. `"modified"` is absent from the invariant definition. No test in `overlay-model.test.ts` asserts `kind: "modified"` output from `computeOverlay` — the fixture diff uses a remove+add pair, which exercises the removed/added path, not the in-place-modification path.

**Why this is blocking:** The `"modified"` kind is a first-class rendering path (it drives a third color: amber). A git diff line that is a context-then-modified entry maps differently from a pure addition. If `computeOverlay` silently collapses modifications into added+removed pairs (standard unified diff behavior), the `"modified"` kind may never appear in output, making it dead spec. If it is supposed to appear, the invariant definition omits it and no test would catch regressions. Either the kind is removed from the `OverlayLine` type spec (and the User Flow color table updated), or the invariant must be extended and a test added.

**Required fix:** Either (a) remove `"modified"` from the `OverlayLine` kind union in Component Changes and User Flow, replacing "amber background" with a description of how the remove+add pair renders, or (b) extend `methodology.dashboard.overlay_merger_synthesizes_removals` to state how `"modified"` is produced and add a test case exercising it.

---

## Blocking Gap 2 — Partial-range request behavior (`commit + one of line_start/line_end`) is undefined; existing tests will become contradictory after implementation

**Location:** Decision row "API shape" (line 27); Component Changes `handleDiff` modes (lines 65–68); `routes-blame.test.ts` lines 385–403.

**What the ADR commits to:** Mode (a) requires both `line_start` and `line_end`. Mode (b) is triggered by `commit` present with "no `line_start`/`line_end`." The ADR is silent on the case where `commit` is present with exactly one of `line_start`/`line_end`.

**What the existing tests assert:** `routes-blame.test.ts` contains two tests that survive into the post-0084 suite:
- `"returns 400 when line_start is missing"` — request: `?doc=X&commit=abc1234&line_end=5`
- `"returns 400 when line_end is missing"` — request: `?doc=X&commit=abc1234&line_start=1`

Under ADR-0084, if the implementation reads "commit present without line_start/line_end" as "BOTH absent," these tests remain valid (partial range = 400). If the implementation reads it as "either absent," both tests will receive a 200 full-file diff and fail. The ADR gives no disambiguation.

**Why this is blocking:** Dev-harness authors the `handleDiff` implementation against this ADR. Without a specified partial-range rule, the implementer must guess. If they guess wrong, one of the two test expectations (routes-blame.test.ts pre-existing or routes-diff.test.ts new green test) will be violated. The contradiction is between the existing verifier and the new one.

**Required fix:** Add a single sentence to the "API shape" decision row and the Component Changes `handleDiff` description clarifying that providing `commit` with only one of `line_start`/`line_end` is a 400 (invalid request), identical to the current behavior. This preserves the existing tests without ambiguity.

---

## Blocking Gap 3 — Five invariants specified in the ADR are not registered in `spec/registry.yaml`

**Location:** Invariant Delta section (lines 163–192); `spec/registry.yaml` (section 12, ends at line 560).

**What the ADR commits to:** Five new invariants are listed as "Added":
- `methodology.dashboard.blame_uncommitted_lines_structured`
- `methodology.dashboard.diff_endpoint_three_modes`
- `methodology.dashboard.overlay_parser_classifies_lines`
- `methodology.dashboard.overlay_merger_synthesizes_removals`
- `methodology.dashboard.gutter_wip_precedence`

**What the registry contains:** None of these five IDs appear anywhere in `spec/registry.yaml`. The registry ends at section 12 with two dashboard invariants (`respects_configured_paths`, `banner_shows_resolved_docs_dir`); no ADR-0084 invariants follow.

**Why this is blocking:** Invariants named in an ADR's Invariant Delta section are the spec's enforcement surface. The verifier test files exist on disk and reference these IDs in their header comments. Until the invariants are registered, they are unchecked by any tooling that reads the registry. The ADR is draft-status, but unregistered invariants are a blocking condition before promotion — and the audit instruction explicitly covers the roundtrip from Decision to invariant.

**Required fix:** Append all five invariant definitions from the Invariant Delta section to `spec/registry.yaml` under section 12. Each entry needs `status: active` added (the Invariant Delta yaml blocks omit it). This cannot happen until Gap 1 is resolved, because the `overlay_merger_synthesizes_removals` definition must be corrected before it is registered.

---

## Advisory — Unregistered narrative commitments (not blocking at draft stage)

These behavioral commitments appear in prose but have no invariant. They are listed as advisory because they involve React component behavior and UI gestures that the ADR explicitly deferred from machine-testable coverage (Verifier Strategy decision, line 33). They should be documented as deferred before promotion to `implemented`.

**A. Overlay refresh on SSE reindex (User Flow step 5):** "When the user saves another edit (and the watcher fires SSE `reindex`), the overlay refreshes." No invariant registers that the frontend re-fetches blame and recomputes the overlay on a `reindex` SSE event. This is a live behavioral contract with no verifier path.

**B. Mode state machine (User Flow steps 6–11 / Decision rows "Exit gesture" and "Stacking"):** The commit-overlay's ESC-to-exit, toggle-to-exit, and click-different-commit-to-replace behaviors are fully specified in prose but unregistered. The Decision History section (line 206) justifies this as a UI concern unsuitable for pure-function tests. This is an acceptable rationale at draft, but the deferred status should be made explicit (e.g., a Scope "Out" entry or a note in the Invariant Delta "Withdrawn" block) so a future auditor does not re-flag it.

**C. `gitDiff` helper unification (Decision row "Diff source unification"):** The ADR names a `gitDiff(repoRoot, doc, left, right)` helper shared across all three modes. The three integration tests in `routes-diff.test.ts` exercise the modes but do not assert shared codepath. This is a design decision with no verifier; the Decision History rationale (one code path, one set of tests) is documented, which is sufficient at draft. No registration required.

---

## Decision-to-invariant roundtrip summary

| Decision row | Invariant registered | Assessment |
|---|---|---|
| Diff display mode (overlay, green/red) | Partial: `overlay_parser_classifies_lines`, `overlay_merger_synthesizes_removals` | Gap 1: `"modified"` kind missing from invariant |
| Uncommitted detection (`git diff HEAD`) | `blame_uncommitted_lines_structured` (not in registry) | Gap 3 |
| Diff source unification (`gitDiff` helper) | None — advisory only, documented rationale | Acceptable at draft |
| API shape (three modes) | `diff_endpoint_three_modes` (not in registry) | Gap 3; partial-range ambiguity is Gap 2 |
| Working-tree info in `/api/blame` | `blame_uncommitted_lines_structured` (not in registry) | Gap 3 |
| Exit gesture (ESC/toggle) | None — deferred as UI gesture | Advisory B |
| Always-on WT overlay | `blame_uncommitted_lines_structured` covers backend shape; no frontend always-on invariant | Advisory B |
| Stacking (mutual exclusion) | None — deferred as UI state | Advisory B |
| Removed-line rendering | `overlay_merger_synthesizes_removals` (not in registry) | Gap 3 |
| Verifier strategy (pure functions) | N/A — methodology decision, not a behavioral contract | Clean |
| Backend test placement | Covered by verifier field of `diff_endpoint_three_modes` and `blame_uncommitted_lines_structured` | Clean once registered |
| Frontend test placement | Covered by verifier field of three `overlay-model` invariants | Clean once registered |
| Gutter marker for WIP lines | `gutter_wip_precedence` (not in registry) | Gap 3 |
