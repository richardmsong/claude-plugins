# Layer-2 Verifier Audit — `methodology.dashboard.gutter_wip_precedence`

**Date:** 2026-05-12
**ADR:** ADR-0084 (dashboard git-state overlay)
**Invariant ID:** `methodology.dashboard.gutter_wip_precedence`
**Verifier file:** `src/sdd/docs-dashboard/tests/overlay-model.test.ts`
**Describe block examined:** `computeGutterModel — gutter_wip_precedence` (lines 254–333)

---

## Registered definition (verbatim)

> `computeGutterModel(blocks, uncommitted)` returns a `GutterRow[]` where every
> line covered by an `uncommitted` range produces a row with `kind: "wip"`
> regardless of whether that line is also covered by a `blocks` entry, and every
> line covered only by a `blocks` entry produces a row with `kind: "commit"`
> carrying that block's commit hash.

The definition contains exactly two claims:

- **Claim A** — uncommitted coverage implies `kind: "wip"`, unconditionally (overlap with a blame block does not change the outcome).
- **Claim B** — block-only coverage implies `kind: "commit"` carrying that block's commit hash.

---

## Invariant reconstructed from test code

The seven test cases in the `computeGutterModel` describe block assert:

| # | Test name | Claim exercised |
|---|-----------|-----------------|
| 1 | `returns a GutterRow array` | Return type is `GutterRow[]`, non-empty for non-empty inputs. |
| 2 | `lines covered only by a blame block produce kind: commit rows` | Claim B — lines 1 and 2 (blame block only) → `kind: "commit"` with correct hash. |
| 3 | `a line covered by BOTH a blame block AND an uncommitted range produces kind: wip (wip wins)` | Claim A, overlap sub-case — line 3 is in blame block [1–3] AND uncommitted [3–3] → `kind: "wip"`. |
| 4 | `a line covered only by an uncommitted range produces kind: wip` | Claim A, no-block sub-case — line 7 is uncommitted only → `kind: "wip"`. |
| 5 | `no row ever has kind: commit when the line falls in an uncommitted range` | Claim A, universal negation — iterates every row; any row whose `lineNo` is in any uncommitted range must have `kind: "wip"`. |
| 6 | `commit rows carry the commit hash from the corresponding blame block` | Claim B, hash fidelity — line 4 (blame block def1234…) → `commit` field equals that hash. |
| 7 | `handles empty uncommitted array — all blame lines produce commit rows` | Claim B boundary — no uncommitted input; every output row must be `kind: "commit"`. |
| 8 | `handles empty blame blocks array — all uncommitted lines produce wip rows` | Claim A boundary — no block input; every output row must be `kind: "wip"`. |

**Reconstructed invariant:** `computeGutterModel(blocks, uncommitted)` returns a
non-empty `GutterRow[]`. Every line covered by any range in `uncommitted`
produces a row with `kind: "wip"`, regardless of whether that line is also
covered by an entry in `blocks` (WIP takes precedence in all cases, including
the overlap case). Every line covered only by a `blocks` entry produces a row
with `kind: "commit"` whose `commit` field equals that block's commit hash.
Both claims hold at boundary conditions (either input array empty).

---

## Diff: reconstructed vs registered

The reconstructed invariant is a faithful expansion of the registered definition:

- Both Claim A and Claim B are present and correctly encoded.
- Test 3 explicitly exercises the "regardless of whether that line is also
  covered by a `blocks` entry" clause from the definition — the most important
  edge case in the definition is directly and unambiguously covered.
- Test 5 adds a universal quantifier sweep that strengthens but does not
  contradict Claim A.
- Tests 7 and 8 add empty-input boundary coverage that is derivable from the
  definition but not stated there; they do not introduce new behavioral claims.
- The `commit` hash fidelity check in Test 6 directly satisfies the "carrying
  that block's commit hash" phrase in the definition.

No test asserts behavior absent from the definition. No clause of the
definition is left untested.

---

## Verdict

**CLEAN**

The verifier fully and faithfully covers the registered definition. No drift
detected. The overlap sub-case (`kind: "wip"` wins over a simultaneous blame
block entry) is explicitly exercised by a dedicated test case, confirming the
most safety-critical clause of the invariant.
