# Analysis: Invariant Extraction from ADR-0075 (line-by-line, atomic claims, with cross-references)

**Source**: `src/sdd/docs/adr-0075-invariant-driven-development.md` (826 lines)
**Purpose**: line-by-line breakdown — every substantive line is decomposed into atomic claims and each claim is classified.
**Method**: walk lines 1→826. For each line with substantive content, quote it, list every atomic claim it carries, classify each. Each invariant is *defined* at its first introduction (with HTML anchor). Every later reference is a markdown link back to that definition.
**Companion**: see `analysis-adr-0075-invariant-extraction.md` for the section-grouped first pass.

## Classification key

- **INVARIANT** — register; ID + statement + mechanism proposed at first introduction (anchored). Subsequent references are links.
- **DECISION** — recorded in Decisions table; itself not registered.
- **GLOSSARY** — defines a term used by invariants.
- **RATIONALE** — context, motivation, justification; not a contract.
- **IMPLEMENTATION** — internal to a tool; refactor-safe; not user-facing.
- **OPEN** — pending decision in the ADR's Open questions.
- **DEFERRED** — explicit future scope.
- **STRUCTURAL** — title, status, headings, code-block delimiters.
- **SUBSUMED** — atomic claim restates an invariant proposed elsewhere; do not double-count. Linked to the original proposal.

When an invariant is first introduced, it appears as: `<a id="inv-X"></a>` **INVARIANT** `` `X` `` — *statement* Mechanism: M. Subsequent references to `X` use `[X](#inv-X)`.

---

## Lines 1-5: Header / Status

| Line | Content | Classification |
|---|---|---|
| 1 | `# ADR: Invariant-Driven Development with Compiled Verification (spec-driven-dev v2)` | STRUCTURAL (title) |
| 2 | blank | — |
| 3 | `**Status**: draft` | STRUCTURAL |
| 4 | `**Status history**:` | STRUCTURAL |
| 5 | `- 2026-05-08: draft` | STRUCTURAL |

---

## Lines 7-13: Overview

### Line 7: `## Overview` — STRUCTURAL.

### Line 8: blank.

### Line 9
> "Evolve the spec-driven-dev plugin from markdown-spec methodology (v1) to invariant-driven development with compiled verification (v2). Named invariants — not markdown spec prose — become the canonical contract surface, and verification is performed by deterministic CPU-bound mechanisms (test files, lint rules, schemas, type-system checks) rather than LLM-as-judge spec-evaluators. LLMs appear only at authoring time (compiling invariants into verifier code) and audit time (quarterly differential regeneration to detect spec gaps and dead code), never in the recurring CI validation path."

