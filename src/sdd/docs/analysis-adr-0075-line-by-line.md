# Analysis: Invariant Extraction from ADR-0075 (line-by-line, atomic claims)

**Source**: `src/sdd/docs/adr-0075-invariant-driven-development.md` (826 lines)
**Purpose**: line-by-line breakdown — every substantive line is decomposed into atomic claims and each claim is classified.
**Method**: walk lines 1→826. For each line with substantive content, quote it, list every atomic claim it carries, classify each. Blank, structural-only, and code-block-internal lines are noted briefly. Code-block content (YAML, pseudocode) is analyzed at the schema/contract level.
**Companion**: see `analysis-adr-0075-invariant-extraction.md` for the section-grouped first pass.

## Classification key

- **INVARIANT** — register; ID + mechanism proposed.
- **DECISION** — recorded in Decisions table; itself not registered (consequences become invariants).
- **GLOSSARY** — defines a term used by invariants.
- **RATIONALE** — context, motivation, justification; not a contract.
- **IMPLEMENTATION** — internal to a tool; refactor-safe; not user-facing.
- **OPEN** — pending decision in the ADR's Open questions.
- **DEFERRED** — explicit future scope.
- **STRUCTURAL** — title, status, headings, code-block delimiters.
- **SUBSUMED** — atomic claim is restating an invariant proposed elsewhere; do not double-count.

When multiple lines restate the same invariant, only the *first occurrence* gets the proposed ID; later occurrences are marked SUBSUMED.

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
4. "Mechanism enumeration: test files, lint rules, schemas, type-system checks" — **RATIONALE** (taxonomy preview; the actual taxonomy invariant is `methodology.invariant.mechanism_in_taxonomy`).
5. "LLM-as-judge spec-evaluators are replaced" — **RATIONALE**.
6. "LLMs only at authoring time (compiling invariants to verifier code)" — **INVARIANT** `methodology.llm.no_recurring_validation` — *No CI gate's pass/fail decision invokes an LLM; LLM calls only appear in skills/subagents that produce committed artifacts (invariant-compiler, audit, triage).* Mechanism: arch-rule (forbid LLM-call imports inside CI gate scripts) + AST scan.
7. "LLMs only at audit time (differential regeneration)" — **SUBSUMED** by claim 6.
8. "Audit cadence is quarterly" — **OPEN** (cadence is in Open questions).
9. "Audit detects spec gaps and dead code" — **RATIONALE** (audit purpose).
10. "LLMs never in recurring CI validation path" — **SUBSUMED** by claim 6.

### Line 10: blank.

### Line 11
> "V1 markdown-spec methodology coexists with v2 invariant-driven methodology during transition. Consumer projects opt in per-component; both modes ship in the same plugin and share the existing skills (`/plan-feature`, `/feature-change`) which dispatch internally based on the per-component mode."

Atomic claims:
1. "V1 and v2 coexist during transition" — **DECISION** (Coexistence dispatch).
2. "Consumer projects opt in per-component" — **INVARIANT** `methodology.mode_flag.declared_per_component` — *Every component appearing in the project has a declared mode field in `.sdd/components.yaml` (or equivalent).* Mechanism: schema check on components.yaml.
3. "Both modes ship in the same plugin" — **DECISION** (Plugin shape).
4. "Skills (`/plan-feature`, `/feature-change`) are shared" — **RATIONALE** (consequence of plugin shape).
5. "Skills dispatch internally based on per-component mode" — **INVARIANT** `methodology.dispatch.respects_mode` — *`/plan-feature` and `/feature-change` route to v1 or v2 logic based on the component's mode flag.* Mechanism: integration test on each skill with v1/v2 fixture components.

### Line 12: blank.

### Line 13
> "The plugin's own development uses v2 from Day 1 — agent-plugins is the bootstrap project, registering the methodology's own ~7-10 invariants first to prove the registry/glossary/CI-gate machinery before any consumer (the first being mclaude per its ADR-0100) bets on it."

Atomic claims:
1. "Plugin's own development uses v2 from Day 1" — **DEFERRED** (implementation phasing; not a methodology contract).
2. "agent-plugins is the bootstrap project" — **RATIONALE** (project identification).
3. "Methodology's own ~7-10 invariants register first" — **DEFERRED** (Phase-2 plan; bootstrap timing is OPEN per Open questions).
4. "Registry/glossary/CI-gate machinery proven before consumer adoption" — **RATIONALE**.
5. "mclaude is the first consumer (per ADR-0100)" — **RATIONALE** (cross-reference).

---

## Lines 15-25: Motivation

### Line 15: `## Motivation` — STRUCTURAL.

### Line 17
> "The v1 SDD pipeline has a structural weakness: every gap between markdown spec and code is checked by an LLM evaluator doing fuzzy alignment."

Atomic claims:
1. "V1 spec/code gap-checking uses LLM evaluator" — **RATIONALE** (problem statement).
2. "LLM alignment is fuzzy" — **RATIONALE**.

### Line 19
> "Recurring per-CI cost. spec-evaluator + implementation-evaluator run on every change; tokens accumulate and outcomes vary across model versions."

Claims: all **RATIONALE** (problem articulation).

### Line 20
> "Non-deterministic outcomes. Two runs of the same evaluator on the same code can disagree."

Claims: all **RATIONALE**.

### Line 21
> "Inability to detect dead/erroneous code."

Claims: all **RATIONALE**.

### Line 22
> "Spec drift at the vocabulary layer."

Claims: all **RATIONALE**. (The fix — glossary completeness — is an invariant proposed elsewhere.)

### Line 23
> "Premature crystallization vs. unconstrained drift."

Claims: all **RATIONALE**.

### Line 25
> "V2 shifts the contract surface from prose to executable artifacts (test files + lint rules + schemas), with a typed invariant registry as the meta-layer that names, indexes, and coverage-checks every claim. This is not a rejection of SDD's discipline — ADRs continue to carry decisions and rationale — but the spec layer becomes deterministically verifiable, and dead code becomes mechanically detectable via differential regeneration."

Atomic claims:
1. "Contract surface = executable artifacts" — **DECISION** (Spec form).
2. "Artifacts are test files + lint rules + schemas" — **SUBSUMED** by Decision row.
3. "Typed invariant registry is the meta-layer" — **DECISION** (Decomposition unit).
4. "Registry names, indexes, coverage-checks every claim" — **INVARIANT** `methodology.registry.no_orphans` — *Every active or deprecated registry entry has a live verifier; every verifier file is referenced by exactly one registered invariant.* Mechanism: deterministic script (CI gate).
5. "ADRs continue to carry decisions and rationale" — **RATIONALE**.
6. "Spec layer becomes deterministically verifiable" — **RATIONALE** (consequence).
7. "Dead code mechanically detectable via differential regeneration" — **INVARIANT** `methodology.audit.differential_regeneration_per_cadence` — *The audit ritual runs rm-and-regenerate-N on the configured cadence and produces a structured findings document.* Mechanism: integration test on /audit-invariants.

---

## Lines 27-53: Decisions table

### Line 27: `## Decisions` — STRUCTURAL.

Each table row's cells produce atomic claims. Format below: row → column → atomic claims.

### Line 31 (row: Spec form)
- Decision cell: "Tests as spec: `*_test.go`, `.arch/`, schema files, lint analyzers, indexed by registry."
  1. "Spec form is tests + lint + schemas + analyzers" — **DECISION**.
  2. "Indexed by an invariant registry" — **SUBSUMED** by Line 25 claim 4.
  3. "Language-native test files (`*_test.go` for Go, `*.test.ts` for TS)" — **INVARIANT** `methodology.language.matches_consumer` — *A v2 component's verifier files are written in the same language as the production code they verify.* Mechanism: schema check on per-component config + arch rule (verifier file extension matches language). Marginal; could also be RATIONALE.
- Rationale cell: "Tests pin behavior, lint pins structure, schemas pin contracts; markdown can't be deterministically verified at acceptable cost." — **RATIONALE**.

### Line 32 (row: Decomposition unit)
- Decision cell: "Named invariants with stable IDs (e.g. `topology.user_has_one_namespace`)."
  1. "Decomposition unit is the named invariant" — **DECISION**.
  2. "IDs are stable" — **INVARIANT** `methodology.invariant.has_id` — *Every registry entry has a unique stable string ID matching `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$`.* Mechanism: schema check on registry.
  3. "ID format suggested: dot-separated namespace.subname" — **SUBSUMED** by claim 2.
- Rationale: "ADRs too coarse, unit tests too granular; invariants give a coverage-checkable, roundtrippable, evolvable registry." — **RATIONALE**.

### Line 33 (row: Invariant lifecycle)
- Decision: "ADRs declare deltas (add/modify/remove) on a running registry; registry is source of truth."
  1. "ADRs declare deltas" — **INVARIANT** `methodology.adr.delta_block_required_for_invariant_changes` — *Any ADR that introduces, modifies, deprecates, supersedes, or withdraws an invariant has an `## Invariant Delta` section.* Mechanism: AST scan on ADR markdown.
  2. "Registry is the source of truth for current state" — **DECISION** (consequence).
  3. "Sum of deltas = current registry" — **INVARIANT** `methodology.adr.delta_reconciles` — *Sum of all live ADRs' (Added − Withdrawn) deltas equals the current registry contents.* Mechanism: deterministic script (CI gate).
- Rationale: "Specs collapse history; registry is timeless; roundtripping current invariants is well-defined." — **RATIONALE**.

### Line 34 (row: Verification taxonomy)
- Decision: "Each invariant names exactly one primary mechanism: unit | table | property | arch | ast | type | schema | completeness | integration | journey."
  1. "Each invariant names exactly one primary mechanism" — **INVARIANT** `methodology.invariant.has_mechanism` — *Every registry entry has a non-null mechanism field.* Mechanism: schema check.
  2. "Mechanism set is the closed enum {unit, table, property, arch, ast, type, schema, completeness, integration, journey}" — **INVARIANT** `methodology.invariant.mechanism_in_taxonomy` — *Mechanism field's value is in the declared 10-element enum.* Mechanism: schema check.
