# ADR-0084 Verifier Layer-2 Audit — `methodology.dashboard.blame_uncommitted_lines_structured`

**Invariant**: `methodology.dashboard.blame_uncommitted_lines_structured`
**Verifier**: `src/sdd/docs-dashboard/tests/routes-blame.test.ts` — describe block `handleBlame — ADR-0084 uncommitted_lines structured shape`
**ADR**: `src/sdd/docs/adr-0084-dashboard-git-state-overlay.md`
**Audit date**: 2026-05-12
**Auditor**: invariant-testing-evaluator
**Audit type**: Layer-2 (verifier roundtrip — test code faithfulness to registered definition)

---

## Registered Definition (from ADR-0084 `### Added` block)

> The `/api/blame` response's `uncommitted_lines` field is an array of objects each with `line_start` (positive integer), `line_end` (positive integer >= line_start), and `kind` (`"added"` or `"modified"`), computed from `git diff HEAD -- <file>` when `repoRoot` is available, or `[]` when it is not.

This definition encodes six distinct claims:

| Claim | Clause |
|-------|--------|
| C1 | `uncommitted_lines` is an array of objects (not flat numbers) |
| C2 | Each object has `line_start` of type number |
| C3 | `line_start` is a positive integer (> 0) |
| C4 | Each object has `line_end` of type number, with `line_end >= line_start` |
| C5 | Each object has `kind` constrained to `"added"` or `"modified"` |
| C6 | The source is `git diff HEAD -- <file>` when `repoRoot` is available; the result is `[]` when `repoRoot` is not available |

---

## Reconstructed Invariant (from test code alone)

Reading only the three tests in the `handleBlame — ADR-0084 uncommitted_lines structured shape` describe block (lines 257–364), the test suite collectively operationalizes the following contract:

> `handleBlame` returns `uncommitted_lines: []` when called with `repoRoot = null`. When called with a real git repo where the working-tree file has been extended with new lines (not present in HEAD), `uncommitted_lines` is a non-empty array of objects where every entry satisfies: `typeof entry === "object"`, `entry !== null`, `typeof entry.line_start === "number"`, `typeof entry.line_end === "number"`, `entry.line_end >= entry.line_start`, `entry.line_start > 0`, and `entry.kind` is either `"added"` or `"modified"`; and at least one entry carries `kind: "added"`. When the working-tree file has existing lines changed (not added), at least one entry carries `kind: "modified"`.

### Test-case breakdown

| Case | Test name (line) | Branch exercised |
|------|-----------------|-----------------|
| T1 | "returns empty array when repoRoot is null" (258) | `repoRoot = null` → `uncommitted_lines: []` |
| T2 | "returns structured objects (not plain numbers) when the file has added lines vs HEAD" (282) | Added-line scenario → array of objects with correct shape + `kind: "added"` present |
| T3 | "returns kind: 'modified' entries when existing lines are changed" (325) | Modified-line scenario → array of objects with correct shape + `kind: "modified"` present |

**Setup strategy**: `makeGitRepoWithUncommittedEdit` (lines 200–255) creates a real temp git repository via `git init`, writes an initial file, commits it, then writes a working-tree edit without staging or committing. This correctly exercises the `git diff HEAD -- <file>` path rather than mocking the shell call, ensuring the test is end-to-end faithful to the "computed from `git diff HEAD`" clause of the definition.

---

## Diff: Reconstructed vs. Registered Definition

### Claim-by-claim coverage