Atomic claims:
1. "Evolve from v1 (markdown) to v2 (invariant-driven)" — **DECISION**.
2. "Named invariants are the canonical contract surface" — **DECISION**.
3. "Verification by deterministic CPU-bound mechanisms" — **DECISION**.
4. "Mechanism enumeration: test files, lint rules, schemas, type-system checks" — **RATIONALE** (taxonomy preview).
5. "LLM-as-judge spec-evaluators are replaced" — **RATIONALE**.
6. "LLMs only at authoring time (compiling invariants to verifier code)" — <a id="inv-methodology-llm-no-recurring-validation"></a> **INVARIANT** `methodology.llm.no_recurring_validation` — *No CI gate's pass/fail decision invokes an LLM; LLM calls only appear in skills/subagents that produce committed artifacts (invariant-compiler, audit, triage).* Mechanism: arch-rule (forbid LLM-call imports inside CI gate scripts) + AST scan.
7. "LLMs only at audit time (differential regeneration)" — **SUBSUMED** by [`methodology.llm.no_recurring_validation`](#inv-methodology-llm-no-recurring-validation).
8. "Audit cadence is quarterly" — **OPEN** (cadence in Open questions).
9. "Audit detects spec gaps and dead code" — **RATIONALE**.
10. "LLMs never in recurring CI validation path" — **SUBSUMED** by [`methodology.llm.no_recurring_validation`](#inv-methodology-llm-no-recurring-validation).

### Line 10: blank.

### Line 11
> "V1 markdown-spec methodology coexists with v2 invariant-driven methodology during transition. Consumer projects opt in per-component; both modes ship in the same plugin and share the existing skills (`/plan-feature`, `/feature-change`) which dispatch internally based on the per-component mode."

Atomic claims:
1. "V1 and v2 coexist during transition" — **DECISION**.
2. "Consumer projects opt in per-component" — <a id="inv-methodology-mode-flag-declared-per-component"></a> **INVARIANT** `methodology.mode_flag.declared_per_component` — *Every component appearing in the project has a declared `mode` field in `.sdd/components.yaml` (or equivalent).* Mechanism: schema check on components.yaml.
3. "Both modes ship in the same plugin" — **DECISION**.
4. "Skills (`/plan-feature`, `/feature-change`) are shared" — **RATIONALE**.
5. "Skills dispatch internally based on per-component mode" — <a id="inv-methodology-dispatch-respects-mode"></a> **INVARIANT** `methodology.dispatch.respects_mode` — *`/plan-feature` and `/feature-change` route to v1 or v2 logic based on the component's mode flag.* Mechanism: integration test on each skill with v1/v2 fixture components.

### Line 12: blank.

### Line 13
> "The plugin's own development uses v2 from Day 1 — agent-plugins is the bootstrap project, registering the methodology's own ~7-10 invariants first to prove the registry/glossary/CI-gate machinery before any consumer (the first being mclaude per its ADR-0100) bets on it."

Atomic claims:
1. "Plugin's own development uses v2 from Day 1" — **DEFERRED** (phasing).
2. "agent-plugins is the bootstrap project" — **RATIONALE**.
3. "Methodology's own ~7-10 invariants register first" — **DEFERRED**.
4. "Registry/glossary/CI-gate machinery proven before consumer adoption" — **RATIONALE**.
5. "mclaude is the first consumer (per ADR-0100)" — **RATIONALE**.

---

## Lines 15-25: Motivation

### Line 15: `## Motivation` — STRUCTURAL.

### Lines 17, 19-23: problem statements — all **RATIONALE** (problem articulation).

### Line 25
> "V2 shifts the contract surface from prose to executable artifacts (test files + lint rules + schemas), with a typed invariant registry as the meta-layer that names, indexes, and coverage-checks every claim. This is not a rejection of SDD's discipline — ADRs continue to carry decisions and rationale — but the spec layer becomes deterministically verifiable, and dead code becomes mechanically detectable via differential regeneration."

Atomic claims:
1. "Contract surface = executable artifacts" — **DECISION**.
2. "Artifacts are test files + lint rules + schemas" — **SUBSUMED** by Spec form decision.
3. "Typed invariant registry is the meta-layer" — **DECISION**.
4. "Registry names, indexes, coverage-checks every claim" — <a id="inv-methodology-registry-no-orphans"></a> **INVARIANT** `methodology.registry.no_orphans` — *Every active or deprecated registry entry has a live verifier; every verifier file is referenced by exactly one registered invariant.* Mechanism: deterministic script (CI gate).
5. "ADRs continue to carry decisions and rationale" — **RATIONALE**.
6. "Spec layer deterministically verifiable" — **RATIONALE**.
7. "Dead code mechanically detectable via differential regeneration" — <a id="inv-methodology-audit-differential-regeneration-per-cadence"></a> **INVARIANT** `methodology.audit.differential_regeneration_per_cadence` — *The audit ritual runs rm-and-regenerate-N on the configured cadence and produces a structured findings document.* Mechanism: integration test on /audit-invariants.

---

## Lines 27-53: Decisions table

### Line 27: `## Decisions` — STRUCTURAL.

### Line 31 (row: Spec form)
- Decision: tests + lint + schemas + analyzers, indexed by registry.
  1. "Spec form is tests + lint + schemas + analyzers" — **DECISION**.
  2. "Indexed by an invariant registry" — **SUBSUMED** by [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans).
  3. "Language-native test files (`*_test.go` for Go, `*.test.ts` for TS)" — <a id="inv-methodology-language-matches-consumer"></a> **INVARIANT** `methodology.language.matches_consumer` — *A v2 component's verifier files are written in the same language as the production code they verify.* Mechanism: schema check + arch rule.
- Rationale: tests / lint / schemas pin different things — **RATIONALE**.

### Line 32 (row: Decomposition unit)
- Decision: named invariants with stable IDs.
  1. "Decomposition unit is the named invariant" — **DECISION**.
  2. "IDs are stable" — <a id="inv-methodology-invariant-has-id"></a> **INVARIANT** `methodology.invariant.has_id` — *Every registry entry has a unique stable string ID matching `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$`.* Mechanism: schema check.
- Rationale — **RATIONALE**.

### Line 33 (row: Invariant lifecycle)
- Decision: ADRs declare deltas on a running registry; registry is source of truth.
  1. "ADRs declare deltas" — <a id="inv-methodology-adr-delta-block-required"></a> **INVARIANT** `methodology.adr.delta_block_required_for_invariant_changes` — *Any ADR that introduces, modifies, deprecates, supersedes, or withdraws an invariant has an `## Invariant Delta` section.* Mechanism: AST scan on ADR markdown.
  2. "Registry is the source of truth" — **DECISION**.
  3. "Sum of deltas = current registry" — <a id="inv-methodology-adr-delta-reconciles"></a> **INVARIANT** `methodology.adr.delta_reconciles` — *Sum of all live ADRs' (Added − Withdrawn) deltas equals the current registry contents.* Mechanism: deterministic script (CI gate).

### Line 34 (row: Verification taxonomy)
- Decision: each invariant names exactly one primary mechanism from a 10-element enum.
  1. "Each invariant names exactly one mechanism" — <a id="inv-methodology-invariant-has-mechanism"></a> **INVARIANT** `methodology.invariant.has_mechanism` — *Every registry entry has a non-null `mechanism` field.* Mechanism: schema check.
  2. "Mechanism enum: 10 declared kinds" — <a id="inv-methodology-invariant-mechanism-in-taxonomy"></a> **INVARIANT** `methodology.invariant.mechanism_in_taxonomy` — *`mechanism` field's value is in {unit, table, property, arch, ast, type, schema, completeness, integration, journey}.* Mechanism: schema check.

### Line 35 (row: LLM role)
- Decision: authoring + audit only.
  1. "LLM at authoring + audit only" — **SUBSUMED** by [`methodology.llm.no_recurring_validation`](#inv-methodology-llm-no-recurring-validation).

### Line 36 (row: Language binding)
- Decision: spec encoded in consumer language.
  1. **SUBSUMED** by [`methodology.language.matches_consumer`](#inv-methodology-language-matches-consumer).

### Line 37 (row: Constraint scope)
- Decision: constrain contracts; leave internals liquid. — **RATIONALE** (philosophy; not directly enforceable).

### Line 38 (row: Vocabulary precision)
- Decision: hybrid types-as-glossary + explicit `glossary.md`.
  1. "CI gate: every term resolves" — <a id="inv-methodology-glossary-complete"></a> **INVARIANT** `methodology.glossary.complete` — *Every term in any active invariant statement resolves to a typed binding (Go type/method) or an entry in the glossary file.* Mechanism: deterministic script (CI gate).

### Line 39 (row: Registry framework approach)
- All claims — **DECISION** / **RATIONALE** / **IMPLEMENTATION**.

### Line 40 (row: Per-mechanism tool choices)
- Decision: per-mechanism tool choices documented.
  1. "Per-mechanism tools documented in spec" — <a id="inv-methodology-mechanism-tool-documented"></a> **INVARIANT** `methodology.mechanism.tool_documented` — *Every mechanism in the taxonomy has a documented default tool in `spec-verifier-conventions.md` (per language).* Mechanism: codegen completeness on the spec doc.

### Line 41 (row: Plugin shape)
- All claims — **DECISION** + **SUBSUMED** by [`methodology.dispatch.respects_mode`](#inv-methodology-dispatch-respects-mode).

### Line 42 (row: Bootstrap project)
- All claims — **RATIONALE** / **DEFERRED**.

### Line 43 (row: Coexistence dispatch)
- Claims — **SUBSUMED** by [`methodology.mode_flag.declared_per_component`](#inv-methodology-mode-flag-declared-per-component) and [`methodology.dispatch.respects_mode`](#inv-methodology-dispatch-respects-mode).

### Line 44 (row: Stability tier)
- Decision: two-tier {draft, active}; default draft; one-promotion-per-ADR with evidence.
  1. "Tier enum is {draft, active}" — <a id="inv-methodology-invariant-tier-in-enum"></a> **INVARIANT** `methodology.invariant.tier_in_enum` — *`tier` field's value is in {draft, active}.* Mechanism: schema.
  2. "Default tier on introduction = draft" — <a id="inv-methodology-invariant-tier-default-draft"></a> **INVARIANT** `methodology.invariant.tier_default_draft` — *Newly registered invariants default to `tier=draft` unless the introducing ADR includes an explicit higher-tier-justification subsection.* Mechanism: AST scan on Added delta entries.
  3. "Promotion is pure tier-change" — <a id="inv-methodology-promotion-is-pure-tier-change-adr"></a> **INVARIANT** `methodology.promotion.is_pure_tier_change_adr` — *A Promoted delta does not modify the invariant's statement, mechanism, or verifier; only its `tier`.* Mechanism: schema (compare before/after).
  4. "Evidence required" — <a id="inv-methodology-promotion-evidence-advisory"></a> **INVARIANT** `methodology.promotion.evidence_advisory` — *The audit advisory flags promotion ADRs that lack the required evidence sections (survival cycles, utility evidence, surrounding-code-stability metric).* Mechanism: AST scan + advisory.

### Line 45 (row: Core attribute)
- Decision: core auto when ≥3 ADRs rely; manually settable; affects removal ceremony.
  1. "Core auto-set at threshold ≥3" — <a id="inv-methodology-invariant-core-computed-correctly"></a> **INVARIANT** `methodology.invariant.core_computed_correctly` — *`core` field equals `(relied_on_count ≥ threshold) OR manually_set`, recomputed on every commit affecting the citation graph.* Mechanism: codegen completeness.
  2. "Manual override" — **SUBSUMED**.
  3. "Affects removal ceremony" — <a id="inv-methodology-removal-ceremony-respects-core"></a> **INVARIANT** `methodology.removal_ceremony.respects_core` — *Withdrawing or substantively modifying a core=true invariant requires a successor (Supersession) or an explicit redesign-impact analysis subsection in the withdrawal ADR.* Mechanism: AST scan + reaction-process gating.

### Line 46 (row: Lifecycle status)
- Decision: status enum + withdrawal-deletes-verifier.
  1. "Status enum is {active, deprecated, superseded, withdrawn}" — <a id="inv-methodology-invariant-status-in-enum"></a> **INVARIANT** `methodology.invariant.status_in_enum` — *`status` field is in {active, deprecated, superseded, withdrawn}.* Mechanism: schema.
  2. "Withdrawal requires verifier file deletion in same commit" — <a id="inv-methodology-invariant-withdrawal-deletes-verifier"></a> **INVARIANT** `methodology.invariant.withdrawal_deletes_verifier` — *When an ADR's Withdrawn delta names an invariant, the same commit deletes the verifier file referenced in the registry.* Mechanism: deterministic script (CI gate, git-aware).

### Line 47 (row: Conflict resolution)
- All claims — **RATIONALE** (procedural, not enforced).

### Lines 48-53 (rows 14-19: OPEN)
- Each row's "decision pending" — **OPEN**.

---

## Lines 55-68: User Flow

### Line 55: `## User Flow` — STRUCTURAL.

### Line 59 (Step 1)
> "Change request enters."

— **RATIONALE**.

### Line 60 (Step 2)
> "Master session authors an ADR draft via /plan-feature. The skill detects v2 mode for the affected component(s) and uses the v2 ADR template, which includes a structured Invariant Delta block (added/modified/removed invariants with mechanism + verifier pointer)."

Atomic claims:
1. "Master session authors ADR drafts" — **DECISION**.
2. "ADR drafting goes through `/plan-feature`" — <a id="inv-methodology-adr-authoring-uses-plan-feature"></a> **INVARIANT** `methodology.adr_authoring.uses_plan_feature` — *Any new or modified ADR that touches invariants is authored via `/plan-feature` (not by direct file write outside the skill).* Mechanism: integration test + advisory.
3. "Skill detects v2 mode" — **SUBSUMED** by [`methodology.dispatch.respects_mode`](#inv-methodology-dispatch-respects-mode).
4. "Detection is for affected component(s)" — **IMPLEMENTATION**.
5. "v2 ADR template is used in v2 mode" — <a id="inv-methodology-plan-feature-v2-template"></a> **INVARIANT** `methodology.plan_feature.v2_template_for_v2_components` — *In v2 mode, `/plan-feature` produces ADRs that include the Invariant Delta block; in v1 mode, it does not.* Mechanism: integration test with v1/v2 fixtures.
6. "Template includes structured Invariant Delta block" — **SUBSUMED** by [`methodology.adr.delta_block_required_for_invariant_changes`](#inv-methodology-adr-delta-block-required).
7. "Block contains added/modified/removed entries" — <a id="inv-methodology-adr-delta-block-kinds-in-enum"></a> **INVARIANT** `methodology.adr.delta_block_kinds_in_enum` — *Every sub-heading inside `## Invariant Delta` is one of the 7 declared kinds (Added, Modified, Promoted, Deprecated, Superseded, Withdrawn, Relies On).* Mechanism: AST scan.
8. "Each entry has mechanism" — **SUBSUMED** by [`methodology.invariant.has_mechanism`](#inv-methodology-invariant-has-mechanism).
9. "Each entry has verifier pointer" — **SUBSUMED** by [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans).

### Line 61 (Step 3)
> "Invariant decomposition. Each new invariant is named, statemented in one line, and tagged with its primary verification mechanism. Invariants that can't name a mechanism are either inadmissible or need sharpening — this is the precision forcing function. The skill blocks ADR finalization until every proposed invariant has a mechanism."

Atomic claims:
1. "Each new invariant is named" — **SUBSUMED** by [`methodology.invariant.has_id`](#inv-methodology-invariant-has-id).
2. "Statement is one line" — <a id="inv-methodology-invariant-statement-single-line"></a> **INVARIANT** `methodology.invariant.statement_single_line` — *`statement` field contains no newline character.* Mechanism: schema.
3. "Tagged with primary mechanism" — **SUBSUMED** by [`methodology.invariant.has_mechanism`](#inv-methodology-invariant-has-mechanism).
4. "Inadmissible without mechanism" — **SUBSUMED**.
5. "Sharpening required if no mechanism fits" — **RATIONALE**.
6. "Skill blocks finalization" — <a id="inv-methodology-plan-feature-blocks-unmechanism"></a> **INVARIANT** `methodology.plan_feature.blocks_unmechanism_invariants` — *`/plan-feature` cannot transition an ADR from draft → accepted while any proposed invariant lacks a mechanism field.* Mechanism: integration test.

### Line 62 (Step 4)
> "Glossary check. A deterministic script (`/check-glossary` or run inline) verifies every term in invariant statements resolves to a typed binding or a glossary entry. New terms either get typed or get glossary entries before the ADR finalizes."

Atomic claims:
1. "Glossary check is a deterministic script" — <a id="inv-methodology-glossary-check-deterministic"></a> **INVARIANT** `methodology.glossary_check.is_deterministic_script` — *`/check-glossary` is implemented as a non-LLM script (CI-runnable; same input → same output).* Mechanism: arch rule (forbid LLM imports in the script).
2. "Available as `/check-glossary` standalone or inline" — **OPEN** (skill suite scope).
3. "Verifies every term resolves" — **SUBSUMED** by [`methodology.glossary.complete`](#inv-methodology-glossary-complete).
4. "Resolution to typed binding or glossary entry" — **SUBSUMED**.
5. "New terms get typed or glossaried before finalization" — <a id="inv-methodology-plan-feature-blocks-unresolved-terms"></a> **INVARIANT** `methodology.plan_feature.blocks_unresolved_terms` — *`/plan-feature` cannot finalize ADRs with unresolved terms in proposed invariant statements.* Mechanism: integration test.

### Line 63 (Step 5)
> "LLM compiles invariants → verifier code. The `invariant-compiler` subagent reads the new/modified invariants from the ADR delta and generates the corresponding test files, lint rules, schemas. Output is staged alongside the ADR."

Atomic claims:
1. "LLM compiles invariants → verifier code" — **DECISION**.
2. "`invariant-compiler` subagent does the compilation" — <a id="inv-methodology-invariant-compiler-is-subagent"></a> **INVARIANT** `methodology.invariant_compiler.is_subagent` — *Verifier code generation runs in a dedicated subagent (`invariant-compiler`), not inline in the master session.* Mechanism: skill/agent definition check.
3. "Subagent reads invariants from ADR delta" — <a id="inv-methodology-invariant-compiler-input-is-adr-delta"></a> **INVARIANT** `methodology.invariant_compiler.input_is_adr_delta` — *Subagent input is the ADR's Invariant Delta block contents only (not the full ADR or unrelated context).* Mechanism: integration test.
4. "Generates test files, lint rules, schemas" — <a id="inv-methodology-invariant-compiler-outputs-match-mechanism"></a> **INVARIANT** `methodology.invariant_compiler.outputs_match_mechanism` — *Output file type matches the invariant's mechanism (test file for unit/property/integration; lint rule for arch/ast; schema file for schema mechanism).* Mechanism: integration test.
5. "Output is staged alongside the ADR" — <a id="inv-methodology-invariant-compiler-output-in-pr-branch"></a> **INVARIANT** `methodology.invariant_compiler.output_in_pr_branch` — *Generated verifier files are committed to the same PR branch as the ADR delta.* Mechanism: integration test.
6. (Implicit) "Subagent runs in fresh context" — <a id="inv-methodology-subagent-fresh-context"></a> **INVARIANT** `methodology.subagent.fresh_context` — *Subagents run with no inherited conversation history from the master session.* Mechanism: agent definition check + integration test.
7. (Implicit) "Output must compile" — <a id="inv-methodology-invariant-compiler-outputs-compilable"></a> **INVARIANT** `methodology.invariant_compiler.outputs_compilable_code` — *Generated verifier code compiles in the consumer-language toolchain.* Mechanism: build check.

### Line 64 (Step 6)
> "Human reviews compiled verifiers. Same review bar as hand-written code."

— **RATIONALE**.

### Line 65 (Step 7)
> "Implementation follows. /feature-change invokes dev-harness, which writes production code that makes the verifier suite pass. For v2 components, the implementation-evaluator step is replaced by the deterministic verifier suite — `<lang> test` + lint/schema runs are the answer."

Atomic claims:
1. "Implementation flows through `/feature-change`" — **DECISION**.
2. "dev-harness writes production code" — **RATIONALE** (existing role).
3. "v2 success criterion = verifier suite passes" — <a id="inv-methodology-feature-change-uses-verifier-suite"></a> **INVARIANT** `methodology.feature_change.uses_verifier_suite_for_v2` — *For v2 components, `/feature-change`'s success criterion is "the verifier suite passes," not "implementation-evaluator returns CLEAN."* Mechanism: integration test.
4. "Implementation-evaluator replaced for v2" — **SUBSUMED**.
5. "`<lang> test` + lint + schema runs" — **DECISION**.

### Line 66 (Step 8)
> "CI runs the verifier suite on every commit. Pure CPU, sub-minute, no model dependency. Failures localize to specific invariants by ID."

Atomic claims:
1. "CI runs verifier suite on every commit" — <a id="inv-methodology-ci-runs-verifier-suite"></a> **INVARIANT** `methodology.ci.runs_verifier_suite_on_every_commit` — *CI workflow includes a job that runs the verifier suite for every PR commit.* Mechanism: GH Actions config schema check.
2. "Pure CPU, sub-minute" — **RATIONALE**.
3. "No model dependency" — **SUBSUMED** by [`methodology.llm.no_recurring_validation`](#inv-methodology-llm-no-recurring-validation).
4. "Failures localize to invariant IDs" — <a id="inv-methodology-ci-failures-attributed"></a> **INVARIANT** `methodology.ci.failures_attributed_to_invariant_id` — *When a verifier fails, the CI output identifies the failing invariant ID.* Mechanism: integration test on CI output format.

### Line 67 (Step 9)
> "Periodic differential regeneration audit (/audit-invariants). Quarterly or per major refactor checkpoint: rm production code, regenerate from invariants × N, diff results."

Atomic claims:
1. "Audit runs periodically" — <a id="inv-methodology-audit-runs-per-cadence"></a> **INVARIANT** `methodology.audit.runs_per_cadence` — *`/audit-invariants` runs at the cadence configured per project.* Mechanism: integration test + scheduled-job config check.
2. "Audit ritual: rm + regenerate × N + diff" — **SUBSUMED** by [`methodology.audit.differential_regeneration_per_cadence`](#inv-methodology-audit-differential-regeneration-per-cadence).
3. Convergence/divergence interpretations — **RATIONALE**.
4. "Output is a triaged Markdown file" — <a id="inv-methodology-audit-outputs-structured-findings"></a> **INVARIANT** `methodology.audit.outputs_structured_findings` — *Audit produces a Markdown file at a known path (`docs/audit/audit-<date>.md`) with a declared schema for findings.* Mechanism: integration test.
5. "Reviewed by human" — **RATIONALE**.
6. "Spec changes from audit are new ADRs" — **RATIONALE**.

### Line 68 (Step 10)
> "Periodic LLM audit run (advisory). Reads the invariant registry plus recent ADRs, suggests missing journeys, missing invariants, drift between ADR rationale and registry contents. Output is advisory; never blocks."

Atomic claims:
1. "LLM audit runs periodically" — **SUBSUMED** by [`methodology.audit.runs_per_cadence`](#inv-methodology-audit-runs-per-cadence).
2. "Reads registry + recent ADRs" — <a id="inv-methodology-audit-input-scope"></a> **INVARIANT** `methodology.audit.input_scope` — *Audit input is registry + ADRs in the configured time window; no production code.* Mechanism: integration test.
3. "Suggests missing journeys / invariants / drift" — **RATIONALE**.
4. "Output is advisory" — <a id="inv-methodology-audit-advisory-only"></a> **INVARIANT** `methodology.audit.advisory_only` — *Audit findings do not gate CI or block any merge; they are advisory output reviewed by humans.* Mechanism: integration test (audit failure does not change CI status).
5. "Never blocks" — **SUBSUMED**.

---

## Lines 70-129: Component Changes

### Line 70: `## Component Changes` — STRUCTURAL.

### Lines 72-78: extended skills — each is **DECISION** + behavior contracts already extracted. No new invariants here.

### Line 78 (setup extension): **INVARIANT** <a id="inv-methodology-setup-asks-mode"></a> `methodology.setup.asks_mode` — *`/setup` prompts the user for v1 or v2 mode and writes it to components.yaml.* Mechanism: integration test.

### Lines 80-85: new skills
- compile-invariants — **DECISION** + extracted in §63.
- audit-invariants — **DECISION** + extracted in §67.
- check-glossary — **DECISION** + [`methodology.glossary_check.is_deterministic_script`](#inv-methodology-glossary-check-deterministic).
- check-registry-coverage — **DECISION** + <a id="inv-methodology-registry-check-deterministic"></a> **INVARIANT** `methodology.registry_check.is_deterministic_script` — *`/check-registry-coverage` is implemented as a non-LLM script.* Mechanism: arch rule.

### Lines 87-97: agents
- invariant-compiler — extracted in §63.
- journey-author — **DEFERRED**.
- mutation-tester — **DEFERRED**.
- dev-harness extension — **SUBSUMED** by [`methodology.feature_change.uses_verifier_suite_for_v2`](#inv-methodology-feature-change-uses-verifier-suite).

### Lines 99-111: docs — **DECISION** / **STRUCTURAL**. The mechanism-tool-documented invariant from §40 covers the verifier-conventions spec.

### Lines 113-129: Day-1 invariants list — explicit listing of 9 IDs. All extracted from earlier sections via Decisions / Flow.

---

## Lines 131-210: Data Model

### Line 133: `### Invariant registry entry` — STRUCTURAL.

### Lines 135-148: registry entry schema (per field):

| Field | Invariant |
|---|---|
| `id` | [`methodology.invariant.has_id`](#inv-methodology-invariant-has-id) |
| `statement` | <a id="inv-methodology-invariant-statement-atomic"></a> `methodology.invariant.statement_atomic` — *Statement contains no logical "AND" connector at the top level.* Mechanism: lint heuristic. Plus [`methodology.invariant.statement_single_line`](#inv-methodology-invariant-statement-single-line). |
| `mechanism` | [`methodology.invariant.has_mechanism`](#inv-methodology-invariant-has-mechanism) and [`methodology.invariant.mechanism_in_taxonomy`](#inv-methodology-invariant-mechanism-in-taxonomy) |
| `verifier` | [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans) |
| `glossary_terms` | <a id="inv-methodology-invariant-glossary-terms-populated"></a> `methodology.invariant.glossary_terms_field_populated` — *`glossary_terms` lists every term from the statement that requires resolution; populated at compile time.* Mechanism: codegen consistency. |
| `tier` | [`methodology.invariant.tier_in_enum`](#inv-methodology-invariant-tier-in-enum) |
| `status` | [`methodology.invariant.status_in_enum`](#inv-methodology-invariant-status-in-enum) |
| `introduced_by` | <a id="inv-methodology-invariant-introduced-by-live-adr"></a> `methodology.invariant.introduced_by_live_adr` — *`introduced_by` field references an ADR file that exists and has status ≠ withdrawn.* Mechanism: schema cross-check. |
| `promoted_by` | <a id="inv-methodology-invariant-promoted-by-iff-active"></a> `methodology.invariant.promoted_by_set_iff_active` — *`promoted_by` is set ⇔ `tier == active`.* Mechanism: schema. |
| `superseded_by` | <a id="inv-methodology-invariant-superseded-by-iff-superseded"></a> `methodology.invariant.superseded_by_set_iff_superseded` — *`superseded_by` set ⇔ `status == superseded`; points to a live invariant ID.* Mechanism: schema cross-check. |
| `core` | [`methodology.invariant.core_computed_correctly`](#inv-methodology-invariant-core-computed-correctly) |
| `relied_on_by` | <a id="inv-methodology-invariant-relied-on-by-matches-graph"></a> `methodology.invariant.relied_on_by_matches_graph` — *`relied_on_by` field equals the set of live ADRs with Relies On edge to this invariant per anti-gaming rules.* Mechanism: codegen completeness. |

### Line 150: orthogonality of tier/status/core — **RATIONALE**.

### Line 152: `### Glossary entry` — STRUCTURAL.

### Lines 154-159: glossary entry schema (per field):

| Field | Invariant |
|---|---|
| `term` | <a id="inv-methodology-glossary-term-unique"></a> `methodology.glossary.term_unique` — *Every glossary term is unique within its scope.* Mechanism: schema. |
| `definition` | **RATIONALE**. |
| `resolves_to` | <a id="inv-methodology-glossary-resolves-to-valid"></a> `methodology.glossary.resolves_to_valid_target` — *`resolves_to` value is a real type/method, an existing invariant ID, or another glossary term.* Mechanism: schema cross-check. |
| `scope` | <a id="inv-methodology-glossary-scope-in-enum"></a> `methodology.glossary.scope_in_enum` — *`scope` ∈ {methodology, project-cross-cutting, component-local}.* Mechanism: schema. |

### Line 161: `### ADR Invariant Delta block` — STRUCTURAL.

### Lines 163-195: delta block schema:
- "Block exists for ADRs that affect invariants" — [`methodology.adr.delta_block_required_for_invariant_changes`](#inv-methodology-adr-delta-block-required).
- "Sub-block kinds are 7 declared" — [`methodology.adr.delta_block_kinds_in_enum`](#inv-methodology-adr-delta-block-kinds-in-enum).
- Per-sub-block requirements:
  - `Added`: <a id="inv-methodology-added-block-complete"></a> **INVARIANT** `methodology.adr.added_block_complete` — *Each Added entry includes id + statement + mechanism + verifier (and optional tier).* Mechanism: schema scan.
  - `Modified`: covered later (§295-305).
  - `Promoted`: [`methodology.promotion.is_pure_tier_change_adr`](#inv-methodology-promotion-is-pure-tier-change-adr).
  - `Deprecated`: <a id="inv-methodology-deprecated-block-includes-reason"></a> **INVARIANT** `methodology.deprecated_block_includes_reason_and_target` — *Deprecated entry includes reason and expected withdrawal ADR / cycle.* Mechanism: schema.
  - `Superseded`: <a id="inv-methodology-superseded-block-maps-old-new"></a> **INVARIANT** `methodology.superseded_block_maps_old_to_new` — *Superseded entry references both old and new invariant IDs.* Mechanism: schema.
  - `Withdrawn`: [`methodology.invariant.withdrawal_deletes_verifier`](#inv-methodology-invariant-withdrawal-deletes-verifier).
  - `Relies On`: [`methodology.invariant.relied_on_by_matches_graph`](#inv-methodology-invariant-relied-on-by-matches-graph).

### Line 195: registry == sum of deltas — [`methodology.adr.delta_reconciles`](#inv-methodology-adr-delta-reconciles).

### Lines 197-210: components.yaml schema:
- "Mode field per component" — [`methodology.mode_flag.declared_per_component`](#inv-methodology-mode-flag-declared-per-component).
- "Mode value enum" — <a id="inv-methodology-mode-flag-value-in-enum"></a> **INVARIANT** `methodology.mode_flag.value_in_enum` — *`mode` field's value is in {v1, v2}.* Mechanism: schema.
- "v2 references registry" — <a id="inv-methodology-mode-flag-v2-references-registry"></a> **INVARIANT** `methodology.mode_flag.v2_references_registry` — *v2 components have a `registry` field pointing to an existing registry file.* Mechanism: schema cross-check.
- "v1 references spec" — <a id="inv-methodology-mode-flag-v1-references-spec"></a> **INVARIANT** `methodology.mode_flag.v1_references_spec` — *v1 components have a `spec` field pointing to an existing markdown spec file.* Mechanism: schema cross-check.

---

## Lines 212-226: Self-Application

### Line 214
> "The methodology is self-applicable. The same registry, glossary, CI gates, and skill conventions that verify consumer-project invariants also verify the methodology's own invariants."

Atomic claims:
1. "Self-applicable" — **RATIONALE**.
2. "Same machinery" — <a id="inv-methodology-self-application-same-machinery"></a> **INVARIANT** `methodology.self_application.same_machinery` — *agent-plugins's own invariant registry uses the same registry format, glossary system, and CI gates that consumer projects use.* Mechanism: integration check.

### Lines 216-220: Bootstrap order — **DEFERRED** (phasing).

### Lines 222-226: Recursion bottoms out — **RATIONALE**.

---

## Lines 228-714: Methodology Governance

### Line 232: `### Stability tier` — STRUCTURAL.

### Lines 234-241: tier table — already covered in §44. The "higher starting tier with justification" is a new invariant:
- <a id="inv-methodology-invariant-higher-tier-justification"></a> **INVARIANT** `methodology.invariant.higher_tier_introduction_requires_justification` — *Adding an invariant at tier=active requires an explicit `### Justification` subsection in the introducing ADR's Added entry.* Mechanism: AST scan.

### Lines 243-255: Core attribute — covered in §45.

### Lines 257-271: Promotion criteria — covered in §44.

### Lines 273-281: Demotion / removal path — covered in §45 / §46. Plus:
- <a id="inv-methodology-deprecation-period-per-tier"></a> **INVARIANT** `methodology.deprecation.period_per_tier` — *Active core invariants deprecate ≥ 2 audit cycles before withdrawal; non-core ≥ 1 cycle.* Mechanism: AST scan + reaction-process gating (deadline calculations).

### Lines 283-291: Operational effect of tier — **RATIONALE** ("CI enforcement identical across tiers").

### Line 293: `#### Modification policy and runbook` — STRUCTURAL.

### Lines 295-303: 3-class table — **DECISION**. Plus:
- <a id="inv-methodology-modification-class-c-via-supersession"></a> **INVARIANT** `methodology.modification.class_c_via_supersession` — *Substantive content changes (Class C) cannot use the Modified delta; must be authored as Supersession.* Mechanism: LLM-advisory + reviewer enforcement.

### Line 305: hard rule — **SUBSUMED**.

### Lines 307-315: Class A runbook
- "Modified delta with rationale field" — <a id="inv-methodology-modified-has-rationale"></a> **INVARIANT** `methodology.modified.has_rationale_field` — *Every Modified delta has a rationale field naming the class (mechanical/sharpening).* Mechanism: schema.
- Other steps — **RATIONALE** / **IMPLEMENTATION**.

### Lines 317-327: Class B runbook
- "Re-compile verifier" — <a id="inv-methodology-modified-verifier-recompiled"></a> **INVARIANT** `methodology.modified.verifier_recompiled_for_class_b` — *A Class B Modified delta includes a verifier diff in the same commit (re-compiled output).* Mechanism: schema/git check.
- "Roundtrip CI gate" — <a id="inv-methodology-modified-roundtrip-after-class-b"></a> **INVARIANT** `methodology.modified.roundtrip_after_class_b` — *Statement-↔-verifier roundtrip is run on every Class B Modified delta and must pass.* Mechanism: integration test.
- Other steps — **SUBSUMED** (reaction process / core ceremony).

### Lines 329-335: Class C runbook — **SUBSUMED** by Withdrawn + Added invariants and reaction process.

### Lines 337-341: CI gates listed
- Roundtrip — [`methodology.modified.roundtrip_after_class_b`](#inv-methodology-modified-roundtrip-after-class-b).
- no_orphans — [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans).
- Classification advisory — <a id="inv-methodology-modified-classification-advisory"></a> **INVARIANT** `methodology.modified.classification_advisory` — *Audit LLM proposes A/B/C class for every Modified delta and flags suspected misclassification.* Mechanism: integration test on advisory.

### Lines 343-348: core stricter rules — covered by [`methodology.deprecation.period_per_tier`](#inv-methodology-deprecation-period-per-tier) and [`methodology.removal_ceremony.respects_core`](#inv-methodology-removal-ceremony-respects-core).

### Line 350: `#### Reaction process` — STRUCTURAL.

### Line 352
> "When a Modified (Class B), Superseded, or Withdrawn delta affects an invariant with relying ADRs, those ADRs must 'react' — explicitly acknowledge the change before the triggering ADR can merge."

- <a id="inv-methodology-reaction-required"></a> **INVARIANT** `methodology.reaction.required_for_class_b_supersession_withdrawal` — *Any Class B / Supersession / Withdrawal delta affecting an invariant with one or more relying ADRs requires reaction artifacts to be generated.* Mechanism: integration test.

### Line 356
> "When the triggering ADR opens as a PR, a CI hook scans the reliance graph and generates one artifact per relying ADR..."

- <a id="inv-methodology-reaction-artifact-on-pr-open"></a> **INVARIANT** `methodology.reaction.artifact_generated_on_pr_open` — *Opening a PR with a triggering delta triggers reaction artifact generation; CI hook does this on every push.* Mechanism: integration test.
- <a id="inv-methodology-reaction-one-per-relying"></a> **INVARIANT** `methodology.reaction.one_artifact_per_relying_adr` — *Number of artifacts = number of live ADRs with relies_on edge to affected invariants.* Mechanism: integration test.

### Lines 358-371: artifact YAML schema
- <a id="inv-methodology-reaction-artifact-schema"></a> **INVARIANT** `methodology.reaction.artifact_yaml_schema` — *Every reaction artifact validates against the declared schema.* Mechanism: schema.

### Line 373: artifacts in PR branch
- <a id="inv-methodology-reaction-artifacts-pr-branch"></a> **INVARIANT** `methodology.reaction.artifacts_in_pr_branch` — *Reaction artifacts live in `docs/reactions/` on the PR branch.* Mechanism: integration test.

### Lines 377-379: owner identification
- <a id="inv-methodology-reaction-owner-resolution"></a> **INVARIANT** `methodology.reaction.owner_resolution` — *Owner is resolved as: explicit Owner frontmatter > git author > project fallback.* Mechanism: codegen completeness.

### Lines 383-389: 5 ack options
- <a id="inv-methodology-reaction-ack-in-enum"></a> **INVARIANT** `methodology.reaction.ack_in_enum` — *`human_decision.ack` is in {re-pin, update, migrate, accept-unpinning, object}.* Mechanism: schema.
- Per-row effect contracts:
  - <a id="inv-methodology-reaction-repin"></a> `methodology.reaction.repin_preserves_or_migrates_edge` — *re-pin ack preserves the reliance edge (or auto-migrates to successor for Supersession).* Mechanism: integration test.
  - <a id="inv-methodology-reaction-update"></a> `methodology.reaction.update_blocks_until_followup` — *update ack requires a follow-up ADR before merge can proceed.* Mechanism: integration test.
  - <a id="inv-methodology-reaction-migrate-records"></a> `methodology.reaction.migrate_records_successor` — *migrate ack records the successor invariant ID in the reaction artifact.* Mechanism: schema.
  - <a id="inv-methodology-reaction-unpinning"></a> `methodology.reaction.unpinning_marks_adr` — *accept-unpinning ack flags the relying ADR as un-pinned in its frontmatter or status.* Mechanism: schema.
  - <a id="inv-methodology-reaction-objection"></a> `methodology.reaction.objection_blocks_merge` — *object ack blocks merge until the artifact's state changes.* Mechanism: integration test.

### Lines 393-398: state machine
- <a id="inv-methodology-reaction-state-machine"></a> **INVARIANT** `methodology.reaction.state_machine_valid` — *State transitions follow declared graph (pending → acked / expired; terminal states).* Mechanism: codegen completeness.

### Lines 402-406: expiration disposition
- <a id="inv-methodology-reaction-expiration-per-tier"></a> **INVARIANT** `methodology.reaction.expiration_disposition_per_tier` — *On expiration, draft and non-core active default to accept-unpinning; core active blocks until explicit ack.* Mechanism: integration test.

### Lines 410-414: merge gating
- <a id="inv-methodology-reaction-merge-gate"></a> **INVARIANT** `methodology.reaction.merge_blocked_until_acked` — *Merge gate fails when any reaction artifact is pending (with non-acceptable expiration) or objected.* Mechanism: integration test.

### Lines 418-420: 3 CI gates — all subsumed by [`methodology.reaction.artifact_generated_on_pr_open`](#inv-methodology-reaction-artifact-on-pr-open), [`methodology.reaction.merge_blocked_until_acked`](#inv-methodology-reaction-merge-gate), [`methodology.reaction.objection_blocks_merge`](#inv-methodology-reaction-objection).

### Lines 424-425: dashboard surface — covered later (§9j).

### Line 427: `#### Reaction triage assistant` — STRUCTURAL.

### Lines 429-437: triage inputs
- <a id="inv-methodology-triage-input-scope"></a> **INVARIANT** `methodology.triage.input_scope` — *Triage assistant receives the ADR diff, target invariant entry, relying ADR full text, and registry entry; no other context.* Mechanism: integration test.

### Lines 441-452: llm_suggestion schema
- <a id="inv-methodology-triage-suggestion-schema"></a> **INVARIANT** `methodology.triage.suggestion_schema` — *`llm_suggestion` block has the declared fields with validated types.* Mechanism: schema.
- <a id="inv-methodology-triage-human-decision-null"></a> **INVARIANT** `methodology.triage.human_decision_initially_null` — *Newly generated reaction artifact has `human_decision: null`.* Mechanism: schema.

### Lines 456-462: auto-ack policy
- <a id="inv-methodology-triage-auto-ack-policy"></a> **INVARIANT** `methodology.triage.auto_ack_per_tier_policy` — *Auto-ack only fires per the declared per-tier policy table; never on `core` invariants regardless of confidence.* Mechanism: integration test.

### Lines 468-471: 4 boundaries
- <a id="inv-methodology-triage-no-auto-object"></a> **INVARIANT** `methodology.triage.never_auto_objects` — *Triage never sets `human_decision.ack = object` autonomously.* Mechanism: integration test.
- <a id="inv-methodology-triage-no-auto-merge"></a> **INVARIANT** `methodology.triage.never_auto_merges_followups` — *Generated follow-up ADR drafts are placed in working tree but not committed by triage.* Mechanism: integration test.
- <a id="inv-methodology-triage-respects-human"></a> **INVARIANT** `methodology.triage.respects_human_decision` — *If `human_decision` is non-null, triage does not modify it.* Mechanism: integration test.
- "Never decide on core" — **SUBSUMED** by [`methodology.triage.auto_ack_per_tier_policy`](#inv-methodology-triage-auto-ack-policy).

### Lines 475-477: CI / cost / failure
- <a id="inv-methodology-triage-advisory-only"></a> **INVARIANT** `methodology.triage.advisory_only` — *Reaction merge-gate only checks `human_decision`; `llm_suggestion` is advisory.* Mechanism: integration test.
- Token cost / fallback — **IMPLEMENTATION**.

### Lines 479-481: principle preservation — **RATIONALE**.

### Line 483: `#### Where the reaction process literally runs` — STRUCTURAL.

### Line 485: CI always on
- <a id="inv-methodology-reaction-ci-always-on"></a> **INVARIANT** `methodology.reaction.ci_always_on_with_registry` — *Any project with a non-empty invariant registry has CI gates for reaction generation, triage, and merge enforcement.* Mechanism: project-config check.

### Lines 489-498: 8-step CI flow — mostly **IMPLEMENTATION**. Plus:
- <a id="inv-methodology-reaction-artifacts-persist"></a> **INVARIANT** `methodology.reaction.artifacts_persist_in_main` — *On merge, reaction artifacts persist in main's git history (optionally archived).* Mechanism: integration test.

### Line 502: every action is a slash command
- <a id="inv-methodology-reaction-cli-action-parity"></a> **INVARIANT** `methodology.reaction.cli_action_parity` — *Every reaction-related action declared in this ADR has a corresponding slash command.* Mechanism: codegen completeness.
- <a id="inv-methodology-reaction-cli-writes-direct"></a> **INVARIANT** `methodology.reaction.cli_writes_artifact_directly` — *Slash commands modify the artifact YAML files in the working tree (do not bypass via APIs).* Mechanism: integration test.

### Lines 504-512: command table
- <a id="inv-methodology-cli-list-reactions"></a> **INVARIANT** `methodology.cli.list_reactions.shape` — *Output is a structured table including reaction id, target invariant, ack state, deadline, LLM suggestion summary.* Mechanism: integration test (golden output).
- <a id="inv-methodology-cli-show-reaction"></a> **INVARIANT** `methodology.cli.show_reaction.complete` — *Output includes registry entry + LLM suggestion + relying-ADR full text excerpt.* Mechanism: integration test.
- <a id="inv-methodology-cli-ack-reaction"></a> **INVARIANT** `methodology.cli.ack_reaction.idempotent` — *Re-running with same args produces same artifact state.* Mechanism: integration test.
- <a id="inv-methodology-cli-ack-batch"></a> **INVARIANT** `methodology.cli.ack_batch.respects_filters` — *Bulk-ack only modifies artifacts matching declared filters.* Mechanism: integration test.
- <a id="inv-methodology-cli-draft-followup"></a> **INVARIANT** `methodology.cli.draft_followup.outputs_valid_adr` — *Drafted ADR file passes ADR template schema validation.* Mechanism: integration test.
- /object-reaction — **SUBSUMED** by [`methodology.reaction.objection_blocks_merge`](#inv-methodology-reaction-objection) + state machine.
- /migrate-reaction — [`methodology.reaction.migrate_records_successor`](#inv-methodology-reaction-migrate-records).

### Line 518: local-CI parity
- <a id="inv-methodology-local-ci-same-code"></a> **INVARIANT** `methodology.local_ci.same_code` — *Slash commands and CI hook call the same underlying function.* Mechanism: arch rule.
- <a id="inv-methodology-local-ci-idempotent"></a> **INVARIANT** `methodology.local_ci.idempotent` — *Same triggering ADR + reliance graph → same artifacts and triage suggestions regardless of venue.* Mechanism: integration test.

### Line 524: `### Lineage and reliance graph` — STRUCTURAL.

### Lines 530-534: 5 node types
- <a id="inv-methodology-lineage-node-types"></a> **INVARIANT** `methodology.lineage.node_types_in_enum` — *Graph nodes are typed as one of {ADR, Spec, Invariant, Verifier, GlossaryTerm}.* Mechanism: schema.

### Lines 538-549: 10 edge types
- <a id="inv-methodology-lineage-edge-types"></a> **INVARIANT** `methodology.lineage.edge_types_in_enum` — *Edges are typed as one of the 10 declared kinds.* Mechanism: schema.
- <a id="inv-methodology-lineage-edge-sources"></a> **INVARIANT** `methodology.lineage.edge_sources_consistent` — *Each edge type's data source matches its declared source-of-truth.* Mechanism: codegen completeness.

### Lines 553-558: explicit Relies On only
- <a id="inv-methodology-reliance-inline-advisory"></a> **INVARIANT** `methodology.reliance.inline_mentions_advisory` — *Inline mentions of invariant IDs in ADR prose do not contribute to reliance count; only explicit Relies On blocks do.* Mechanism: integration test.

### Lines 562-575: relied_on_count formula — covered by anti-gaming rules below.

### Lines 577-583: 3 anti-gaming rules
- <a id="inv-methodology-reliance-live-only"></a> **INVARIANT** `methodology.reliance.live_adrs_only` — *Reliance count excludes withdrawn or superseded-as-doc ADRs.* Mechanism: codegen completeness.
- <a id="inv-methodology-reliance-no-meta-double-count"></a> **INVARIANT** `methodology.reliance.no_meta_double_count` — *An ADR with a meta-edge cannot also have a Relies On edge to the same invariant.* Mechanism: schema/AST scan.
- <a id="inv-methodology-reliance-set-cardinality"></a> **INVARIANT** `methodology.reliance.set_cardinality` — *Per-ADR Relies On entries deduplicate to a set.* Mechanism: codegen completeness.

### Lines 587-594: 6 MCP tools
- <a id="inv-methodology-mcp-list"></a> `methodology.mcp.list_invariants_complete` — *Returns every registered invariant with tier/status/core/mechanism/verifier.* Mechanism: integration test.
- <a id="inv-methodology-mcp-search"></a> `methodology.mcp.search_invariants_supports_dimensions` — *Supports full-text + structured filters.* Mechanism: integration test.
- <a id="inv-methodology-mcp-get"></a> `methodology.mcp.get_invariant_returns_computed_fields` — *Returns full registry entry + computed `relied_on_count`, `core`, `relied_on_by`.* Mechanism: integration test.
- <a id="inv-methodology-mcp-lineage"></a> `methodology.mcp.get_invariant_lineage_complete` — *Returns all 6 ADR-edge types and supersession chain.* Mechanism: integration test.
- <a id="inv-methodology-mcp-adr-invariants"></a> `methodology.mcp.get_adr_invariants_extends_lineage` — *Returns all introduces/modifies/promotes/deprecates/withdraws/relies-on edges for an ADR.* Mechanism: integration test.
- <a id="inv-methodology-mcp-verifier-invariants"></a> `methodology.mcp.get_verifier_invariants_reverse` — *Returns set of invariants pinned by a verifier file.* Mechanism: integration test.

### Lines 598-609: dashboard read views
- <a id="inv-methodology-dashboard-views"></a> **INVARIANT** `methodology.dashboard.declared_views_present` — *Dashboard route table includes all 8 declared read views.* Mechanism: codegen completeness.

### Lines 613-624: dashboard write parity
- <a id="inv-methodology-dashboard-cli-parity"></a> **INVARIANT** `methodology.dashboard.cli_parity` — *Each CLI slash command has a corresponding dashboard write action; bijection enforced.* Mechanism: codegen completeness.
- <a id="inv-methodology-dashboard-same-format"></a> **INVARIANT** `methodology.dashboard.same_artifact_format` — *Dashboard writes produce artifact YAML files identical to CLI outputs.* Mechanism: integration test.

### Lines 632-635: local mode
- <a id="inv-methodology-dashboard-local-mode"></a> **INVARIANT** `methodology.dashboard.local_mode_uses_local_git` — *Local-mode dashboard write actions execute via local git operations using developer's identity.* Mechanism: integration test.

### Lines 639-643: hosted mode — **DEFERRED**.

### Lines 647-656: human_decision schema
- <a id="inv-methodology-reaction-attribution"></a> **INVARIANT** `methodology.reaction.author_attribution_recorded` — *Every acked artifact has populated `human_decision.ack`, `acked_by`, `acked_at`, `venue` fields.* Mechanism: schema.
- <a id="inv-methodology-reaction-venue-enum"></a> **INVARIANT** `methodology.reaction.venue_in_enum` — *`venue` field is in the declared 3-element enum.* Mechanism: schema.

### Lines 662-664: failure modes — **IMPLEMENTATION**.

### Lines 668-674: existing dashboard infrastructure — **RATIONALE**.

### Lines 676-685: lifecycle status table — **SUBSUMED** by [`methodology.invariant.status_in_enum`](#inv-methodology-invariant-status-in-enum) and [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans).

### Lines 687-714: conflict resolution
- Authority hierarchy / table — **RATIONALE**.
- "Roundtrip drift detection" — <a id="inv-methodology-audit-roundtrip"></a> **INVARIANT** `methodology.audit.roundtrip_runs_per_audit_cycle` — *Each audit cycle includes a statement-↔-verifier roundtrip per registered invariant.* Mechanism: integration test.
- Differential regen — [`methodology.audit.differential_regeneration_per_cadence`](#inv-methodology-audit-differential-regeneration-per-cadence).
- Mutation testing — **DEFERRED**.
- Coverage-of-statement audit — **SUBSUMED** by audit advisory invariants.

---

## Lines 716-722: Error Handling

5 error categories. New invariant:
- <a id="inv-methodology-dispatch-halt"></a> **INVARIANT** `methodology.dispatch.halts_on_unknown_mode` — *`/plan-feature` halts and asks for clarification when a component has missing or unknown mode.* Mechanism: integration test.

---

## Lines 724-731: Security

All claims **RATIONALE** (consumer-side capabilities) or **SUBSUMED** by [`methodology.subagent.fresh_context`](#inv-methodology-subagent-fresh-context).

---

## Lines 733-826: Impact / Scope / Open / Tests / Implementation

- **Impact**: file enumeration — **STRUCTURAL** / **DECISION**.
- **Scope**: in-scope and deferred items — already covered or **DEFERRED**.
- **Open Questions**: all **OPEN**.
- **Integration Test Cases**: verifier code for already-extracted invariants.
- **Implementation Plan**: phasing, estimates — **STRUCTURAL** / **DEFERRED**.

---

## Aggregate registration index (links into the walkthrough)

### Schema / structural / lifecycle

- [`methodology.invariant.has_id`](#inv-methodology-invariant-has-id)
- [`methodology.invariant.has_mechanism`](#inv-methodology-invariant-has-mechanism)
- [`methodology.invariant.mechanism_in_taxonomy`](#inv-methodology-invariant-mechanism-in-taxonomy)
- [`methodology.invariant.statement_atomic`](#inv-methodology-invariant-statement-atomic)
- [`methodology.invariant.statement_single_line`](#inv-methodology-invariant-statement-single-line)
- [`methodology.invariant.tier_in_enum`](#inv-methodology-invariant-tier-in-enum)
- [`methodology.invariant.tier_default_draft`](#inv-methodology-invariant-tier-default-draft)
- [`methodology.invariant.higher_tier_introduction_requires_justification`](#inv-methodology-invariant-higher-tier-justification)
- [`methodology.invariant.status_in_enum`](#inv-methodology-invariant-status-in-enum)
- [`methodology.invariant.introduced_by_live_adr`](#inv-methodology-invariant-introduced-by-live-adr)
- [`methodology.invariant.promoted_by_set_iff_active`](#inv-methodology-invariant-promoted-by-iff-active)
- [`methodology.invariant.superseded_by_set_iff_superseded`](#inv-methodology-invariant-superseded-by-iff-superseded)
- [`methodology.invariant.core_computed_correctly`](#inv-methodology-invariant-core-computed-correctly)
- [`methodology.invariant.relied_on_by_matches_graph`](#inv-methodology-invariant-relied-on-by-matches-graph)
- [`methodology.invariant.glossary_terms_field_populated`](#inv-methodology-invariant-glossary-terms-populated)
- [`methodology.invariant.withdrawal_deletes_verifier`](#inv-methodology-invariant-withdrawal-deletes-verifier)
- [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans)
- [`methodology.adr.delta_reconciles`](#inv-methodology-adr-delta-reconciles)
- [`methodology.adr.delta_block_required_for_invariant_changes`](#inv-methodology-adr-delta-block-required)
- [`methodology.adr.delta_block_kinds_in_enum`](#inv-methodology-adr-delta-block-kinds-in-enum)
- [`methodology.adr.added_block_complete`](#inv-methodology-added-block-complete)
- [`methodology.deprecated_block_includes_reason_and_target`](#inv-methodology-deprecated-block-includes-reason)
- [`methodology.superseded_block_maps_old_to_new`](#inv-methodology-superseded-block-maps-old-new)

### Glossary

- [`methodology.glossary.complete`](#inv-methodology-glossary-complete)
- [`methodology.glossary.term_unique`](#inv-methodology-glossary-term-unique)
- [`methodology.glossary.resolves_to_valid_target`](#inv-methodology-glossary-resolves-to-valid)
- [`methodology.glossary.scope_in_enum`](#inv-methodology-glossary-scope-in-enum)

### Mode dispatch

- [`methodology.dispatch.respects_mode`](#inv-methodology-dispatch-respects-mode)
- [`methodology.mode_flag.declared_per_component`](#inv-methodology-mode-flag-declared-per-component)
- [`methodology.mode_flag.value_in_enum`](#inv-methodology-mode-flag-value-in-enum)
- [`methodology.mode_flag.v2_references_registry`](#inv-methodology-mode-flag-v2-references-registry)
- [`methodology.mode_flag.v1_references_spec`](#inv-methodology-mode-flag-v1-references-spec)
- [`methodology.dispatch.halts_on_unknown_mode`](#inv-methodology-dispatch-halt)

### Skills

- [`methodology.adr_authoring.uses_plan_feature`](#inv-methodology-adr-authoring-uses-plan-feature)
- [`methodology.plan_feature.v2_template_for_v2_components`](#inv-methodology-plan-feature-v2-template)
- [`methodology.plan_feature.blocks_unmechanism_invariants`](#inv-methodology-plan-feature-blocks-unmechanism)
- [`methodology.plan_feature.blocks_unresolved_terms`](#inv-methodology-plan-feature-blocks-unresolved-terms)
- [`methodology.feature_change.uses_verifier_suite_for_v2`](#inv-methodology-feature-change-uses-verifier-suite)
- [`methodology.setup.asks_mode`](#inv-methodology-setup-asks-mode)
- [`methodology.glossary_check.is_deterministic_script`](#inv-methodology-glossary-check-deterministic)
- [`methodology.registry_check.is_deterministic_script`](#inv-methodology-registry-check-deterministic)
- [`methodology.cli.list_reactions.shape`](#inv-methodology-cli-list-reactions)
- [`methodology.cli.show_reaction.complete`](#inv-methodology-cli-show-reaction)
- [`methodology.cli.ack_reaction.idempotent`](#inv-methodology-cli-ack-reaction)
- [`methodology.cli.ack_batch.respects_filters`](#inv-methodology-cli-ack-batch)
- [`methodology.cli.draft_followup.outputs_valid_adr`](#inv-methodology-cli-draft-followup)

### Subagents

- [`methodology.subagent.fresh_context`](#inv-methodology-subagent-fresh-context)
- [`methodology.invariant_compiler.is_subagent`](#inv-methodology-invariant-compiler-is-subagent)
- [`methodology.invariant_compiler.input_is_adr_delta`](#inv-methodology-invariant-compiler-input-is-adr-delta)
- [`methodology.invariant_compiler.outputs_match_mechanism`](#inv-methodology-invariant-compiler-outputs-match-mechanism)
- [`methodology.invariant_compiler.output_in_pr_branch`](#inv-methodology-invariant-compiler-output-in-pr-branch)
- [`methodology.invariant_compiler.outputs_compilable_code`](#inv-methodology-invariant-compiler-outputs-compilable)

### Audit

- [`methodology.audit.advisory_only`](#inv-methodology-audit-advisory-only)
- [`methodology.audit.differential_regeneration_per_cadence`](#inv-methodology-audit-differential-regeneration-per-cadence)
- [`methodology.audit.outputs_structured_findings`](#inv-methodology-audit-outputs-structured-findings)
- [`methodology.audit.runs_per_cadence`](#inv-methodology-audit-runs-per-cadence)
- [`methodology.audit.input_scope`](#inv-methodology-audit-input-scope)
- [`methodology.audit.roundtrip_runs_per_audit_cycle`](#inv-methodology-audit-roundtrip)

### Modification policy

- [`methodology.modification.class_c_via_supersession`](#inv-methodology-modification-class-c-via-supersession)
- [`methodology.modified.has_rationale_field`](#inv-methodology-modified-has-rationale)
- [`methodology.modified.verifier_recompiled_for_class_b`](#inv-methodology-modified-verifier-recompiled)
- [`methodology.modified.roundtrip_after_class_b`](#inv-methodology-modified-roundtrip-after-class-b)
- [`methodology.modified.classification_advisory`](#inv-methodology-modified-classification-advisory)
- [`methodology.removal_ceremony.respects_core`](#inv-methodology-removal-ceremony-respects-core)
- [`methodology.deprecation.period_per_tier`](#inv-methodology-deprecation-period-per-tier)
- [`methodology.promotion.is_pure_tier_change_adr`](#inv-methodology-promotion-is-pure-tier-change-adr)
- [`methodology.promotion.evidence_advisory`](#inv-methodology-promotion-evidence-advisory)

### Reaction process

- [`methodology.reaction.required_for_class_b_supersession_withdrawal`](#inv-methodology-reaction-required)
- [`methodology.reaction.artifact_generated_on_pr_open`](#inv-methodology-reaction-artifact-on-pr-open)
- [`methodology.reaction.one_artifact_per_relying_adr`](#inv-methodology-reaction-one-per-relying)
- [`methodology.reaction.artifact_yaml_schema`](#inv-methodology-reaction-artifact-schema)
- [`methodology.reaction.artifacts_in_pr_branch`](#inv-methodology-reaction-artifacts-pr-branch)
- [`methodology.reaction.artifacts_persist_in_main`](#inv-methodology-reaction-artifacts-persist)
- [`methodology.reaction.owner_resolution`](#inv-methodology-reaction-owner-resolution)
- [`methodology.reaction.ack_in_enum`](#inv-methodology-reaction-ack-in-enum)
- [`methodology.reaction.repin_preserves_or_migrates_edge`](#inv-methodology-reaction-repin)
- [`methodology.reaction.update_blocks_until_followup`](#inv-methodology-reaction-update)
- [`methodology.reaction.migrate_records_successor`](#inv-methodology-reaction-migrate-records)
- [`methodology.reaction.unpinning_marks_adr`](#inv-methodology-reaction-unpinning)
- [`methodology.reaction.objection_blocks_merge`](#inv-methodology-reaction-objection)
- [`methodology.reaction.state_machine_valid`](#inv-methodology-reaction-state-machine)
- [`methodology.reaction.expiration_disposition_per_tier`](#inv-methodology-reaction-expiration-per-tier)
- [`methodology.reaction.merge_blocked_until_acked`](#inv-methodology-reaction-merge-gate)
- [`methodology.reaction.author_attribution_recorded`](#inv-methodology-reaction-attribution)
- [`methodology.reaction.venue_in_enum`](#inv-methodology-reaction-venue-enum)
- [`methodology.reaction.cli_action_parity`](#inv-methodology-reaction-cli-action-parity)
- [`methodology.reaction.cli_writes_artifact_directly`](#inv-methodology-reaction-cli-writes-direct)
- [`methodology.reaction.ci_always_on_with_registry`](#inv-methodology-reaction-ci-always-on)

### Triage assistant

- [`methodology.triage.input_scope`](#inv-methodology-triage-input-scope)
- [`methodology.triage.suggestion_schema`](#inv-methodology-triage-suggestion-schema)
- [`methodology.triage.human_decision_initially_null`](#inv-methodology-triage-human-decision-null)
- [`methodology.triage.auto_ack_per_tier_policy`](#inv-methodology-triage-auto-ack-policy)
- [`methodology.triage.never_auto_objects`](#inv-methodology-triage-no-auto-object)
- [`methodology.triage.never_auto_merges_followups`](#inv-methodology-triage-no-auto-merge)
- [`methodology.triage.respects_human_decision`](#inv-methodology-triage-respects-human)
- [`methodology.triage.advisory_only`](#inv-methodology-triage-advisory-only)

### Lineage / reliance / MCP

- [`methodology.lineage.node_types_in_enum`](#inv-methodology-lineage-node-types)
- [`methodology.lineage.edge_types_in_enum`](#inv-methodology-lineage-edge-types)
- [`methodology.lineage.edge_sources_consistent`](#inv-methodology-lineage-edge-sources)
- [`methodology.reliance.inline_mentions_advisory`](#inv-methodology-reliance-inline-advisory)
- [`methodology.reliance.live_adrs_only`](#inv-methodology-reliance-live-only)
- [`methodology.reliance.no_meta_double_count`](#inv-methodology-reliance-no-meta-double-count)
- [`methodology.reliance.set_cardinality`](#inv-methodology-reliance-set-cardinality)
- [`methodology.mcp.list_invariants_complete`](#inv-methodology-mcp-list)
- [`methodology.mcp.search_invariants_supports_dimensions`](#inv-methodology-mcp-search)
- [`methodology.mcp.get_invariant_returns_computed_fields`](#inv-methodology-mcp-get)
- [`methodology.mcp.get_invariant_lineage_complete`](#inv-methodology-mcp-lineage)
- [`methodology.mcp.get_adr_invariants_extends_lineage`](#inv-methodology-mcp-adr-invariants)
- [`methodology.mcp.get_verifier_invariants_reverse`](#inv-methodology-mcp-verifier-invariants)

### Dashboard

- [`methodology.dashboard.declared_views_present`](#inv-methodology-dashboard-views)
- [`methodology.dashboard.cli_parity`](#inv-methodology-dashboard-cli-parity)
- [`methodology.dashboard.same_artifact_format`](#inv-methodology-dashboard-same-format)
- [`methodology.dashboard.local_mode_uses_local_git`](#inv-methodology-dashboard-local-mode)

### Self-application + cross-cutting

- [`methodology.self_application.same_machinery`](#inv-methodology-self-application-same-machinery)
- [`methodology.local_ci.same_code`](#inv-methodology-local-ci-same-code)
- [`methodology.local_ci.idempotent`](#inv-methodology-local-ci-idempotent)

### CI behavior

- [`methodology.ci.runs_verifier_suite_on_every_commit`](#inv-methodology-ci-runs-verifier-suite)
- [`methodology.ci.failures_attributed_to_invariant_id`](#inv-methodology-ci-failures-attributed)
- [`methodology.llm.no_recurring_validation`](#inv-methodology-llm-no-recurring-validation)

### Mechanism documentation

- [`methodology.mechanism.tool_documented`](#inv-methodology-mechanism-tool-documented)

### Marginal

- [`methodology.language.matches_consumer`](#inv-methodology-language-matches-consumer)

---

## Final tally

**Total atomic invariants identified: ~115-120** after de-duplication and consolidation across all 826 lines of the ADR.

This is significantly higher than both the original "9 Day-1" framing in the ADR itself and the v0 analysis's "~75-85" count. The increase comes from per-line atomic granularity, per-tool/skill/MCP-tool/dashboard-view behavior contracts, per-field schema invariants, and per-edge-type lineage invariants.

### Phased registration

| Phase | Tools required | Cumulative invariants |
|---|---|---|
| Phase 1 | registry parser + glossary parser + ADR delta parser + components.yaml parser + 4 deterministic CI scripts | ~35 (all schema/lifecycle/mode-dispatch) |
| Phase 2 | invariant-compiler subagent + extended /plan-feature + extended /feature-change + extended /setup | ~50 |
| Phase 3 | /audit-invariants + /check-glossary + /check-registry-coverage + modification CI gates | ~65 |
| Phase 4 | reaction artifact generator + merge gate + 7 reaction slash commands + triage assistant subagent | ~95 |
| Phase 5 | docs-mcp invariant index + 6 new MCP tools + 8 dashboard read views + 8 dashboard write actions | ~118 |
| Phase 6 | Hosted-mode dashboard + cleanup | ~120 |

### What this means for the ADR

The "Methodology's own registry — Day 1 contents" section (lines 113-129 of ADR-0075) should be revised to:
1. List ~35 Phase-1 invariants (not 9), which are the schema/structural/lifecycle/dispatch ones provable on Day 1.
2. Add a phased-registration table showing which invariants come online with which tools.
3. Total methodology-own registry size at full implementation: **~115-120 invariants**.

### Notes

This analysis treats every atomic claim that could plausibly be enforced as a contract as a candidate invariant. In practice, some candidates may be:
- **Consolidated** — multiple atomic claims in different places that restate the same thing get one ID.
- **Dropped as RATIONALE** — claims that reflect intent/philosophy without deterministic enforcement.
- **Deferred indefinitely** — claims that are true-by-construction or that no one will realistically check.

Even with aggressive consolidation and dropping, the realistic implemented count stays above ~80. The 9-invariant Day-1 framing was the lowest-effort starting point, not the actual full registry.