- Rationale: "Forces precision discipline." — **RATIONALE**.

### Line 35 (row: LLM role)
- Decision: "Authoring + audit only, never recurring validation."
  1. "LLM at authoring + audit only" — **SUBSUMED** by Line 9 claim 6 (`methodology.llm.no_recurring_validation`).
- Rationale: "Token cost paid once, CI is sub-minute and deterministic." — **RATIONALE**.

### Line 36 (row: Language binding)
- Decision: "Spec encoded in the consumer language; the language is part of the contract."
  1. "Spec encoded in consumer language" — **SUBSUMED** by Line 31 claim 3 (`methodology.language.matches_consumer`).
  2. "Language is part of the contract" — **RATIONALE** (philosophy).
- Rationale: "Goroutine semantics, context.Context, error-wrapping, async/await are load-bearing." — **RATIONALE**.

### Line 37 (row: Constraint scope)
- Decision: "Constrain contracts; leave internals liquid."
  1. "Constrain contracts only" — **RATIONALE** (philosophy; not directly enforceable).
  2. "Internals stay liquid" — **RATIONALE**.
- Rationale: "Overconstraint causes refactor friction; differential regen tells us when the line is wrong." — **RATIONALE**.

### Line 38 (row: Vocabulary precision)
- Decision: "Hybrid types-as-glossary + explicit `glossary.md`."
  1. "Types are the primary glossary" — **DECISION** + implies `methodology.glossary.complete`.
  2. "Explicit glossary file for cross-cutting / ambiguous terms" — **DECISION**.
  3. "CI gate: every term resolves to typed binding or glossary entry" — **INVARIANT** `methodology.glossary.complete` — *Every term in any active invariant statement resolves to a typed binding (Go type/method) or an entry in the glossary file.* Mechanism: deterministic script (CI gate).
- Rationale: "Un-pinned terms drift at the vocabulary layer." — **RATIONALE**.

### Line 39 (row: Registry framework approach)
- Decision: "Custom thin per-language layer + reuse of per-mechanism tools."
  1. "Custom thin layer (~200 LOC)" — **IMPLEMENTATION** (size estimate, not a contract).
  2. "Reuse per-mechanism tools" — **DECISION**.
- Rationale: ArchUnit/TLA+/etc. don't fit. — **RATIONALE**.

### Line 40 (row: Per-mechanism tool choices Go)
- Decision: lists tools per mechanism.
  1. Each tool choice is a **DECISION** (per-project tunable, not a methodology contract).
  2. "Per-mechanism tool choices documented" — **INVARIANT** `methodology.mechanism.tool_documented` — *Every mechanism in the taxonomy has a documented default tool in spec-verifier-conventions.md (per language).* Mechanism: codegen completeness on the spec doc.
- Rationale: "Mature, Go-native, refactor-friendly." — **RATIONALE**.

### Line 41 (row: Plugin shape)
- Decision: "Evolution of spec-driven-dev (v2 supersedes v1); both modes coexist per-component."
  1. "Evolution, not sibling plugin" — **DECISION**.
  2. "v2 supersedes v1" — **DECISION** (versioning).
  3. "Both modes coexist per-component during transition" — **SUBSUMED** by `methodology.dispatch.respects_mode`.
- Rationale: lower fragmentation. — **RATIONALE**.

### Line 42 (row: Bootstrap project)
- Decision: "agent-plugins itself; methodology own first."
  1. "agent-plugins is the bootstrap project" — **RATIONALE**.
  2. "Methodology's own invariants register first (Day 1), consumer follows (Day N)" — **DEFERRED** (phasing).
- Rationale: self-application is evidence of generality. — **RATIONALE**.

### Line 43 (row: Coexistence dispatch)
- Decision: "Per-component mode flag in project-level config."
  1. "Mode flag is per-component" — **SUBSUMED** by `methodology.mode_flag.declared_per_component`.
  2. "Flag read by `/plan-feature` and `/feature-change`" — **SUBSUMED** by `methodology.dispatch.respects_mode`.
  3. "Flag in a project-level config" — **DECISION** (location is OPEN; see Open questions).

### Line 44 (row: Stability tier)
- Decision: "Two-tier: draft / active. Default = draft. One promotion ADR per invariant; evidence required."
  1. "Tier enum is {draft, active}" — **INVARIANT** `methodology.invariant.tier_in_enum` — *`tier` field's value is in {draft, active}.* Mechanism: schema.
  2. "Default tier on introduction = draft" — **INVARIANT** `methodology.invariant.tier_default_draft` — *Newly registered invariants default to tier=draft unless the introducing ADR includes an explicit higher-tier-justification subsection.* Mechanism: AST scan on Added delta entries.
  3. "One promotion ADR per invariant per level" — **INVARIANT** `methodology.promotion.is_pure_tier_change_adr` — *A Promoted delta does not modify the invariant's statement, mechanism, or verifier; only its tier.* Mechanism: schema (compare before/after).
  4. "Evidence required (audit survival, utility, surrounding-code stability)" — **INVARIANT** `methodology.promotion.evidence_advisory` — *The audit advisory flags promotion ADRs that lack the required evidence sections (survival cycles, utility evidence, surrounding-code-stability metric).* Mechanism: AST scan + advisory.
- Rationale: "Four tiers imposed too many promotion ADRs." — **RATIONALE**.

### Line 45 (row: Core attribute computed)
- Decision: "`core: true` auto when ≥3 ADRs rely as load-bearing; manually settable; affects removal ceremony."
  1. "core auto-set at threshold ≥3" — **INVARIANT** `methodology.invariant.core_computed_correctly` — *`core` field equals `(relied_on_count ≥ threshold) OR manually_set`, recomputed on every commit affecting the citation graph.* Mechanism: codegen completeness — derived field consistency check.
  2. "Threshold per-project configurable" — **IMPLEMENTATION** (config, not a contract).
  3. "Manual override" — **SUBSUMED** by claim 1.
  4. "Affects removal ceremony" — **INVARIANT** `methodology.removal_ceremony.respects_core` — *Withdrawing or substantively modifying a core=true invariant requires a successor (Supersession) or an explicit redesign-impact analysis subsection in the withdrawal ADR.* Mechanism: AST scan on withdrawal ADRs + reaction-process gating.
- Rationale: "Core is a consequence, not a state; reuses lineage-dashboard concept." — **RATIONALE**.

### Line 46 (row: Lifecycle status)
- Decision: "Active / deprecated / superseded / withdrawn. Withdrawal requires verifier deletion same commit."
  1. "Status enum is {active, deprecated, superseded, withdrawn}" — **INVARIANT** `methodology.invariant.status_in_enum` — *`status` field is in {active, deprecated, superseded, withdrawn}.* Mechanism: schema.
  2. "Withdrawal requires verifier file deletion in same commit" — **INVARIANT** `methodology.invariant.withdrawal_deletes_verifier` — *When an ADR's Withdrawn delta names an invariant, the same commit deletes the verifier file referenced in the registry.* Mechanism: deterministic script (CI gate, git-aware).
- Rationale: "Separates 'still enforced?' from 'how committed?'" — **RATIONALE**.

### Line 47 (row: Conflict resolution)
- Decision: "Statement > verifier > code; verifier is operational truth; statement-↔-verifier conflict treats verifier as bug."
  1. Authority hierarchy — **RATIONALE** (procedural, not enforced).
  2. "Operational reality: verifier is what CI runs" — **RATIONALE**.
  3. "Conflict resolution: fix verifier" — **RATIONALE**.
- Rationale: "An explicit hierarchy gives a deterministic resolution rule." — **RATIONALE**.

### Lines 48-53 (rows 14-19: OPEN questions in table form)
- Each row's "decision pending" cell — **OPEN**. No invariant extractable until resolved.

---

## Lines 55-68: User Flow

### Line 55: `## User Flow` — STRUCTURAL.
### Line 57: "The development cycle for a v2 component" — STRUCTURAL/RATIONALE.

### Line 59 (Step 1)
> "Change request enters. User asks for a feature, fix, refactor, etc."

Claims: **RATIONALE** (process trigger).

### Line 60 (Step 2)
> "Master session authors an ADR draft via `/plan-feature`. The skill detects v2 mode for the affected component(s) and uses the v2 ADR template, which includes a structured Invariant Delta block (added/modified/removed invariants with mechanism + verifier pointer)."

Atomic claims:
1. "Master session authors ADR drafts" — **DECISION** (process role).
2. "ADR drafting goes through `/plan-feature`" — **INVARIANT** `methodology.adr_authoring.uses_plan_feature` — *Any new or modified ADR that touches invariants is authored via `/plan-feature` (not by direct file write outside the skill).* Mechanism: integration test + advisory (hard to enforce mechanically; advisory).
3. "Skill detects v2 mode" — **SUBSUMED** by `methodology.dispatch.respects_mode`.
4. "Detection is for affected component(s)" — **IMPLEMENTATION** (how detection works).
5. "v2 ADR template is used in v2 mode" — **INVARIANT** `methodology.plan_feature.v2_template_for_v2_components` — *In v2 mode, `/plan-feature` produces ADRs that include the Invariant Delta block; in v1 mode, it does not.* Mechanism: integration test with v1/v2 fixtures.
6. "Template includes a structured Invariant Delta block" — **SUBSUMED** by `methodology.adr.delta_block_required_for_invariant_changes`.
7. "Block contains added/modified/removed entries" — **INVARIANT** `methodology.adr.delta_block_kinds_in_enum` — *Every sub-heading inside `## Invariant Delta` is one of the 7 declared kinds (Added, Modified, Promoted, Deprecated, Superseded, Withdrawn, Relies On).* Mechanism: AST scan on ADR.
8. "Each entry has a mechanism" — **SUBSUMED** by `methodology.invariant.has_mechanism`.
9. "Each entry has a verifier pointer" — **SUBSUMED** by `methodology.registry.no_orphans` (verifier pointer existence).

