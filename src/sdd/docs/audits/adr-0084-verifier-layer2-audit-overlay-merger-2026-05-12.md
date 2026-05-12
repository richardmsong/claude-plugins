# ADR-0084 Verifier Layer-2 Audit — `methodology.dashboard.overlay_merger_synthesizes_removals`

**Invariant**: `methodology.dashboard.overlay_merger_synthesizes_removals`
**Verifier**: `src/sdd/docs-dashboard/tests/overlay-model.test.ts` (`computeOverlay` describe block, lines 154–219)
**ADR**: `src/sdd/docs/adr-0084-dashboard-git-state-overlay.md`
**Audit date**: 2026-05-12
**Auditor**: invariant-testing-evaluator
**Audit type**: Layer-2 (verifier roundtrip — test code faithfulness to registered definition)

---

## Registered Definition (from ADR-0084 `### Added` block)

> `computeOverlay(diff, baseLines)` returns an `OverlayLine[]` where added lines from the diff render with `kind: "added"`, context lines render with `kind: "kept"`, and removed lines from the diff are inserted into the sequence at the position corresponding to their pre-change line number with `kind: "removed"` so that the rendered order places each removed line between the surrounding kept/added neighbors.

---

## Reconstructed Invariant (from test code alone)

Reading only the `computeOverlay` describe block (lines 154–219 of `overlay-model.test.ts`), the test suite collectively operationalizes the following contract:

> `computeOverlay(diff, baseLines)` returns a non-empty `OverlayLine[]` where added lines from the diff produce entries with `kind: "added"`, context lines produce entries with `kind: "kept"`, removed lines are synthesized into the sequence with `kind: "removed"` and their original content preserved, the synthesized removed entry appears no later than one position after the first added entry (i.e. removed is adjacent to or precedes the added entry), and every synthesized removed entry carries `baseLineNo: null`.

### Test-case breakdown

| # | Test name (line) | Clause exercised |
|---|-----------------|-----------------|
| 1 | "returns an OverlayLine array" (155) | Result is a non-empty array |
| 2 | "added lines produce OverlayLine with kind: added" (162) | `kind: "added"` for diff `+` lines; `content` contains the added text |
| 3 | "context lines produce OverlayLine with kind: kept" (172) | `kind: "kept"` for diff context lines |
| 4 | "removed lines are synthesized in the sequence at their pre-change position with kind: removed" (179) | `kind: "removed"` present; `content` matches original removed text (`"removed line at old-4"`) |
| 5 | "removed lines appear between the surrounding kept/added neighbors in the sequence" (190) | Ordering constraint: `removedIdx <= addedIdx + 1` |
| 6 | "baseLineNo is null for synthesized removed lines" (211) | `baseLineNo === null` for all `kind: "removed"` entries |

The fixture (`SAMPLE_UNIFIED_DIFF` + `BASE_LINES`, lines 50–70) provides a minimal but complete scenario: one context line, one removed line, one added line at the same position, one more context line. This is sufficient to exercise all four output kinds (kept, removed, added, kept) and their ordering. The `parseUnifiedDiff` function is called as a real dependency in every test rather than being stubbed, making these integration-level assertions against the composed behavior of both functions.

---

## Diff: Reconstructed vs. Registered Definition

### Exact matches

All four core claims of the registered definition are covered:

- "added lines render with `kind: \"added\"`" — covered by test 2.
- "context lines render with `kind: \"kept\"`" — covered by test 3.
- "removed lines inserted at pre-change position with `kind: \"removed\"`" — covered by test 4.
- "rendered order places each removed line between surrounding kept/added neighbors" — covered by test 5.

### Reconstructed clauses not present in registered definition

**Delta 1 — `baseLineNo: null` for synthesized removed lines (test 6)**

The test code adds an explicit assertion that every `OverlayLine` with `kind: "removed"` carries `baseLineNo: null`. The registered definition is completely silent on the `baseLineNo` field — it specifies only the three `kind` values and the ordering rule for removed lines.

