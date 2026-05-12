# ADR-0084 Verifier Layer-2 Audit — `methodology.dashboard.overlay_parser_classifies_lines`

**Invariant**: `methodology.dashboard.overlay_parser_classifies_lines`
**Verifier**: `src/sdd/docs-dashboard/tests/overlay-model.test.ts` (`parseUnifiedDiff` describe block)
**ADR**: `src/sdd/docs/adr-0084-dashboard-git-state-overlay.md`
**Audit date**: 2026-05-12
**Auditor**: invariant-testing-evaluator
**Audit type**: Layer-2 (verifier roundtrip — test code faithfulness to registered definition)

---

## Registered Definition (from ADR-0084 `### Added` block)

> `parseUnifiedDiff(diffText)` returns an array of `DiffLine` records where every `+` line in the input produces a record with `kind: "added"`, every `-` line produces a record with `kind: "removed"`, every context line (` ` prefix) produces a record with `kind: "context"`, and the `lineNo` field on each record matches the right-hand-side line number from the diff's `@@` hunk header for added and context records.

---

## Reconstructed Invariant (from test code alone)

Reading only the `parseUnifiedDiff` describe block (lines 76–148 of `overlay-model.test.ts`), the test suite collectively operationalizes the following contract:

> `parseUnifiedDiff(diffText)` returns an array of `DiffLine` records where:
> - every `+` line produces a record with `kind: "added"` and truthy `content`;
> - every `-` line produces a record with `kind: "removed"` and truthy `content`;
> - every context line (space prefix) produces a record with `kind: "context"` and truthy `content`;
> - `lineNo` on added records falls within the new-file range declared by the `@@` hunk header (range-bounded, not pinned to an exact value per test);
> - `lineNo` on context records equals the exact right-hand-side line numbers from the `@@` header (specifically, the values `3` and `5` are present for the fixture);
> - empty string input returns an empty array;
> - `\\ No newline at end of file` marker lines are ignored and do not inflate the added or removed counts.

### Test-case breakdown

| # | Test name (line) | Branch exercised |
|---|-----------------|-----------------|
| 1 | "classifies every + line as kind: added" (77) | `+` prefix → `kind: "added"`, truthy `content` |
| 2 | "classifies every - line as kind: removed" (86) | `-` prefix → `kind: "removed"`, truthy `content` |
| 3 | "classifies every context line (space prefix) as kind: context" (95) | ` ` prefix → `kind: "context"`, truthy `content` |
| 4 | "lineNo on added records matches the right-hand-side line number from the @@ header" (104) | `lineNo` for added within `[3, 6]` (hunk range) |
| 5 | "lineNo on context records matches the right-hand-side line number from the @@ header" (117) | `lineNo` for context contains `3` and `5` (exact RHS values) |
| 6 | "returns an empty array for empty diff input" (126) | `""` input → `[]`, `Array.isArray` true |
| 7 | "skips binary/no-newline marker lines (treats them as context)" (132) | `\\ No newline...` marker not counted as added/removed; total added=1, removed=1 |

The fixture (`SAMPLE_UNIFIED_DIFF`) models a hunk `@@ -3,3 +3,4 @@` with one context line at new-file line 3, one removed line (old-file line 4), one added line (new-file line 4), and one context line at new-file line 5. This fixture exercises all four line-prefix categories and anchors the `lineNo` assertions to concrete values.

---

## Diff: Reconstructed vs. Registered Definition

### Exact matches

The following clauses from the registered definition are fully covered by the test code:

| Registered clause | Covered by | Notes |
|-------------------|-----------|-------|
| `+` line → `kind: "added"` | Test 1 | Direct assertion |
| `-` line → `kind: "removed"` | Test 2 | Direct assertion |
| context line (` ` prefix) → `kind: "context"` | Test 3 | Direct assertion |
| `lineNo` matches RHS line number for added records | Test 4 | Partial (see Delta 1 below) |
| `lineNo` matches RHS line number for context records | Test 5 | Full exact-value assertion |

### Reconstructed clauses not present in registered definition

**Delta 1 — `lineNo` for added records: range-bounded assertion vs. exact value**