### Line 61 (Step 3)
> "Invariant decomposition. Each new invariant is named, statemented in one line, and tagged with its primary verification mechanism. Invariants that can't name a mechanism are either inadmissible or need sharpening — this is the precision forcing function. The skill blocks ADR finalization until every proposed invariant has a mechanism."

Atomic claims:
1. "Each new invariant is named" — **SUBSUMED** by `methodology.invariant.has_id`.
2. "Statement is one line" — **INVARIANT** `methodology.invariant.statement_single_line` — *`statement` field contains no newline character.* Mechanism: schema.
3. "Tagged with primary mechanism" — **SUBSUMED** by `methodology.invariant.has_mechanism`.
4. "Invariants without mechanism are inadmissible" — **SUBSUMED** by claim 3.
5. "Sharpening required if no mechanism fits" — **RATIONALE** (process discipline).
6. "Skill blocks ADR finalization until every proposed invariant has a mechanism" — **INVARIANT** `methodology.plan_feature.blocks_unmechanism_invariants` — *`/plan-feature` cannot transition an ADR from draft → accepted while any proposed invariant lacks a mechanism field.* Mechanism: integration test on /plan-feature finalization step.

### Line 62 (Step 4)
> "Glossary check. A deterministic script (`/check-glossary` or run inline) verifies every term in invariant statements resolves to a typed binding or a glossary entry. New terms either get typed or get glossary entries before the ADR finalizes."

Atomic claims:
1. "Glossary check is a deterministic script" — **INVARIANT** `methodology.glossary_check.is_deterministic_script` — *`/check-glossary` is implemented as a non-LLM script (CI-runnable; same input → same output).* Mechanism: arch rule (forbid LLM imports in the script).
2. "Available as `/check-glossary` standalone or inline" — **DECISION** (skill suite scope is OPEN).
3. "Verifies every term resolves" — **SUBSUMED** by `methodology.glossary.complete`.
4. "Resolution is to typed binding or glossary entry" — **SUBSUMED** by `methodology.glossary.complete`.
5. "New terms get typed or glossaried before finalization" — **INVARIANT** `methodology.plan_feature.blocks_unresolved_terms` — *`/plan-feature` cannot finalize ADRs with unresolved terms in proposed invariant statements.* Mechanism: integration test.

### Line 63 (Step 5)
> "LLM compiles invariants → verifier code. The `invariant-compiler` subagent reads the new/modified invariants from the ADR delta and generates the corresponding test files, lint rules, schemas. Output is staged alongside the ADR."

Atomic claims:
1. "LLM compiles invariants → verifier code" — **DECISION** (LLM authoring step).
2. "`invariant-compiler` subagent does the compilation" — **INVARIANT** `methodology.invariant_compiler.is_subagent` — *Verifier code generation runs in a dedicated subagent (`invariant-compiler`), not inline in the master session.* Mechanism: skill/agent definition check.
3. "Subagent reads invariants from ADR delta" — **INVARIANT** `methodology.invariant_compiler.input_is_adr_delta` — *Subagent input is the ADR's Invariant Delta block contents only (not the full ADR or unrelated context).* Mechanism: integration test on subagent invocation.
4. "Generates test files, lint rules, schemas" — **INVARIANT** `methodology.invariant_compiler.outputs_match_mechanism` — *Output file type matches the invariant's mechanism (test file for unit/property/integration; lint rule for arch/ast; schema file for schema mechanism).* Mechanism: integration test.
5. "Output is staged alongside the ADR" — **INVARIANT** `methodology.invariant_compiler.output_in_pr_branch` — *Generated verifier files are committed to the same PR branch as the ADR delta.* Mechanism: integration test.
6. (Implicit) "Subagent runs in fresh context" — **INVARIANT** `methodology.subagent.fresh_context` — *Subagents run with no inherited conversation history from the master session.* Mechanism: agent definition check + integration test.
7. (Implicit) "Output must compile" — **INVARIANT** `methodology.invariant_compiler.outputs_compilable_code` — *Generated verifier code compiles in the consumer-language toolchain.* Mechanism: build check.

### Line 64 (Step 6)
> "Human reviews compiled verifiers. Same review bar as hand-written code."

Atomic claims:
1. "Human reviews compiled verifiers" — **RATIONALE** (process).
2. "Same review bar as hand-written code" — **RATIONALE**.

### Line 65 (Step 7)
> "Implementation follows. `/feature-change` invokes dev-harness, which writes production code that makes the verifier suite pass. For v2 components, the implementation-evaluator step is replaced by the deterministic verifier suite — `<lang> test` + lint/schema runs are the answer."