Assessment: This is an addition in the verifier not captured in the invariant definition. The ADR body's Component Changes section (line 80) specifies the `OverlayLine` shape as `{kind: "kept" | "added" | "modified" | "removed", content: string, baseLineNo: number | null}`, making `baseLineNo: null` for synthesized rows the natural and intended behavior (a synthesized row has no base-file line number). However, the registered invariant definition does not encode this. The verifier tests a behavioral contract that is designed and documented in the ADR body but is absent from the registered definition of `methodology.dashboard.overlay_merger_synthesizes_removals`.

**Delta 2 — Ordering assertion is relaxed relative to the definition prose**

The registered definition says the removed line is placed "between the surrounding kept/added neighbors," implying strict interleaving: `kept → removed → added → kept`. Test 5 asserts only `removedIdx <= addedIdx + 1` — i.e., the removed row is not allowed to appear more than one position after the first added row, but it may appear at `addedIdx` (same index, which is impossible for distinct entries) or at any index before `addedIdx`. This formulation captures the spirit of the definition (removed comes before or adjacent to added) but does not assert the complete four-element sequence `kept, removed, added, kept`. A multi-element fixture could have removals scattered after later added rows without tripping this assertion.

Assessment: The test is directionally consistent with the definition but is structurally weaker. The definition's "between the surrounding kept/added neighbors" implies a strict position relationship that `removedIdx <= addedIdx + 1` does not fully encode. This is a coverage gap in the verifier, not a contradiction. For the specific single-hunk fixture used, the assertion is sufficient; for a multi-hunk diff with interleaved removed/added lines, the assertion would not catch misplacement. This is a minor gap — the verifier is not wrong, but it underspecifies the ordering guarantee.

### Registered clauses absent from test code

None. All four claims of the registered definition are operationalized by at least one test case.

---

## Verdict

**CLEAN with two definition-narrowing notes.**

The test code faithfully encodes all four claims of the registered definition. No test case contradicts the registered definition. The mock/fixture strategy is appropriate: a concrete unified diff and matching base-line array are sufficient to exercise the full set of output kinds and the ordering constraint. The tests will fail (module-not-found) until `ui/src/lib/overlay-model.ts` is created per ADR-0084, which is the expected pre-implementation state documented in the file header.

Two gaps exist, neither of which is a contradiction:

1. **Verifier adds `baseLineNo: null` assertion (test 6)** — the registered definition does not mention `baseLineNo`. The verifier is strictly more complete than the definition on this point.

2. **Ordering assertion is weaker than definition prose** — `removedIdx <= addedIdx + 1` does not fully operationalize "between the surrounding kept/added neighbors." For the single-hunk fixture this is sufficient; for a multi-hunk scenario it would not catch positional errors in later hunks.

The definition should be extended on the next registry edit to capture the `baseLineNo: null` clause:

> `computeOverlay(diff, baseLines)` returns an `OverlayLine[]` where added lines from the diff render with `kind: "added"`, context lines render with `kind: "kept"`, and removed lines from the diff are inserted into the sequence at the position corresponding to their pre-change line number with `kind: "removed"` and `baseLineNo: null`, so that the rendered order places each removed line between the surrounding kept/added neighbors.

This is a recommendation, not a blocking finding.

---

## Coverage Checklist

| Clause from registered definition | Covered by test? | Test # |
|-----------------------------------|-----------------|--------|
| `kind: "added"` for diff added lines | Yes | 2 |
| `kind: "kept"` for diff context lines | Yes | 3 |
| `kind: "removed"` for diff removed lines | Yes | 4 |
| Removed lines synthesized at pre-change position (content preserved) | Yes | 4 |
| Removed line appears between kept/added neighbors in rendered order | Yes (relaxed) | 5 |
| `baseLineNo: null` for synthesized removed lines (verifier-only addition) | Yes | 6 |

All registered definition clauses are covered. Coverage is complete. One clause in the verifier (`baseLineNo: null`) is not reflected in the registered definition and should be added.
