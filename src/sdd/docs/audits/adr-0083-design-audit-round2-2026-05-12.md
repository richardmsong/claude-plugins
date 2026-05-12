# ADR-0083 Design Audit — Round 2

**Document:** `src/sdd/docs/adr-0083-dashboard-respects-configured-adr-dir.md`
**Audit date:** 2026-05-12
**Auditor:** decision-invariant-evaluator
**Audit type:** Layer-1 (decision-invariant roundtrip, narrative coverage, cross-section consistency)
**Round 1 report:** `src/sdd/docs/audits/adr-0083-design-audit-2026-05-12.md`

---

## Verdict

**CLEAN — 0 blocking gaps, 1 advisory note (stale Implementation Plan table).**

All three blocking gaps and the advisory note from Round 1 are resolved. One new advisory-level inconsistency was found between the Implementation Plan table and the rest of the document; it does not affect any registered contract or verifier.

---

## Round 1 Gap Resolution

### Gap 1 — Bad-path branch now registered and tested

**Status: RESOLVED.**

The invariant definition for `methodology.dashboard.respects_configured_paths` (ADR Invariant Delta, line 135; registry lines 547–550) now explicitly includes "honored even when the resolved path does not exist on disk." Case 6 is present in the Component Changes test list (line 75) and in the Integration Test Cases table (line 182), asserting `startWatcher` receives the configured nonexistent path with no silent fallback. User Flow step 4 (line 48) covers the same branch inline. Decision history (line 167) explains the rationale. All four surfaces are consistent.

### Gap 2 — Banner display now a separate registered invariant

**Status: RESOLVED.**

`methodology.dashboard.banner_shows_resolved_docs_dir` is registered as a distinct invariant with verifier `src/sdd/docs-dashboard/tests/server-banner.test.ts` (ADR Invariant Delta, lines 140–145; registry lines 554–558). The Component Changes section (lines 81–83) describes the `server-banner.test.ts` test case. The Impact table (line 112) lists `server-banner.test.ts` as a modified file. The Integration Test Cases table (line 183) carries the banner row. The invariant definition ties `<resolved-path>` back to the same `docsDir` value `boot()` passes to `startWatcher`, binding the two contracts correctly.

### Gap 3 — User Flow step 4 no longer contains a stale placeholder

**Status: RESOLVED.**

Step 4 in the User Flow section (lines 48–50) now spells out all three branches: present+parseable (including bad-path sub-case), absent/missing/whitespace (fallback), and malformed JSON (throw). The Error Cases paragraph (lines 54–56) matches. No placeholder language remains.

### Advisory — `requires:` now cites the active successor

**Status: RESOLVED.**

`methodology.dashboard.respects_configured_paths` now carries `requires: [methodology.validator.config_spec_adr_dir]` (ADR line 138; registry line 550), which is confirmed active in the registry (status: active, supersedes: methodology.config.spec_adr_dir). Decision history (line 171) documents the correction explicitly, explaining that the original draft cited the withdrawn predecessor and why the active successor is the right dependency.

---

## New Finding (Advisory)

### Implementation Plan table is stale relative to the rest of the ADR

The Implementation Plan table (lines 189–193) was not updated to reflect the Round 1 additions. It has three issues:

1. **Line count for `boot-config-respect.test.ts` reads `~150`** but the Impact table (line 111) states `~180 lines, 6 cases`. The discrepancy is 30 lines.
2. **Row description reads "Four-case unit test"** but the Component Changes section (lines 70–75) and Integration Test Cases table enumerate six cases.
3. **`server.ts` and `server-banner.test.ts` have no rows.** The Impact table (lines 110, 112) lists both as changed files. The Implementation Plan accounts only for `boot.ts`, `boot-config-respect.test.ts`, and the ADR-0050 annotation; the banner changes are absent.

None of these stale entries affect any invariant definition, verifier, or contract. All enforcement is in place: both invariants are registered, both verifiers are named, both verifiers appear in the Integration Test Cases table. The Implementation Plan is informational only.

**Classification: advisory.** This is an internal consistency issue, not a contract gap. It should be corrected before the ADR is promoted to `implemented` so the document is fully reconciled, but it does not block draft-level acceptance.

**Required resolution:** Update the Implementation Plan to read six test cases and approximately 180 lines for `boot-config-respect.test.ts`; add rows for `server.ts` (banner parameter + `Docs dir:` emission) and `server-banner.test.ts` (one new test case); revise the total token estimate accordingly.

---

## Decision-Invariant Roundtrip Table

| Decision row | Committed to invariant? | Notes |
|---|---|---|
| Config source | Yes — in definition | |
| Field consumed | Yes — in definition | |
| Relative path resolution | Yes — in definition | |
| Fallback trigger | Yes — in definition (whitespace-only included) | |
| Bad-path behavior | Yes — in definition ("honored even when the resolved path does not exist on disk") | Gap 1 resolved |
| Malformed JSON behavior | Yes — in definition (throws) | |
| Banner display | Yes — separate invariant `methodology.dashboard.banner_shows_resolved_docs_dir` | Gap 2 resolved |
| Parser | N/A — implementation style, no contract | Acceptable |
| Test framework | N/A — framework choice, no contract | Acceptable |
| Relation to ADR-0050 | N/A — annotation only; ADR-0050 registered no invariants | Acceptable |

---

## Cross-Section Consistency

| Pair | Consistent? | Notes |
|---|---|---|
| Decisions table ↔ Error Handling table | Yes | All branches covered; no contradictions |
| Decisions table ↔ User Flow | Yes | Step 4 now covers all three branches inline |
| Decisions table ↔ Invariant Delta | Yes | All behavioral decisions encoded; banner is its own invariant |
| Invariant Delta ↔ registry.yaml | Yes | Both entries confirmed active; `requires` cite active entry |
| Integration Test Cases ↔ Component Changes | Yes | Six `boot-config-respect.test.ts` cases + banner test row all present |
| Integration Test Cases ↔ Impact table | Yes | Both verifier files listed |
| `verify[]` extension | Yes | `spec-driven-config.json` includes `cd src/sdd/docs-dashboard && bun test tests/` (Decision history line 165) |
| ADR-0050 supersession annotation | Yes | Decision history confirms annotation in-place |
| Implementation Plan ↔ Impact table | **Partial** | Stale line count, case count, missing rows — see Advisory above |
