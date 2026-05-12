# ADR-0083 Verifier Layer-2 Audit — `methodology.dashboard.respects_configured_paths`

**Invariant**: `methodology.dashboard.respects_configured_paths`
**Verifier**: `src/sdd/docs-dashboard/tests/boot-config-respect.test.ts`
**ADR**: `src/sdd/docs/adr-0083-dashboard-respects-configured-adr-dir.md`
**Audit date**: 2026-05-12
**Auditor**: invariant-testing-evaluator
**Audit type**: Layer-2 (verifier roundtrip — test code faithfulness to registered definition)

---

## Registered Definition (from ADR-0083 `### Added` block)

> When `boot()` resolves the docs directory, it reads `<docsRoot>/spec-driven-config.json` if present and uses `config.spec.adr_dir` (resolved relative to docsRoot if not absolute); falls back to `<docsRoot>/docs/` only when the config file does not exist or its `spec.adr_dir` field is empty or missing.

---

## Reconstructed Invariant (from test code alone)

Reading only `boot-config-respect.test.ts`, the test suite collectively operationalizes the following contract:

> When `boot()` resolves the docs directory, it reads `<docsRoot>/spec-driven-config.json` if present and uses `config.spec.adr_dir` — resolved relative to docsRoot when not absolute, used as-is when absolute — as the `docsDir` argument passed to `startWatcher`; falls back to `<docsRoot>/docs/` when the config file does not exist, or when `spec.adr_dir` is missing from the config, or when `spec.adr_dir` is an empty string, or when `spec.adr_dir` is whitespace-only; throws an `Error` when the config file is present but contains malformed JSON.

### Test-case breakdown

| Case | Test name (line) | Branch exercised |
|------|-----------------|-----------------|
| 1 | "uses spec.adr_dir from config when present and relative" (76) | Relative path resolved as `join(docsRoot, adr_dir)` |
| 2 | "falls back to `<docsRoot>/docs` when no config file is present" (98) | Config absent → fallback |
| 3a | "falls back to `<docsRoot>/docs` when config lacks spec.adr_dir" (115) | Field missing (`{ spec: {} }`) → fallback |
| 3b | "falls back to `<docsRoot>/docs` when config has empty spec.adr_dir" (137) | Field empty string (`""`) → fallback |
| 3c | "falls back to `<docsRoot>/docs` when config has whitespace-only spec.adr_dir" (159) | Field whitespace only (`"   "`) → fallback |
| 4 | "uses absolute spec.adr_dir from config without further resolution" (181) | Absolute path passed through unchanged |
| 5 | "throws an Error when spec-driven-config.json contains malformed JSON" (213) | Malformed JSON → `boot()` throws |

The mock strategy is consistent across all cases: `mock.module("docs-mcp/watcher")` captures the `docsDir` argument passed to `startWatcher` (parameter position 2 in the mock signature, line 27), so the assertion is against the actual path delivered to the watcher, not an intermediate variable. The `startWatcherCalls` array is reset in `beforeEach` (line 55), ensuring no cross-test bleed. Each test (Cases 1–4) asserts `toHaveLength(1)` then checks `startWatcherCalls[0].docsDir`, fully verifying that exactly one watcher was started with the expected path.

---

## Diff: Reconstructed vs. Registered Definition

### Exact matches

- Relative path resolved relative to docsRoot: covered by Case 1.
- Fallback when config file absent: covered by Case 2.
- Fallback when `spec.adr_dir` is missing: covered by Case 3a.
- Fallback when `spec.adr_dir` is empty: covered by Case 3b.

### Reconstructed clauses not present in registered definition

**Delta 1 — Whitespace-only fallback (Case 3c)**

The test code adds a third fallback trigger: `spec.adr_dir` containing only whitespace characters (`"   "`). The registered definition says "empty or missing" — it does not mention whitespace-only strings.

Assessment: This is an extension, not a contradiction. The ADR's Error Handling table (line 95 in the ADR) states the fallback trigger as "missing/empty/whitespace" in a row separate from the `### Added` Invariant Delta. The Decisions table row "Fallback trigger" (line 33 in the ADR) also specifies "No config file, OR `spec.adr_dir` missing/empty/whitespace." The whitespace-only clause is part of the full design intent but was omitted from the one-sentence invariant definition in the `### Added` block.

**Delta 2 — Absolute path passthrough (Case 4)**

The test code adds an explicit assertion that an absolute `spec.adr_dir` is used as-is without resolution against docsRoot. The registered definition says "resolved relative to docsRoot if not absolute" — the negative condition implies the absolute passthrough, but the test makes it an explicit first-class assertion.

Assessment: The definition's phrasing "resolved relative to docsRoot if not absolute" logically implies absolute paths are not further resolved, so Case 4 is a faithful operationalization of the definition's conditional clause. This is not a drift; the test is stricter than the prose without contradicting it.

**Delta 3 — Throw on malformed JSON (Case 5)**

The test code adds `expect(() => boot(...)).toThrow()` for a malformed-JSON config. The registered definition is silent on malformed-JSON behavior — it does not mention this branch at all.

Assessment: This is an addition in the verifier not captured in the invariant definition. The ADR's Error Handling table (line 93) and Decisions table (line 35) specify throw-on-malformed-JSON, but the registered invariant in the `### Added` block does not encode it. The verifier therefore tests a behavioral contract that is designed and documented in the ADR body but is not part of the registered definition of `methodology.dashboard.respects_configured_paths`.

---

## Verdict

**CLEAN with one definition-narrowing note.**

The test code faithfully encodes the full design intent of ADR-0083. All five contract branches mandated by the ADR body are exercised, and the mock strategy correctly intercepts the `docsDir` argument at the `startWatcher` boundary. No test case contradicts the registered definition.

The registered definition (one sentence in the `### Added` block) is narrower than the verifier for two reasons:

1. It omits "whitespace-only" from the fallback trigger list (the ADR body's Decisions table and Error Handling table include it; the invariant sentence does not).
2. It is silent on malformed-JSON behavior (the ADR body specifies throw; the verifier tests it; the registered definition does not mention it).

Neither gap is a contradiction — the verifier is strictly more complete than the definition, not inconsistent with it. The test code cannot be red for reasons of definition-faithfulness; it can only be red because `boot.ts` does not yet implement the contract (the expected pre-implementation red state, as documented in the file header).

The definition should be broadened on the next registry edit to match the full verifier surface:

> When `boot()` resolves the docs directory, it reads `<docsRoot>/spec-driven-config.json` if present and uses `config.spec.adr_dir` (resolved relative to docsRoot if not absolute; used as-is if absolute) as the `docsDir` passed to downstream consumers; falls back to `<docsRoot>/docs/` when the config file does not exist or its `spec.adr_dir` field is missing, empty, or whitespace-only; throws an `Error` when the config file is present but contains malformed JSON.

This is a recommendation, not a blocking finding. The verifier as written correctly encodes the contract.

---

## Coverage Checklist (per audit instructions)

| Branch | Covered by test? | Case |
|--------|-----------------|------|
| Relative path resolution | Yes | Case 1 |
| Fallback when config absent | Yes | Case 2 |
| Fallback when field missing | Yes | Case 3a |
| Fallback when field empty | Yes | Case 3b |
| Fallback when field whitespace-only | Yes | Case 3c |
| Absolute path passthrough | Yes | Case 4 |
| Throw on malformed JSON | Yes | Case 5 |

All seven branches are covered. Coverage is complete.