Atomic claims:
1. "Implementation flows through `/feature-change`" — **DECISION** (process role).
2. "`/feature-change` invokes dev-harness" — **SUBSUMED** by existing v1 behavior; not new.
3. "dev-harness writes production code" — **RATIONALE** (existing role).
4. "v2 success criterion = verifier suite passes" — **INVARIANT** `methodology.feature_change.uses_verifier_suite_for_v2` — *For v2 components, `/feature-change`'s success criterion is "the verifier suite passes," not "implementation-evaluator returns CLEAN."* Mechanism: integration test on /feature-change v2 path.
5. "Implementation-evaluator replaced for v2" — **SUBSUMED** by claim 4.
6. "Verifier suite includes `<lang> test` + lint + schema runs" — **DECISION**/**RATIONALE** (per-mechanism tool choices).

### Line 66 (Step 8)
> "CI runs the verifier suite on every commit. Pure CPU, sub-minute, no model dependency. Failures localize to specific invariants by ID."

Atomic claims:
1. "CI runs verifier suite on every commit" — **INVARIANT** `methodology.ci.runs_verifier_suite_on_every_commit` — *CI workflow includes a job that runs the verifier suite for every PR commit.* Mechanism: GH Actions config schema check.
2. "Pure CPU, sub-minute" — **RATIONALE** (performance expectation, not a contract).
3. "No model dependency" — **SUBSUMED** by `methodology.llm.no_recurring_validation`.
4. "Failures localize to specific invariants by ID" — **INVARIANT** `methodology.ci.failures_attributed_to_invariant_id` — *When a verifier fails, the CI output identifies the failing invariant ID.* Mechanism: integration test on CI output format.

### Line 67 (Step 9)
> "Periodic differential regeneration audit (`/audit-invariants`). Quarterly or per major refactor checkpoint: rm production code, regenerate from invariants × N, diff results. Convergence-with-correctness validates spec precision. Divergence-with-correctness reveals appropriate underconstraint. Divergence-with-incorrectness localizes spec gaps to specific decisions. Output is a triaged Markdown file reviewed by a human; spec changes are authored as new ADRs."

Atomic claims:
1. "Audit runs periodically (quarterly or per refactor checkpoint)" — **INVARIANT** `methodology.audit.runs_per_cadence` — *`/audit-invariants` runs at the cadence configured per project.* Mechanism: integration test + scheduled-job config check. Note: cadence default is OPEN.
2. "Audit ritual: rm + regenerate × N + diff" — **INVARIANT** `methodology.audit.differential_regeneration_per_cadence` — *Audit removes production code, regenerates N times from registry, diffs outputs, and classifies divergence.* Mechanism: integration test.
3. "Convergence-with-correctness signal" — **RATIONALE** (interpretation).
4. "Divergence-with-correctness signal" — **RATIONALE**.
5. "Divergence-with-incorrectness signal" — **RATIONALE**.
6. "Output is a triaged Markdown file" — **INVARIANT** `methodology.audit.outputs_structured_findings` — *Audit produces a Markdown file at a known path (`docs/audit/audit-<date>.md`) with a declared schema for findings.* Mechanism: integration test on output.
7. "Reviewed by a human" — **RATIONALE** (advisory).
8. "Spec changes from audit authored as new ADRs" — **RATIONALE** (process).

### Line 68 (Step 10)
> "Periodic LLM audit run (advisory). Reads the invariant registry plus recent ADRs, suggests missing journeys, missing invariants, drift between ADR rationale and registry contents. Output is advisory; never blocks."

Atomic claims:
1. "LLM audit runs periodically" — **SUBSUMED** by `methodology.audit.runs_per_cadence`.
2. "Reads registry + recent ADRs" — **INVARIANT** `methodology.audit.input_scope` — *Audit input is registry + ADRs in the configured time window; no production code.* Mechanism: integration test on audit invocation.
3. "Suggests missing journeys, missing invariants, drift" — **RATIONALE** (suggestions; advisory output).
4. "Output is advisory" — **INVARIANT** `methodology.audit.advisory_only` — *Audit findings do not gate CI or block any merge; they are advisory output reviewed by humans.* Mechanism: integration test (audit failure does not change CI status).
5. "Never blocks" — **SUBSUMED** by claim 4.

---

## Lines 70-129: Component Changes

### Line 70: `## Component Changes` — STRUCTURAL.

### Line 72-78: existing skills extended

Each item is a **DECISION** (which skills change) plus an **IMPLEMENTATION** detail (what changes inside). Behavior contracts are extracted under User Flow above (already counted).

### Line 80-85: new skills

Each new skill creates an existence claim:
- `compile-invariants` — **DECISION** + behavior contracts already counted.
- `audit-invariants` — **DECISION** + behavior already counted.
- `check-glossary` — **DECISION** + `methodology.glossary_check.is_deterministic_script` (Line 62).
- `check-registry-coverage` — **DECISION** + the registry/glossary CI invariants already counted.

Plus the additional invariants:
- "check-glossary is CI-runnable" — **SUBSUMED**.
- "check-registry-coverage is CI-runnable" — **INVARIANT** `methodology.registry_check.is_deterministic_script` — *`/check-registry-coverage` is implemented as a non-LLM script.* Mechanism: arch rule (forbid LLM imports).

### Line 87-97: agents

- `invariant-compiler` (new) — behavior contracts already counted in Line 63.
- `journey-author` (deferred) — **DEFERRED**.
- `mutation-tester` (deferred) — **DEFERRED**.
- `dev-harness` (extended) — **SUBSUMED** by `methodology.feature_change.uses_verifier_suite_for_v2`.

### Line 99-111: docs

- `spec-invariant-driven-development.md` — **DECISION** (new file exists).
- `spec-invariant-registry.md` — depends on OPEN registry-format question.
- `spec-verifier-conventions.md` — **INVARIANT** `methodology.mechanism.tool_documented` (Line 40 claim 2).
- `spec-glossary.md` — **DECISION**.
- `spec-agents.md` extension — **DECISION**.
- `context.md` extension — **DECISION**.

### Line 113-129: methodology's own registry

Lists 9 invariants. These are an explicit Day-1 set; all are extracted in earlier sections via the relevant decisions/flows.

---

## Lines 131-210: Data Model

### Line 131: `## Data Model` — STRUCTURAL.

### Line 133: `### Invariant registry entry (format pending; conceptual shape)` — STRUCTURAL.

### Lines 135-148: registry entry schema (code block)

Each field implies a schema invariant:

| Field | Atomic claims |
|---|---|
| `id` | `methodology.invariant.has_id` (already proposed). |
| `statement` | `methodology.invariant.statement_atomic` — *Statement contains no logical "AND" connector at the top level.* Mechanism: lint heuristic. Plus `methodology.invariant.statement_single_line` (Line 61). |
| `mechanism` | `methodology.invariant.has_mechanism` and `methodology.invariant.mechanism_in_taxonomy`. |
| `verifier` | `methodology.registry.no_orphans` (verifier pointer must exist). |
| `glossary_terms` | **INVARIANT** `methodology.invariant.glossary_terms_field_populated` — *`glossary_terms` lists every term from the statement that requires resolution; populated at compile time.* Mechanism: codegen consistency. (Subsumes / consolidates with `methodology.glossary.complete`.) |
| `tier` | `methodology.invariant.tier_in_enum`. |
| `status` | `methodology.invariant.status_in_enum`. |
| `introduced_by` | **INVARIANT** `methodology.invariant.introduced_by_live_adr` — *`introduced_by` field references an ADR file that exists and has status ≠ withdrawn.* Mechanism: schema cross-check. |
| `promoted_by` | **INVARIANT** `methodology.invariant.promoted_by_set_iff_active` — *`promoted_by` is set ⇔ `tier == active`.* Mechanism: schema. |
| `superseded_by` | **INVARIANT** `methodology.invariant.superseded_by_set_iff_superseded` — *`superseded_by` set ⇔ `status == superseded`; points to a live invariant ID.* Mechanism: schema cross-check. |
| `core` | `methodology.invariant.core_computed_correctly` (Line 45). |
| `relied_on_by` | **INVARIANT** `methodology.invariant.relied_on_by_matches_graph` — *`relied_on_by` field equals the set of live ADRs with Relies On edge to this invariant per anti-gaming rules.* Mechanism: codegen completeness — derived field. |

### Line 150
> "tier governs change process; status governs whether verifier runs; core elevates removal ceremony but doesn't add a state. The three axes are orthogonal."

Atomic claims:
1. "tier governs change process" — **RATIONALE** (intent).
2. "status governs verifier-runs and registry handling" — **RATIONALE** (intent).
3. "core elevates removal ceremony only" — **SUBSUMED** by `methodology.removal_ceremony.respects_core`.
4. "Three axes orthogonal" — **RATIONALE**.

### Line 152: `### Glossary entry (format pending)` — STRUCTURAL.

### Lines 154-159: glossary entry schema

| Field | Invariants |
|---|---|
| `term` | **INVARIANT** `methodology.glossary.term_unique` — *Every glossary term is unique within its scope.* Mechanism: schema. |
| `definition` | RATIONALE (descriptive). |
| `resolves_to` | **INVARIANT** `methodology.glossary.resolves_to_valid_target` — *`resolves_to` value is a real type/method, an existing invariant ID, or another glossary term.* Mechanism: schema cross-check. |
| `scope` | **INVARIANT** `methodology.glossary.scope_in_enum` — *`scope` ∈ {methodology, project-cross-cutting, component-local}.* Mechanism: schema. |

### Line 161: `### ADR Invariant Delta block` — STRUCTURAL.

### Lines 163-195: delta block schema

The block declares 7 sub-block kinds (Added, Modified, Promoted, Deprecated, Superseded, Withdrawn, Relies On). Each has its own schema requirement:

- "Block exists for ADRs that affect invariants" — `methodology.adr.delta_block_required_for_invariant_changes` (already proposed Line 33).
- "Sub-block kinds are the declared 7" — `methodology.adr.delta_block_kinds_in_enum` (already proposed Line 60).
- Per-sub-block requirements:
  - `Added`: must include statement, mechanism, verifier, optional tier — **INVARIANT** `methodology.adr.added_block_complete` — *Each Added entry includes id + statement + mechanism + verifier (and optional tier).* Mechanism: schema scan.
  - `Modified`: must include rationale (class A/B/C); Class C forbidden — `methodology.modification.class_c_via_supersession` (Line 305) + `methodology.modified.has_rationale_field`.
  - `Promoted`: tier-only change — `methodology.promotion.is_pure_tier_change_adr` (Line 44).
  - `Deprecated`: deprecation reason + expected withdrawal — **INVARIANT** `methodology.deprecated_block_includes_reason_and_target` — *Deprecated entry includes reason and expected withdrawal ADR / cycle.* Mechanism: schema.
  - `Superseded`: maps old_id → new_id — **INVARIANT** `methodology.superseded_block_maps_old_to_new` — *Superseded entry references both old and new invariant IDs.* Mechanism: schema.
  - `Withdrawn`: requires verifier file deletion in same commit — `methodology.invariant.withdrawal_deletes_verifier`.
  - `Relies On`: feeds reliance graph — `methodology.invariant.relied_on_by_matches_graph`.

### Line 195
> "The CI gate verifies that the running registry equals the sum of all ADR deltas (Added − Withdrawn, with Modified/Promoted/Deprecated/Superseded tracked through status fields and the reliance graph maintained from `Relies On` blocks)."

Atomic claims:
1. "CI gate verifies registry == sum of deltas" — `methodology.adr.delta_reconciles` (Line 33).
2. "Reliance graph maintained from Relies On blocks" — `methodology.invariant.relied_on_by_matches_graph` (Line 147).

### Line 197: `### Per-component mode flag` — STRUCTURAL.

### Lines 199-210: components.yaml schema

- "Mode flag in components.yaml" — `methodology.mode_flag.declared_per_component` (Line 11).
- "Per-component mode field is in {v1, v2}" — **INVARIANT** `methodology.mode_flag.value_in_enum` — *`mode` field's value is in {v1, v2}.* Mechanism: schema.
- "v2 components reference a registry path" — **INVARIANT** `methodology.mode_flag.v2_references_registry` — *v2 components have a `registry` field pointing to an existing registry file.* Mechanism: schema cross-check.
- "v1 components reference a spec path" — **INVARIANT** `methodology.mode_flag.v1_references_spec` — *v1 components have a `spec` field pointing to an existing markdown spec file.* Mechanism: schema cross-check.

---

## Lines 212-226: Self-Application

### Line 212: heading — STRUCTURAL.

### Line 214
> "The methodology is self-applicable. The same registry, glossary, CI gates, and skill conventions that verify consumer-project invariants also verify the methodology's own invariants. This isn't a curiosity — it's evidence the framework is general, and it determines the implementation order."

Atomic claims:
1. "Methodology is self-applicable" — **RATIONALE** (philosophy).
2. "Same registry/glossary/CI gates apply to methodology's own invariants" — **INVARIANT** `methodology.self_application.same_machinery` — *agent-plugins's own invariant registry uses the same registry format, glossary system, and CI gates that consumer projects use.* Mechanism: integration check (no methodology-specific paths).
3. "Generality and implementation order" — **RATIONALE**.

### Lines 216-220: Bootstrap order
Atomic claims: all **DEFERRED** (phasing).

### Line 222-226: Where recursion bottoms out
- "Trusted primitives are not invariant-checked" — **RATIONALE** (philosophy).
- Each primitive (toolchain, fs, git, human judgment) — **RATIONALE**.

---

## Lines 228-714: Methodology Governance

The largest section. Walking through subsections with the same line-by-line approach.

### Line 228: heading — STRUCTURAL.

### Line 230
> "The methodology has three load-bearing artifacts that encode the same truth in three forms: invariant statements (intent, English), verifiers (enforcement, deterministic), production code (implementation, runtime). Three artifacts means duplication, and duplication means drift."

Atomic claims: all **RATIONALE** (problem framing for the section).

### Line 232: `### Stability tier` — STRUCTURAL.

### Lines 234-241

Atomic claims:
1. Tier table — already covered in Decisions row 14 (Line 44).
2. "Default tier on introduction = draft" — `methodology.invariant.tier_default_draft`.
3. "Higher starting tier with explicit justification" — **INVARIANT** `methodology.invariant.higher_tier_introduction_requires_justification` — *Adding an invariant at tier=active requires an explicit `### Justification` subsection in the introducing ADR's Added entry.* Mechanism: AST scan.

### Line 243: `#### Core attribute (computed, not a tier)` — STRUCTURAL.

### Lines 245-249: claims subsumed by Line 45.

### Lines 251-255: effects of core=true subsumed by `methodology.removal_ceremony.respects_core` (Line 45) and reaction-process invariants (later).

### Line 257: `#### Promotion criteria` — STRUCTURAL.

### Line 259
> "The single promotion `draft → active` is its own ADR (a pure tier-change delta). The promoting ADR must include the evidence below; the audit advisory flags promotions that lack it."

Atomic claims:
1. "Single promotion is its own ADR" — `methodology.promotion.is_pure_tier_change_adr` (Line 44).
2. "Audit advisory flags promotions lacking evidence" — `methodology.promotion.evidence_advisory` (Line 44).

### Lines 261-271: 4 evidence requirements
- Each requirement is a **RATIONALE** for what evidence the audit advisory looks for; the advisory itself is the invariant.
- "Can be batched" — **RATIONALE** (process flexibility).

### Line 273: `#### Demotion / removal path` — STRUCTURAL.

### Lines 275-281: per-tier ceremony table
- Each row's ceremony — covered by `methodology.removal_ceremony.respects_core` (variant) and `methodology.invariant.withdrawal_deletes_verifier`.
- Specifically: "deprecation period default 1 cycle for non-core, 2 cycles for core" — **INVARIANT** `methodology.deprecation.period_per_tier` — *Active core invariants deprecate ≥ 2 audit cycles before withdrawal; non-core ≥ 1 cycle.* Mechanism: AST scan + reaction-process gating (deadline calculations).

### Line 283: `#### Operational effect of tier` — STRUCTURAL.

### Lines 285-291: claims subsumed by tier definitions; "CI enforcement identical across tiers" — **RATIONALE**.

### Line 293: `#### Modification policy and runbook` — STRUCTURAL.

### Line 295
> "Modification is the most dangerous delta type because it can silently change the contract..."

Atomic claims: all **RATIONALE** (problem framing).

### Lines 299-303: Three-class table
- Class A definition — **DECISION**.
- Class B definition — **DECISION**.
- Class C definition — **DECISION**.
- "Class C must be Supersession" — **INVARIANT** `methodology.modification.class_c_via_supersession` — *Substantive content changes (Class C) cannot use the Modified delta; must be authored as Supersession.* Mechanism: LLM-advisory + reviewer enforcement (deterministic check is hard; advisory).

### Line 305
> "The hard rule: Class C must be Supersession. If the contract is changing, withdraw the old invariant and introduce a new one with a new ID. Relying ADRs explicitly redeclare reliance on the new..."

Atomic claims:
1. "Class C must be Supersession" — **SUBSUMED** by Line 305.
2. "Withdrawal + new introduction with new ID" — **SUBSUMED** by `methodology.invariant.withdrawal_deletes_verifier` + `methodology.adr.added_block_complete`.
3. "Relying ADRs redeclare reliance on new" — **SUBSUMED** by reaction process.
4. "Audit advisory flags Modified that look substantive" — **INVARIANT** `methodology.modified.classification_advisory` — *Audit LLM proposes A/B/C class for every Modified delta and flags suspected misclassification.* Mechanism: integration test on advisory.

### Lines 307-315: Class A runbook
- "Modified delta with rationale = mechanical" — **INVARIANT** `methodology.modified.has_rationale_field` — *Every Modified delta has a rationale field naming the class.* Mechanism: schema.
- "Verifier path update if changed" — **IMPLEMENTATION**.
- "Roundtrip advisory" — **SUBSUMED** by audit roundtrip.
- "Reliance review not required" — **RATIONALE** (process detail).
- "Single commit" — **RATIONALE**.

### Lines 317-327: Class B runbook
- "Modified delta with rationale = sharpening" — `methodology.modified.has_rationale_field`.
- "Re-compile verifier via invariant-compiler" — **INVARIANT** `methodology.modified.verifier_recompiled_for_class_b` — *A Class B Modified delta includes a verifier diff in the same commit (re-compiled output).* Mechanism: schema/git check.
- "Human reviews verifier diff" — **RATIONALE**.
- "CI gate: roundtrip on new pair" — **INVARIANT** `methodology.modified.roundtrip_after_class_b` — *Statement-↔-verifier roundtrip is run on every Class B Modified delta and must pass.* Mechanism: integration test.
- "Reliance scan + advisory notification" — **SUBSUMED** by reaction process invariants.
- "Escalate to Supersession if relying ADR objects" — **SUBSUMED** by reaction process (`methodology.reaction.objection_blocks_merge`).
- "Core invariant: extra review (1-cycle deprecation)" — `methodology.deprecation.period_per_tier` (Line 281).
- "Single commit" — **RATIONALE**.

### Lines 329-335: Class C runbook
- All claims subsumed by Withdrawn + Added invariants and reaction process.

### Lines 337-341: CI gates listed
- Roundtrip after Modified — `methodology.modified.roundtrip_after_class_b`.
- `methodology.registry.no_orphans` — already.
- Modified classification advisory — `methodology.modified.classification_advisory`.

### Lines 343-348: core stricter rules
- Class A unchanged — **RATIONALE**.
- Class B 1-cycle deprecation — `methodology.deprecation.period_per_tier`.
- Class C requires successor or redesign — `methodology.removal_ceremony.respects_core`.

### Line 350: `#### Reaction process: how relying ADRs respond to changes` — STRUCTURAL.

### Line 352
> "When a Modified (Class B sharpening), Superseded, or Withdrawn delta affects an invariant with relying ADRs, those ADRs must 'react' — explicitly acknowledge the change before the triggering ADR can merge."

Atomic claims:
1. "Reaction is required" — **INVARIANT** `methodology.reaction.required_for_class_b_supersession_withdrawal` — *Any Class B / Supersession / Withdrawal delta affecting an invariant with one or more relying ADRs requires reaction artifacts to be generated.* Mechanism: integration test on PR-open hook.
2. "Reaction is data-driven, not email" — **RATIONALE**.

### Line 354: `**Reaction artifact (one per relying ADR):**` — STRUCTURAL.

### Line 356
> "When the triggering ADR opens as a PR, a CI hook scans the reliance graph and generates one artifact per relying ADR..."

Atomic claims:
1. "PR open triggers reaction artifact generation" — **INVARIANT** `methodology.reaction.artifact_generated_on_pr_open` — *Opening a PR with a Class B / Supersession / Withdrawal delta triggers reaction artifact generation; CI hook does this on every push.* Mechanism: integration test.
2. "One artifact per relying ADR" — **INVARIANT** `methodology.reaction.one_artifact_per_relying_adr` — *Number of artifacts generated equals number of live ADRs with `relies_on` edge to the affected invariant(s).* Mechanism: integration test.

### Lines 358-371: artifact YAML schema
- "Artifacts conform to schema" — **INVARIANT** `methodology.reaction.artifact_yaml_schema` — *Every reaction artifact validates against the declared schema (triggering_adr, target_invariant, delta_kind, optional new_invariant, relying_adr, owner, state, created, deadline, ack, ack_rationale).* Mechanism: schema.
- Per-field schema requirements — **SUBSUMED**.

### Line 373
> "Reaction artifacts are committed alongside the triggering ADR's PR; their existence is what makes 'reaction' trackable."

Atomic claims:
1. "Artifacts committed in PR branch" — **INVARIANT** `methodology.reaction.artifacts_in_pr_branch` — *Reaction artifacts live in `docs/reactions/` on the PR branch (and persist to main on merge).* Mechanism: integration test.

### Line 375: `**Owner identification:**` — STRUCTURAL.

### Lines 377-379
- "Owner from frontmatter" — **INVARIANT** `methodology.reaction.owner_resolution` — *Owner is resolved as: explicit `Owner:` frontmatter > git author of original ADR commit > project fallback in `.sdd/components.yaml`.* Mechanism: codegen completeness on resolution function.
- Sub-claims (frontmatter, git fallback, project fallback) — **SUBSUMED**.

### Line 381: `**Reaction options (owner picks one per pending artifact):**` — STRUCTURAL.

### Lines 383-389: 5 ack options table
- "Ack values are {re-pin, update, migrate, accept-unpinning, object}" — **INVARIANT** `methodology.reaction.ack_in_enum` — *`human_decision.ack` field is in the declared 5-element enum.* Mechanism: schema.
- Per-row semantics: each row carries an effect contract:
  - re-pin: edge stays / migrates to successor — **INVARIANT** `methodology.reaction.repin_preserves_or_migrates_edge` — *re-pin ack preserves the reliance edge (or auto-migrates to successor for Supersession).* Mechanism: integration test.
  - update: triggering ADR blocked until follow-up commits — **INVARIANT** `methodology.reaction.update_blocks_until_followup` — *update ack requires a follow-up ADR before merge can proceed.* Mechanism: integration test on merge gate.
  - migrate: explicit successor reliance recorded — **INVARIANT** `methodology.reaction.migrate_records_successor` — *migrate ack records the successor invariant ID in the reaction artifact.* Mechanism: schema.
  - accept-unpinning: reliance removed; ADR un-pinned — **INVARIANT** `methodology.reaction.unpinning_marks_adr` — *accept-unpinning ack flags the relying ADR as un-pinned in its frontmatter or status.* Mechanism: schema.
  - object: blocks indefinitely until resolved — **INVARIANT** `methodology.reaction.objection_blocks_merge` — *object ack blocks merge until the artifact's state changes (escalation / re-author / withdrawal of objection).* Mechanism: integration test.

### Line 391: `**State machine:**` — STRUCTURAL.

### Lines 393-398: state transitions
- "State machine has pending → acked / expired" — **INVARIANT** `methodology.reaction.state_machine_valid` — *State transitions follow the declared graph (pending → acked / expired; acked / expired terminal).* Mechanism: codegen completeness.

### Line 400: `**Expiration disposition by tier (default policy, per-project tunable):**` — STRUCTURAL.

### Lines 402-406: per-tier disposition table
- "Disposition per tier (draft / active-non-core: accept-unpinning; active-core: block)" — **INVARIANT** `methodology.reaction.expiration_disposition_per_tier` — *On expiration, draft and non-core active invariants default to accept-unpinning; core active blocks until explicit ack.* Mechanism: integration test.
- Per-project tunable — **IMPLEMENTATION** (config detail).

### Line 408: `**Merge gating:**` — STRUCTURAL.

### Lines 410-414
1. "Triggering ADR cannot merge until all reactions acked or expired-acceptable" — **INVARIANT** `methodology.reaction.merge_blocked_until_acked` — *Merge gate fails when any reaction artifact is in pending state (with non-acceptable expiration) or in objected state.* Mechanism: integration test on CI gate.
2. "Object blocks indefinitely" — `methodology.reaction.objection_blocks_merge` (already).

### Line 416: `**CI gates that drive this:**` — STRUCTURAL.

### Lines 418-420: 3 CI gates
- Reaction generator — `methodology.reaction.artifact_generated_on_pr_open` (already).
- Reaction merge-gate — `methodology.reaction.merge_blocked_until_acked` (already).
- Object-clear gate — **SUBSUMED** by `methodology.reaction.objection_blocks_merge`.

### Line 422: `**Dashboard surface:**` — STRUCTURAL.

### Lines 424-425: dashboard read views — covered later in §9j.

### Line 427: `#### Reaction triage assistant (LLM-enhanced)` — STRUCTURAL.

### Line 429
> "Manually reviewing every reaction artifact is impractical at scale..."

Atomic claims: **RATIONALE** (motivation).

### Line 431: `**What the assistant does (per reaction artifact, fresh context per call):**` — STRUCTURAL.

### Lines 433-437: assistant inputs
- "Triage runs in fresh context per call" — `methodology.subagent.fresh_context` (Line 63 implicit).
- "Reads triggering ADR diff + target invariant + relying ADR + registry entry" — **INVARIANT** `methodology.triage.input_scope` — *Triage assistant receives the ADR diff, target invariant entry, relying ADR full text, and registry entry; no other context.* Mechanism: integration test on subagent invocation.

### Line 439: `Produces a structured suggestion that's written into the reaction artifact:` — STRUCTURAL.

### Lines 441-452: llm_suggestion schema
- "Suggestion schema" — **INVARIANT** `methodology.triage.suggestion_schema` — *`llm_suggestion` block has the declared fields (ack, confidence, rationale, draft_followup, flags) with validated types.* Mechanism: schema.
- "human_decision is null until owner acks" — **INVARIANT** `methodology.triage.human_decision_initially_null` — *Newly generated reaction artifact has `human_decision: null`.* Mechanism: schema/integration test.

### Line 454: `**Per-tier auto-ack policy (per-project, opt-in, defaults conservative):**` — STRUCTURAL.

### Lines 456-462: auto-ack policy table
- "Auto-ack policy is per-tier" — **INVARIANT** `methodology.triage.auto_ack_per_tier_policy` — *Auto-ack only fires per the declared per-tier policy table; never on `core` invariants regardless of confidence.* Mechanism: integration test.
- "Core: always require explicit ack" — **SUBSUMED** by claim 1.

### Line 464
> "Projects may tighten the policy (e.g., disable auto-ack entirely while building trust in the assistant) or loosen it as observed accuracy improves."

Atomic claims: **IMPLEMENTATION** (config tunability).

### Line 466: `**Boundaries the assistant must not cross:**` — STRUCTURAL.

### Lines 468-471: 4 boundaries
- "Never auto-object" — **INVARIANT** `methodology.triage.never_auto_objects` — *Triage never sets `human_decision.ack = object` autonomously; it can flag concerns but routes to human review.* Mechanism: integration test on triage output handling.
- "Never auto-merge follow-up ADRs" — **INVARIANT** `methodology.triage.never_auto_merges_followups` — *Generated follow-up ADR drafts are placed in the working tree but not committed by triage.* Mechanism: integration test.
- "Never override owner decisions" — **INVARIANT** `methodology.triage.respects_human_decision` — *If `human_decision` is non-null, triage does not modify it.* Mechanism: integration test.
- "Never decide on core" — **SUBSUMED** by `methodology.triage.auto_ack_per_tier_policy`.

### Line 473: `**CI / cost / failure modes:**` — STRUCTURAL.

### Lines 475-477
- "Triage is not a CI gate; merge gate checks human_decision only" — **INVARIANT** `methodology.triage.advisory_only` — *Reaction merge-gate only checks `human_decision` field; `llm_suggestion` is advisory.* Mechanism: integration test.
- "Token cost ~20-50k cached on triggering-ADR hash" — **IMPLEMENTATION**.
- "LLM unavailable → manual fallback" — **IMPLEMENTATION** (graceful degradation).
- "LLM nonsense → owner overrides" — **IMPLEMENTATION**.

### Line 479: `**Why this preserves the methodology's core principle:**` — STRUCTURAL.

### Line 481
> "LLMs at authoring time, not CI time. The triage assistant is between authoring and validation..."

Atomic claims: all **RATIONALE** (philosophical justification).

### Line 483: `#### Where the reaction process literally runs` — STRUCTURAL.

### Line 485
> "The reaction process has two venues — CI for enforcement and local Claude Code session for resolution — and these are independent. CI is always on for any project with a registry; resolution is always local-first."

Atomic claims:
1. "CI enforces; local resolves; independent" — **DECISION**.
2. "CI always on for any project with registry" — **INVARIANT** `methodology.reaction.ci_always_on_with_registry` — *Any project with a non-empty invariant registry has CI gates for reaction generation, triage, and merge enforcement.* Mechanism: project-config check.

### Line 487: `**CI enforcement (always on):**` — STRUCTURAL.

### Lines 489-498: 8-step CI flow
- All steps — **IMPLEMENTATION** (how CI works); the contract is the merge gate behavior already pinned.
- "On merge artifacts persist in main's history" — **INVARIANT** `methodology.reaction.artifacts_persist_in_main` — *On merge of triggering ADR, reaction artifacts remain in main's git history (optionally archived).* Mechanism: integration test.

### Line 500: `**Local resolution (always available; no GitHub UI required):**` — STRUCTURAL.

### Line 502
> "Every reaction action is a slash command in your Claude Code session. Commands modify the artifact YAML in your working tree, stage for commit; you push and CI revalidates."

Atomic claims:
1. "Every reaction action is a slash command" — **INVARIANT** `methodology.reaction.cli_action_parity` — *Every reaction-related action declared in this ADR has a corresponding slash command implementation.* Mechanism: codegen completeness.
2. "Commands modify artifact YAML in working tree" — **INVARIANT** `methodology.reaction.cli_writes_artifact_directly` — *Slash commands modify the artifact YAML files in the working tree (do not bypass via APIs).* Mechanism: integration test.

### Lines 504-512: command table
- /list-reactions — **INVARIANT** `methodology.cli.list_reactions.shape` — *Output is a structured table including reaction id, target invariant, ack state, deadline, LLM suggestion summary.* Mechanism: integration test (golden output).
- /show-reaction — **INVARIANT** `methodology.cli.show_reaction.complete` — *Output includes registry entry + LLM suggestion + relying-ADR full text excerpt.* Mechanism: integration test.
- /ack-reaction — **INVARIANT** `methodology.cli.ack_reaction.idempotent` — *Re-running with same args produces same artifact state.* Mechanism: integration test.
- /ack-batch — **INVARIANT** `methodology.cli.ack_batch.respects_filters` — *Bulk-ack only modifies artifacts matching declared filters.* Mechanism: integration test.
- /draft-followup — **INVARIANT** `methodology.cli.draft_followup.outputs_valid_adr` — *Drafted ADR file passes ADR template schema validation.* Mechanism: integration test + schema check.
- /object-reaction — **SUBSUMED** by `methodology.reaction.objection_blocks_merge` + state machine invariants.
- /migrate-reaction — `methodology.reaction.migrate_records_successor`.

### Line 514: prose claim that "whole resolution loop stays in your terminal" — **RATIONALE**.

### Line 516: `**Local-CI parity:**` — STRUCTURAL.

### Line 518
> "Same code runs in both venues. Slash commands drive local; CI hook drives enforcement. Idempotent: same triggering ADR + same reliance graph → same reaction artifacts → same triage suggestions."

Atomic claims:
1. "Same code in both venues" — **INVARIANT** `methodology.local_ci.same_code` — *Slash command implementations and CI hook implementations call the same underlying function.* Mechanism: arch rule (forbid divergent implementations).
2. "Idempotent" — **INVARIANT** `methodology.local_ci.idempotent` — *Same triggering ADR + reliance graph produces the same reaction artifacts and triage suggestions regardless of venue.* Mechanism: integration test (run locally and in CI; diff outputs).

### Line 520
> "What's tunable per-project: the auto-ack aggressiveness... CI enforcement and merge-gating are not tunable; they're always on for any project with a registry."

Atomic claims: 
1. Auto-ack tunable — **IMPLEMENTATION**.
2. "CI enforcement and merge-gating not tunable" — **SUBSUMED** by `methodology.reaction.ci_always_on_with_registry`.

### Line 522
> "Default for agent-plugins's own bootstrap (Day 1)..."

Atomic claims: **DEFERRED** (project-specific phasing).

### Line 524: `### Lineage and reliance graph` — STRUCTURAL.

### Line 526
> "The methodology builds a typed graph over its artifacts. This is a direct extension of the lineage dashboard already established in agent-plugins..."

Atomic claims:
1. "Typed graph over artifacts" — **DECISION**.
2. "Extension of existing lineage dashboard" — **RATIONALE**.

### Line 528: `#### Node types` — STRUCTURAL.

### Lines 530-534: 5 node types
- "Node types: ADR, Spec, Invariant, Verifier, GlossaryTerm" — **INVARIANT** `methodology.lineage.node_types_in_enum` — *Graph nodes are typed as one of {ADR, Spec, Invariant, Verifier, GlossaryTerm}.* Mechanism: schema.

### Line 536: `#### Edge types` — STRUCTURAL.

### Lines 538-549: 10 edge types
- "Edge types: 10 declared kinds" — **INVARIANT** `methodology.lineage.edge_types_in_enum` — *Edges are typed as one of {relies_on, introduces, modifies, promotes, deprecates, withdraws, supersedes, pinned_by, uses_term, defines_term}.* Mechanism: schema.
- Per-edge "source of truth" column — **INVARIANT** `methodology.lineage.edge_sources_consistent` — *Each edge type's data source matches its declared source-of-truth (ADR section / registry field / glossary field).* Mechanism: codegen completeness.

### Line 551: `#### Reliance detection: explicit Relies On section, not inline` — STRUCTURAL.

### Lines 553-558
- "Reliances detected from explicit Relies On block" — **SUBSUMED** by `methodology.lineage.edge_sources_consistent`.
- "Inline mentions don't count" — **INVARIANT** `methodology.reliance.inline_mentions_advisory` — *Inline mentions of invariant IDs in ADR prose do not contribute to the reliance count; only explicit Relies On blocks do.* Mechanism: integration test.
- All sub-claims explaining why — **RATIONALE**.

### Line 560: `#### Reliance graph computation` — STRUCTURAL.

### Lines 562-575: pseudocode for relied_on_count and core
- relied_on_count formula — **SUBSUMED** by anti-gaming rules below.
- core formula — `methodology.invariant.core_computed_correctly` (Line 45).

### Lines 577-583: 3 anti-gaming rules
- "Live ADRs only" — **INVARIANT** `methodology.reliance.live_adrs_only` — *Reliance count excludes withdrawn ADRs and superseded-as-doc ADRs.* Mechanism: codegen completeness.
- "No double-counting via meta-edges" — **INVARIANT** `methodology.reliance.no_meta_double_count` — *An ADR with any meta-edge (introduces/modifies/promotes/deprecates/withdraws/supersedes) to an invariant cannot also have a Relies On edge to that invariant; if both are declared, the meta-edge wins.* Mechanism: schema/AST scan.
- "Set cardinality" — **INVARIANT** `methodology.reliance.set_cardinality` — *Per-ADR Relies On entries deduplicate to a set; multiple entries for the same invariant ID count as one.* Mechanism: codegen completeness.
- "Threshold per-project configurable" — **IMPLEMENTATION**.

### Line 585: `#### MCP tools (extension of existing docs-mcp)` — STRUCTURAL.

### Lines 587-594: 6 MCP tools
- list_invariants — **INVARIANT** `methodology.mcp.list_invariants_complete` — *Returns every registered invariant with tier/status/core/mechanism/verifier path.* Mechanism: integration test on docs-mcp.
- search_invariants — **INVARIANT** `methodology.mcp.search_invariants_supports_dimensions` — *Supports full-text + structured filters on statement, glossary terms, mechanism, tier, status.* Mechanism: integration test.
- get_invariant — **INVARIANT** `methodology.mcp.get_invariant_returns_computed_fields` — *Returns full registry entry with computed `relied_on_count`, `core`, `relied_on_by` fields populated.* Mechanism: integration test.
- get_invariant_lineage — **INVARIANT** `methodology.mcp.get_invariant_lineage_complete` — *Returns all 6 ADR-edge types and the supersession chain.* Mechanism: integration test.
- get_adr_invariants — **INVARIANT** `methodology.mcp.get_adr_invariants_extends_lineage` — *For an ADR, returns all introduces/modifies/promotes/deprecates/withdraws/relies-on edges to invariants.* Mechanism: integration test.
- get_verifier_invariants — **INVARIANT** `methodology.mcp.get_verifier_invariants_reverse` — *For a verifier file path, returns the set of invariants pinned by it.* Mechanism: integration test.

### Line 596: `#### Dashboard views (extension of existing docs-dashboard)` — STRUCTURAL.

### Line 598
> "The dashboard is the visualization, discovery, and async-monitoring layer; CLI is the workflow layer. Both have full write parity..."

Atomic claims:
1. "Dashboard is read-primary + write-parity with CLI" — **DECISION**.
2. "Both write the same artifact YAML" — **INVARIANT** `methodology.dashboard.same_artifact_format` — *Dashboard write actions produce artifact YAML files identical in shape to those produced by CLI.* Mechanism: integration test (compare CLI and dashboard outputs for same input).
3. "CI validates the same way regardless of venue" — **SUBSUMED** by `methodology.local_ci.idempotent`.

### Line 600: `**Read views:**` — STRUCTURAL.

### Lines 602-609: 8 read views
- "All 8 declared views are present" — **INVARIANT** `methodology.dashboard.declared_views_present` — *Dashboard route table includes Invariants tab, Invariant detail, Reliance graph view, Core candidates panel, Drift heatmap, Tier distribution, Promotion candidates, Reactions queue.* Mechanism: codegen completeness on dashboard route table.
- Per-view content contract — most are **IMPLEMENTATION** (visual rendering details); the existence is the contract.

### Line 611: `**Write actions (parity with CLI slash commands):**` — STRUCTURAL.

### Lines 613-624: 8-row action parity table
- "Every CLI action has dashboard equivalent" — **INVARIANT** `methodology.dashboard.cli_parity` — *Each CLI slash command has a corresponding dashboard write action; bijection enforced by codegen.* Mechanism: codegen completeness.
- Per-row mapping — **SUBSUMED**.

### Line 626: `**How dashboard write actions actually commit:**` — STRUCTURAL.

### Line 628
> "The dashboard runs in two deployment modes; both produce identical artifact-file outputs."

Atomic claims: **DECISION** + **SUBSUMED** by `methodology.dashboard.same_artifact_format`.

### Line 630: `**Local mode (single-user, dev workflow — current docs-dashboard architecture):**` — STRUCTURAL.

### Lines 632-635
- "Dashboard process has access to local working tree" — **IMPLEMENTATION**.
- "Action button → modify YAML → git add+commit with developer identity" — **INVARIANT** `methodology.dashboard.local_mode_uses_local_git` — *Local-mode dashboard write actions execute via local git operations (add/commit/optional push) using the developer's git identity.* Mechanism: integration test.
- "No authentication needed" — **IMPLEMENTATION** (consequence).
- "This is Day-1 mode" — **DEFERRED**.

### Line 637: `**Hosted mode (multi-user, team workflow — deferred to follow-up ADR):**` — STRUCTURAL.

### Lines 639-643: hosted mode — all **DEFERRED**.

### Line 645: `**Author attribution:**` — STRUCTURAL.

### Lines 647-656: human_decision schema
- "human_decision schema includes ack, rationale, acked_by, acked_at, venue" — **INVARIANT** `methodology.reaction.author_attribution_recorded` — *Every acked reaction artifact has populated `human_decision.ack`, `acked_by`, `acked_at`, `venue` fields.* Mechanism: schema.
- "venue ∈ {cli, dashboard-local, dashboard-hosted}" — **INVARIANT** `methodology.reaction.venue_in_enum` — *`venue` field is in the declared 3-element enum.* Mechanism: schema.

### Line 658
> "CI doesn't care about venue; it only validates that human_decision.ack is set."

Atomic claims: **SUBSUMED** by `methodology.reaction.merge_blocked_until_acked`.

### Line 660: `**Failure modes:**` — STRUCTURAL.

### Lines 662-664: failure modes
- All **IMPLEMENTATION** (graceful degradation; not contracts).

### Line 666: `#### Why this extension is natural` — STRUCTURAL.

### Lines 668-674
- All **RATIONALE** (justification for reusing existing dashboard).

### Line 676: `### Lifecycle status (orthogonal to tier)` — STRUCTURAL.

### Lines 678-685: status table + refined no_orphans
- "Status enum + per-status verifier-runs behavior" — **SUBSUMED** by `methodology.invariant.status_in_enum`.
- "no_orphans contract: every active or deprecated has live verifier" — `methodology.registry.no_orphans` (refined statement).

### Line 687: `### Conflict resolution: who is right when artifacts disagree?` — STRUCTURAL.

### Lines 689-714
- Authority hierarchy claims — all **RATIONALE** (procedural; not enforced by CI).
- Conflict shape table — **RATIONALE** (resolution heuristics; advisory).
- Drift detection mechanisms (4):
  - Roundtrip — **INVARIANT** `methodology.audit.roundtrip_runs_per_audit_cycle` — *Each audit cycle includes a statement-↔-verifier roundtrip per registered invariant.* Mechanism: integration test on /audit-invariants.
  - Differential regen — `methodology.audit.differential_regeneration_per_cadence` (Line 25).
  - Mutation testing — **DEFERRED** (audit-only Day-1 per Scope).
  - Coverage-of-statement audit — **SUBSUMED** by audit advisory invariants.
- "Why duplication is worth it" — **RATIONALE**.
- "Operational summary" — **RATIONALE**.

---

## Lines 716-722: Error Handling

### Line 716: heading — STRUCTURAL.

### Lines 718-722: 5 error categories
- Verifier compilation failure — **RATIONALE** (default behavior).
- Differential regen produces incorrect → spec gap — **RATIONALE**.
- Registry drift → CI fails — **SUBSUMED** by `methodology.registry.no_orphans`.
- Coexistence dispatch error — **INVARIANT** `methodology.dispatch.halts_on_unknown_mode` — *`/plan-feature` halts and asks for clarification when a component has missing or unknown mode.* Mechanism: integration test.
- Glossary coverage failure → blocks authoring — **SUBSUMED** by `methodology.plan_feature.blocks_unresolved_terms`.

---

## Lines 724-731: Security

### Line 724: heading — STRUCTURAL.

### Line 726
> "The methodology itself does not introduce new security boundaries, but enables consumer projects to..."

Atomic claims:
1. "No new security boundaries from methodology" — **RATIONALE**.
2. "Enables consumer projects to encode tenant isolation as deterministic checks" — **RATIONALE** (consumer-side capability).
3. Other consumer-side capabilities — **RATIONALE**.

### Line 731
> "The invariant-compiler subagent runs in fresh context per invocation (per methodology.subagent.fresh_context); no cross-invocation prompt injection surface."

Atomic claims: **SUBSUMED** by `methodology.subagent.fresh_context`.

---

## Lines 733-750: Impact

All **STRUCTURAL** / **DECISION** (file enumeration). No new invariants.

---

## Lines 752-767: Scope

### Lines 754-760: in v1
- All items are either **DECISION** or already-extracted invariants.

### Lines 762-767: deferred
- All **DEFERRED**.

---

## Lines 769-783: Open Questions

All **OPEN**. No invariants extractable until resolved.

---

## Lines 785-794: Integration Test Cases

Test cases are *verifier code* for invariants already extracted. Not themselves invariants.

---

## Lines 796-826: Implementation Plan

All **STRUCTURAL** / **DEFERRED** (phasing, estimates).

---

## Aggregate

After deduplication across all sections, the proposed atomic invariants are:

### Schema / structural / lifecycle (~22)

1. `methodology.invariant.has_id`
2. `methodology.invariant.has_mechanism`
3. `methodology.invariant.mechanism_in_taxonomy`
4. `methodology.invariant.statement_atomic`
5. `methodology.invariant.statement_single_line`
6. `methodology.invariant.tier_in_enum`
7. `methodology.invariant.tier_default_draft`
8. `methodology.invariant.higher_tier_introduction_requires_justification`
9. `methodology.invariant.status_in_enum`
10. `methodology.invariant.introduced_by_live_adr`
11. `methodology.invariant.promoted_by_set_iff_active`
12. `methodology.invariant.superseded_by_set_iff_superseded`
13. `methodology.invariant.core_computed_correctly`
14. `methodology.invariant.relied_on_by_matches_graph`
15. `methodology.invariant.glossary_terms_field_populated`
16. `methodology.invariant.withdrawal_deletes_verifier`
17. `methodology.registry.no_orphans`
18. `methodology.adr.delta_reconciles`
19. `methodology.adr.delta_block_required_for_invariant_changes`
20. `methodology.adr.delta_block_kinds_in_enum`
21. `methodology.adr.added_block_complete`
22. `methodology.deprecated_block_includes_reason_and_target`
23. `methodology.superseded_block_maps_old_to_new`

### Glossary (~4)

24. `methodology.glossary.complete`
25. `methodology.glossary.term_unique`
26. `methodology.glossary.resolves_to_valid_target`
27. `methodology.glossary.scope_in_enum`

### Mode dispatch (~6)

28. `methodology.dispatch.respects_mode`
29. `methodology.mode_flag.declared_per_component`
30. `methodology.mode_flag.value_in_enum`
31. `methodology.mode_flag.v2_references_registry`
32. `methodology.mode_flag.v1_references_spec`
33. `methodology.dispatch.halts_on_unknown_mode`

### Skills (~10)

34. `methodology.skills.context_isolation`
35. `methodology.adr_authoring.uses_plan_feature`
36. `methodology.plan_feature.v2_template_for_v2_components`
37. `methodology.plan_feature.blocks_unmechanism_invariants`
38. `methodology.plan_feature.blocks_unresolved_terms`
39. `methodology.feature_change.uses_verifier_suite_for_v2`
40. `methodology.cli.list_reactions.shape`
41. `methodology.cli.show_reaction.complete`
42. `methodology.cli.ack_reaction.idempotent`
43. `methodology.cli.ack_batch.respects_filters`
44. `methodology.cli.draft_followup.outputs_valid_adr`
45. `methodology.glossary_check.is_deterministic_script`
46. `methodology.registry_check.is_deterministic_script`

### Subagents (~6)

47. `methodology.subagent.fresh_context`
48. `methodology.invariant_compiler.is_subagent`
49. `methodology.invariant_compiler.input_is_adr_delta`
50. `methodology.invariant_compiler.outputs_match_mechanism`
51. `methodology.invariant_compiler.output_in_pr_branch`
52. `methodology.invariant_compiler.outputs_compilable_code`

### Audit (~5)

53. `methodology.audit.advisory_only`
54. `methodology.audit.differential_regeneration_per_cadence`
55. `methodology.audit.outputs_structured_findings`
56. `methodology.audit.runs_per_cadence`
57. `methodology.audit.input_scope`
58. `methodology.audit.roundtrip_runs_per_audit_cycle`

### Modification policy (~6)

59. `methodology.modification.class_c_via_supersession`
60. `methodology.modified.has_rationale_field`
61. `methodology.modified.verifier_recompiled_for_class_b`
62. `methodology.modified.roundtrip_after_class_b`
63. `methodology.modified.classification_advisory`
64. `methodology.removal_ceremony.respects_core`
65. `methodology.deprecation.period_per_tier`
66. `methodology.promotion.is_pure_tier_change_adr`
67. `methodology.promotion.evidence_advisory`

### Reaction process (~14)

68. `methodology.reaction.required_for_class_b_supersession_withdrawal`
69. `methodology.reaction.artifact_generated_on_pr_open`
70. `methodology.reaction.one_artifact_per_relying_adr`
71. `methodology.reaction.artifact_yaml_schema`
72. `methodology.reaction.artifacts_in_pr_branch`
73. `methodology.reaction.artifacts_persist_in_main`
74. `methodology.reaction.owner_resolution`
75. `methodology.reaction.ack_in_enum`
76. `methodology.reaction.repin_preserves_or_migrates_edge`
77. `methodology.reaction.update_blocks_until_followup`
78. `methodology.reaction.migrate_records_successor`
79. `methodology.reaction.unpinning_marks_adr`
80. `methodology.reaction.objection_blocks_merge`
81. `methodology.reaction.state_machine_valid`
82. `methodology.reaction.expiration_disposition_per_tier`
83. `methodology.reaction.merge_blocked_until_acked`
84. `methodology.reaction.author_attribution_recorded`
85. `methodology.reaction.venue_in_enum`
86. `methodology.reaction.cli_action_parity`
87. `methodology.reaction.cli_writes_artifact_directly`
88. `methodology.reaction.ci_always_on_with_registry`

### Triage assistant (~7)

89. `methodology.triage.input_scope`
90. `methodology.triage.suggestion_schema`
91. `methodology.triage.human_decision_initially_null`
92. `methodology.triage.auto_ack_per_tier_policy`
93. `methodology.triage.never_auto_objects`
94. `methodology.triage.never_auto_merges_followups`
95. `methodology.triage.respects_human_decision`
96. `methodology.triage.advisory_only`

### Lineage / reliance / MCP (~10)

97. `methodology.lineage.node_types_in_enum`
98. `methodology.lineage.edge_types_in_enum`
99. `methodology.lineage.edge_sources_consistent`
100. `methodology.reliance.inline_mentions_advisory`
101. `methodology.reliance.live_adrs_only`
102. `methodology.reliance.no_meta_double_count`
103. `methodology.reliance.set_cardinality`
104. `methodology.mcp.list_invariants_complete`
105. `methodology.mcp.search_invariants_supports_dimensions`
106. `methodology.mcp.get_invariant_returns_computed_fields`
107. `methodology.mcp.get_invariant_lineage_complete`
108. `methodology.mcp.get_adr_invariants_extends_lineage`
109. `methodology.mcp.get_verifier_invariants_reverse`

### Dashboard (~4)

110. `methodology.dashboard.declared_views_present`
111. `methodology.dashboard.cli_parity`
112. `methodology.dashboard.same_artifact_format`
113. `methodology.dashboard.local_mode_uses_local_git`

### Self-application + cross-cutting (~3)

114. `methodology.self_application.same_machinery`
115. `methodology.local_ci.same_code`
116. `methodology.local_ci.idempotent`

### CI behavior (~3)

117. `methodology.ci.runs_verifier_suite_on_every_commit`
118. `methodology.ci.failures_attributed_to_invariant_id`
119. `methodology.llm.no_recurring_validation`

### Mechanism documentation (~1)

120. `methodology.mechanism.tool_documented`

### Marginal (~1)

121. `methodology.language.matches_consumer`

---

## Final tally

**Total atomic invariants identified: ~115-120** after de-duplication and consolidation across all 826 lines of the ADR.

This is significantly higher than both the original "9 Day-1" and the v0 analysis's "~75-85" count. The increase comes from:
1. **Per-line atomic granularity** — each line often carries 3-7 atomic claims, where v0 grouped multiple lines into one invariant proposal.
2. **Per-tool / per-skill behavior contracts** — every CLI command, every dashboard view, every MCP tool gets a separate invariant for its specific contract.
3. **Per-field schema invariants** — every field in every YAML schema (registry, glossary, reaction artifact, components.yaml, ADR delta block) gets a schema-validation invariant.
4. **Per-edge-type lineage invariants** — each of the 10 edge types and 5 node types has its own consistency invariant.

### Phased registration (revised from v0)

| Phase | Tools required | Cumulative invariants |
|---|---|---|
| Phase 1 | registry parser + glossary parser + ADR delta parser + components.yaml parser + 4 deterministic CI scripts | ~35 (all schema/lifecycle/mode-dispatch) |
| Phase 2 | invariant-compiler subagent + extended /plan-feature + extended /feature-change + extended /setup | ~50 |
| Phase 3 | /audit-invariants + /check-glossary + /check-registry-coverage + modification CI gates | ~65 |
| Phase 4 | reaction artifact generator + merge gate + 7 reaction slash commands + triage assistant subagent | ~95 |
| Phase 5 | docs-mcp invariant index + 6 new MCP tools + 8 dashboard read views + 8 dashboard write actions | ~118 |
| Phase 6 | Hosted-mode dashboard + cleanup | ~120 |

The Day-1 set of 9 explicit invariants in §6d of the ADR represents about 7-8% of the full methodology invariant set. The realistic Phase-1-shipable set is ~35 (29% of the full set) — schema/lifecycle/dispatch invariants that need only the registry to exist, no tools yet.

### What this means for the ADR

The "Methodology's own registry — Day 1 contents" section (lines 113-129) should be revised to:
1. List ~35 Phase-1 invariants (not 9), which are the schema/structural/lifecycle/dispatch ones provable on Day 1.
2. Add a phased-registration table showing which invariants come online with which tools.
3. Total methodology-own registry size at full implementation: **~115-120 invariants**.

The "9 Day-1" list was a useful initial framing for *bootstrap* but seriously under-counts the contracts the ADR actually declares. Each additional contract is real work — both to author the verifier and to keep aligned over time. The ~115-120 count gives a realistic picture of the methodology's surface area.

### Notes on rigor

This analysis treats "every atomic claim that could plausibly be enforced as a contract" as a candidate invariant. In practice, some candidates may be:
- **Consolidated** — multiple atomic claims in different places that restate the same thing get one ID.
- **Dropped as RATIONALE** — claims that reflect intent/philosophy without a deterministic enforcement.
- **Deferred indefinitely** — claims that are true-by-construction or that no one will ever realistically check.

Even with aggressive consolidation and dropping, the realistic implemented count stays above ~80. The 9-invariant Day-1 framing was the lowest-effort starting point, not the actual full registry.