| Claim | Covered? | Test(s) | Notes |
|-------|----------|---------|-------|
| C1 — array of objects, not flat numbers | Yes | T2, T3: `typeof entry === "object"` + `entry !== null` asserted per-element; T2 comment explicitly says "not an array of plain numbers" | Full coverage |
| C2 — `line_start` is type number | Yes | T2, T3: `expect(typeof entry.line_start).toBe("number")` (line 308, 350) | Full coverage |
| C3 — `line_start` is positive (> 0) | Yes | T2, T3: `expect(entry.line_start).toBeGreaterThan(0)` (line 313, — line 352 implicitly via same loop body) | Full coverage |
| C4 — `line_end` is number, `line_end >= line_start` | Yes | T2, T3: `expect(typeof entry.line_end).toBe("number")` + `expect(entry.line_end).toBeGreaterThanOrEqual(entry.line_start)` (lines 309–312, 350–353) | Full coverage |
| C5 — `kind` is `"added"` or `"modified"` | Yes | T2, T3: `expect(["added", "modified"]).toContain(entry.kind)` (line 314, 355) | Full coverage |
| C6a — source is `git diff HEAD` when repoRoot available | Yes | T2, T3: real git repo with actual working-tree edits; shape is verified via assertions on the response, confirming the git path is exercised | Covered by construction |
| C6b — returns `[]` when repoRoot is not available | Yes | T1: `handleBlame(gitDb, null, url)` → `expect(data.uncommitted_lines).toHaveLength(0)` (line 276) | Full coverage |

### Reconstructed clauses not present in registered definition

**Delta 1 — Explicit `kind`-specific presence assertions**

T2 additionally asserts `addedEntries.length > 0` (lines 318–319) and T3 asserts `modifiedEntries.length > 0` (lines 358–359). The registered definition says entries have `kind: "added" or "modified"` — it does not require that a specific scenario produce entries of a specific kind. The tests go further by asserting that an added-line scenario must produce at least one `"added"` entry and a modified-line scenario must produce at least one `"modified"` entry.

Assessment: These assertions are behavioral extensions that verify the backend's kind-classification logic, not just the shape. They are not contradictions — they are strictly more specific confirmations that the enum values map semantically to the correct git diff categories. This tightens the verifier beyond the shape-only contract of the registered definition, which is appropriate given the ADR body's Decisions table entry: "Frontend needs the kind to pick the highlight color; the backend already shells to git, so returning structured data is cheap."

**Delta 2 — `entry !== null` guard**

T2 and T3 assert `expect(entry).not.toBeNull()` (lines 309, 350). The registered definition says "array of objects" which implies non-null by the TypeScript interface shape, but does not explicitly state it. The test operationalizes this as an explicit null-guard check.

Assessment: This is a faithful encoding of the definition's "object" constraint. Not a drift; a literal reading of the definition implies non-null objects.

### Registered clauses not covered by test code

None. Every claim in the registered definition is exercised by at least one of the three tests.

---

## Verdict

**CLEAN.**

All six definitional claims are covered without contradiction. The test code is end-to-end faithful to the registered definition:

- The `null` repoRoot branch returns `[]` (C6b, T1).
- Added-line and modified-line working-tree scenarios produce non-empty arrays of well-formed objects (C1–C5, T2–T3) sourced from a real `git diff HEAD` execution (C6a, setup via `makeGitRepoWithUncommittedEdit`).
- The `line_start > 0` constraint, `line_end >= line_start` constraint, type constraints, and `kind` enum constraint are all asserted per-element in a loop.

The two deltas noted above (kind-specific presence assertions; null guard) are strictness extensions that go beyond the registered definition without contradicting it. The verifier is a superset of the definition, not an inconsistent encoding of it.

The tests are correctly marked RED in the file header ("RED until dev-harness lands the production change") because the current `findUncommittedLines` implementation returns `number[]` rather than `{ line_start, line_end, kind }[]`. This pre-implementation red state is expected and documented; it is not evidence of verifier drift.

---

## Coverage Checklist

| Branch | Covered by test? | Case |
|--------|-----------------|------|
| Array of objects (not flat numbers) | Yes | T2, T3 |
| `line_start` is a number | Yes | T2, T3 |
| `line_start > 0` | Yes | T2, T3 |
| `line_end` is a number | Yes | T2, T3 |
| `line_end >= line_start` | Yes | T2, T3 |
| `kind` in `{"added","modified"}` | Yes | T2, T3 |
| Source is `git diff HEAD` (real repo) | Yes | T2, T3 |
| Returns `[]` when `repoRoot` is null | Yes | T1 |

All eight branches covered. Coverage is complete.