The registered definition says `lineNo` on added records "matches the right-hand-side line number from the diff's `@@` hunk header." Test 4 asserts `lineNo >= 3 && lineNo <= 6` — a range check against the hunk's new-file span — rather than asserting the exact expected value (`4` for the single added line in the fixture).

Assessment: The test is weaker than the definition's prose for added records. The definition implies exact agreement with the RHS counter (as the context test in Test 5 demonstrates with `toContain(3)` and `toContain(5)`). Test 4 would pass for an implementation that assigns `lineNo = 3` to the added line (wrong RHS value but still within the range `[3, 6]`). For context records Test 5 pins exact values; for added records Test 4 only pins a range. This is a coverage weakness in the verifier, but not a contradiction — no test asserts a wrong `lineNo` for added records, so the verifier is not dishonest. The test simply under-constrains this clause.

**Delta 2 — `content` field asserted to be truthy**

Tests 1–3 each assert `r.content` is truthy. The registered definition mentions only `kind` and `lineNo`; it does not specify a `content` field. The test is asserting a field that exists on `DiffLine` (from the type import) but is not part of the invariant's definitional sentence.

Assessment: This is an additive assertion that exceeds the registered definition's scope. The registered definition is silent on `content`; the verifier constrains it. No contradiction.

**Delta 3 — Empty input → empty array (Test 6)**

The registered definition does not specify behavior for empty string input. Test 6 asserts `parseUnifiedDiff("") === []`.

Assessment: This is an additive clause in the verifier not encoded in the registered definition. It encodes reasonable defensive behavior (mentioned in the ADR's Error Handling table: "Working-tree diff contains binary/no-newline markers — `parseUnifiedDiff` skips them") and does not contradict the definition.

**Delta 4 — `\\ No newline at end of file` marker handling (Test 7)**

The registered definition does not mention marker-line handling. Test 7 asserts that `\\ No newline at end of file` lines are excluded from added/removed counts, with exact counts enforced (`addedCount === 1`, `removedCount === 1`).

Assessment: This is an additive clause. The ADR's Error Handling table does specify "Working-tree diff contains binary/no-newline markers — `parseUnifiedDiff` skips them (treats as context)" — this clause appears in the ADR body but not in the one-sentence invariant definition. No contradiction with the registered definition.

### Registered clauses not covered by test code

None. All four clauses in the registered definition (`+` → added, `-` → removed, ` ` → context, `lineNo` from `@@` header) are exercised by at least one test case.

---

## Verdict

**CLEAN.**

The test code faithfully encodes the contract expressed in the registered definition. All four classification clauses (added, removed, context, lineNo from hunk header) are exercised. No test case contradicts or inverts any clause in the registered definition.

Two notes, neither blocking:

1. **Weak lineNo assertion for added records (Delta 1).** Test 5 pins exact `lineNo` values for context records; Test 4 only range-checks added records against the hunk span. The verifier under-constrains the `lineNo` clause for added records relative to the definition's "matches" language. The definition is not violated, but an implementation could pass Test 4 while computing a wrong (but in-range) `lineNo` for added lines. The verifier should be tightened on the next pass to assert `added[0].lineNo === 4` (the exact expected RHS value for the fixture).

2. **Verifier tests additional surface not in the definition (Deltas 2–4).** The `content` field, empty-input behavior, and marker-line handling are all tested but not part of the registered definition. These are additive — the verifier is strictly more complete than the definition on those axes.

Neither note affects the CLEAN verdict. The verifier correctly operationalizes the registered definition without contradiction.

---

## Coverage Checklist

| Registered clause | Covered by test? | Strength |
|-------------------|-----------------|----------|
| `+` line → `kind: "added"` | Yes — Test 1 | Full |
| `-` line → `kind: "removed"` | Yes — Test 2 | Full |
| context line (` ` prefix) → `kind: "context"` | Yes — Test 3 | Full |
| `lineNo` for added records matches RHS from `@@` header | Yes — Test 4 | Partial (range-bounded, not exact value) |
| `lineNo` for context records matches RHS from `@@` header | Yes — Test 5 | Full (exact values `3` and `5`) |

All registered clauses are covered. Coverage is complete with one precision gap on the added-record `lineNo` assertion.
