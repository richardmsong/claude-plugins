# ADR-0083 Design Audit

**Document:** `src/sdd/docs/adr-0083-dashboard-respects-configured-adr-dir.md`
**Audit date:** 2026-05-12
**Auditor:** decision-invariant-evaluator
**Audit type:** Layer-1 (decision-invariant roundtrip, narrative coverage, cross-section consistency)

---

## Verdict

**NOT CLEAN — 3 blocking gaps, 1 advisory note.**

---

## Blocking Gaps

### Gap 1 — "Bad-path behavior" decision has no invariant and no verifier coverage

The Decisions table row "Bad-path behavior" makes a concrete behavioral commitment: when `spec.adr_dir` resolves to a nonexistent path, the dashboard honors the value and does **not** silently fall back to `<docsRoot>/docs/`. The Decision history devotes a full paragraph to justifying this choice by analogy with the Go validator.

This contract is:
- Recorded in the Decisions table (line 34).
- Recorded in the Error Handling table (line 96: "Honor the value. Downstream indexers print `docs/ directory not found at <resolved-path>` and continue").
- Recorded in the User Flow prose (lines 56–57).
- **Not encoded in the registered invariant** `methodology.dashboard.respects_configured_paths`. The invariant definition is silent on this branch.
- **Not covered by any test case** in `boot-config-respect.test.ts`. The Integration Test Cases table (lines 157–165) lists five cases; none exercises the "path is set but nonexistent" scenario. The layer-2 audit confirmed the verifier covers exactly the cases in the test table and nothing more.

Because no refactoring guard enforces this decision, the "no silent rewrite" contract can regress silently — which is precisely the class of bug this ADR exists to prevent.

**Required resolution:** Either (a) add a test case that asserts `startWatcher` is called with the configured (nonexistent) path when `spec.adr_dir` is set to a path that does not exist on disk, and extend the invariant definition to cover this branch; or (b) add a note in the Decisions table row explicitly stating "no invariant registered — downstream indexer's existing diagnostic is the only enforcement" and accept that this branch is intentionally unguarded (with a rationale for why regression here is tolerable).

---

### Gap 2 — "Banner display" decision is a narrative commitment with no invariant and no test coverage

The Decisions table row "Banner display" commits to appending `Docs dir: <resolved-path>` to the startup banner. Component Changes describes the `server.ts` change and notes that `BootResult` gains a `docsDir: string` field to carry the value to `main()`. The Impact table lists `src/sdd/docs-dashboard/src/server.ts` as a changed file.

This contract is:
- **Not encoded in any invariant** (neither `methodology.dashboard.respects_configured_paths` nor a separate entry).
- **Not covered by any test case.** The Integration Test Cases table covers only the five `boot-config-respect.test.ts` cases. `server-banner.test.ts` is not listed as a modified file in the Impact table, and no test asserts that the banner output includes the `Docs dir:` line.

The rationale given for the banner decision ("makes the bug class self-diagnostic in the future") is substantive enough to warrant enforcement. Without a test, a refactor that removes or silences the line has no signal.

**Required resolution:** Either (a) extend `server-banner.test.ts` (or add a case to `boot-config-respect.test.ts`) to assert that `boot()` returns a `docsDir` field and that the banner includes it, and register a corresponding invariant clause or separate invariant; or (b) explicitly downgrade the banner decision to an implementation note with a stated reason for not registering it (e.g., "banner output is cosmetic and intentionally unguarded").

---

### Gap 3 — User Flow section contains a stale "pending decision" placeholder

User Flow step 4 (line 50) reads:

> **Present but malformed JSON, OR present with `spec.adr_dir` pointing at a nonexistent path:** behavior pending decision.

Both behaviors are fully decided elsewhere in the same document:
- Malformed JSON: Decisions table row "Malformed JSON behavior" (line 35), Error Handling table (line 94), and the registered invariant all specify "throw an `Error`".
- Bad path: Decisions table row "Bad-path behavior" (line 34) and Error Handling table (line 96) both specify "honor the value".

The stale placeholder creates a false impression that these branches are unresolved. It also contradicts the Error Handling table that immediately follows (lines 91–96) and the registered invariant definition (which includes the malformed-JSON throw clause).

**Required resolution:** Replace the placeholder bullet with the two decided behaviors, matching the language in the Error Handling table. This is a one-line edit but the inconsistency is disqualifying for an ADR in draft-→-implemented promotion because it signals the document was not fully reconciled after the decisions were finalized.

---

## Advisory Note (non-blocking)

### `methodology.config.spec_adr_dir` is `withdrawn`

The new invariant's `requires` list cites `methodology.config.spec_adr_dir`, which carries `status: withdrawn` in the registry (lines 188–193 of `registry.yaml`). A `requires` dependency semantically asserts that the named invariant is an active precondition. Citing a withdrawn invariant is not invalid per the schema (the field is described as "presupposes," which is advisory), but it is misleading: no verifier is actively enforcing the precondition.

This is not blocking because the schema permits it and the dependency is informational. However, the ADR should either (a) note in the Invariant Delta that the cited dependency is withdrawn, or (b) use a comment to explain why a withdrawn invariant is the right citation (e.g., "structural dependency on the config field's definition, not on its active enforcement").

---

## Decision-Invariant Roundtrip Table

| Decision row | Committed to invariant? | Notes |
|---|---|---|
| Config source | Yes — in definition | |
| Field consumed | Yes — in definition | |
| Relative path resolution | Yes — in definition | |
| Fallback trigger | Yes — in definition (whitespace-only included) | |
| Bad-path behavior | **No** | Gap 1 — unregistered, untested |
| Malformed JSON behavior | Yes — in definition | |
| Banner display | **No** | Gap 2 — unregistered, untested |
| Parser | N/A — implementation style, no contract | Acceptable |
| Test framework | N/A — framework choice, no contract | Acceptable |
| Relation to ADR-0050 | N/A — annotation only; ADR-0050 registered no invariants | Acceptable |

---

## Cross-Section Consistency

| Pair | Consistent? | Notes |
|---|---|---|
| Decisions table ↔ Error Handling table | Mostly yes | Stale User Flow placeholder contradicts both (Gap 3) |
| Decisions table ↔ Invariant Delta | Partial | Bad-path and banner decisions not in Delta (Gaps 1, 2) |
| Invariant Delta ↔ registry.yaml entry | Yes | Registry entry at lines 546–552 matches the `### Added` block, with whitespace-only clause present |
| Integration Test Cases ↔ Component Changes | Partial | Banner change described in Component Changes has no test case in Integration Test Cases table |
| ADR-0050 supersession annotation | Yes | Line 12 of ADR-0050 confirms the annotation is present |
| `verify[]` extension | Yes | `spec-driven-config.json` includes `cd src/sdd/docs-dashboard && bun test tests/` |
