# Analysis: Invariant Extraction from ADR-0075

**Source**: `src/sdd/docs/adr-0075-invariant-driven-development.md` (826 lines, draft)
**Purpose**: line-by-line audit of the ADR identifying which claims should be registered as invariants, which are decisions / rationale / glossary entries / implementation details, and which are open or deferred.
**Method**: walk every section; classify each substantive claim; for invariants, propose ID + statement + mechanism. The classifications below are *proposals* — the registration list at the end is what would actually go in `src/sdd/spec/invariants.<lang>` after this ADR lands.

## Classification key

| Tag | Meaning |
|---|---|
| **INVARIANT** | Register in the methodology's own registry. Includes proposed ID, statement, mechanism. |
| **DECISION** | Captured in the Decisions table. Itself not a registered invariant (decisions *produce* invariants but aren't ones). |
| **GLOSSARY** | Defines a term used by invariants. Goes in `glossary.md`, not the registry. |
| **RATIONALE** | Context, motivation, or "why" content. Not a contract. |
| **IMPLEMENTATION** | How a tool works internally. Not a user-facing contract; refactors should be free. |
| **OPEN** | Pending decision in the ADR's "Open questions" section. Revisit when resolved. |
| **DEFERRED** | Explicit future work; out of scope for this ADR. |
| **STRUCTURAL** | ADR meta-content (header, status, etc.); not in scope for invariant analysis. |

Two filters disqualify a claim from being an invariant even if it sounds like a contract:

1. **Is it a contract users / consumers depend on?** No → implementation detail.
2. **Could a refactor break it silently if no invariant existed?** No → not worth pinning.

---

## Section 1: Header / Status (lines 1-5)

| Line | Content | Classification |
|---|---|---|
| 1 | Title | STRUCTURAL |
| 3-5 | Status / status history | STRUCTURAL |

---

## Section 2: Overview (lines 7-13)

| Claim | Classification | Notes |
|---|---|---|
| "Evolve the spec-driven-dev plugin from v1 (markdown) to v2 (invariant-driven)" | DECISION | Recorded in Decisions table row "Plugin shape." |
| "Named invariants, not markdown spec prose, become the canonical contract surface" | DECISION | Recorded in "Spec form" decision. |
| "Verification is performed by deterministic CPU-bound mechanisms" | DECISION | Recorded in "LLM role" decision. |
| "LLMs appear only at authoring time and audit time, never in the recurring CI validation path" | **INVARIANT** | `methodology.llm.no_recurring_validation` — *No CI gate's pass/fail decision invokes an LLM.* Mechanism: arch-rule (forbid LLM-call imports inside CI gate scripts) + AST scan. |
| "V1 markdown-spec methodology coexists with v2" | DECISION | Recorded in "Coexistence dispatch." |
| "Consumer projects opt in per-component" | DECISION | Recorded in "Coexistence dispatch." |
| "Both modes ship in the same plugin and share existing skills which dispatch internally" | **INVARIANT** | `methodology.dispatch.respects_mode` (already in Day-1 list) — *Skills route to v1 or v2 paths based on the per-component mode flag.* Mechanism: integration test. |
| "agent-plugins is the bootstrap project" | RATIONALE | Project-specific framing; not a methodology contract. |
| "Methodology's own ~7-10 invariants register first" | DEFERRED | Phase-2 implementation step; documented in Implementation Plan. |

**Section 2 invariants: 2** (`methodology.llm.no_recurring_validation`, `methodology.dispatch.respects_mode`).

---

## Section 3: Motivation (lines 15-25)

Pure problem statement. Every line is RATIONALE. No invariants. The motivation explains *why* v2 exists; the contracts that fix the problems are declared elsewhere in the ADR.

**Section 3 invariants: 0.**

---

## Section 4: Decisions table (lines 27-53)

The Decisions table itself is not a source of invariants — each row records a *choice*, and the consequences of that choice get pinned by invariants elsewhere. But each row often *implies* one or more invariants.

| Row | Decision content | Classification | Implied invariants |
|---|---|---|---|
| Spec form | tests + lint + schemas, indexed by registry | DECISION | Implies `methodology.registry.no_orphans` (already listed). |
| Decomposition unit | named invariants with stable IDs | DECISION | Implies `methodology.invariant.has_id` (new — *Every registry entry has a unique stable ID matching `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$`*. Mechanism: schema). |
| Invariant lifecycle | ADRs declare deltas on running registry | DECISION | Implies `methodology.adr.delta_reconciles` (already listed). |
| Verification taxonomy | 10 mechanism kinds; each invariant names exactly one primary | DECISION | Implies `methodology.invariant.has_mechanism` (already listed) and `methodology.invariant.mechanism_in_taxonomy` (new — *Every mechanism field's value is in the closed enum*. Mechanism: schema). |
| LLM role | authoring + audit only | DECISION | Implies `methodology.llm.no_recurring_validation` (already extracted from Overview). |
| Language binding | spec encoded in consumer language | DECISION | Implies `methodology.language.matches_consumer` (new — *A v2 component's verifiers are written in the same language as its production code*. Mechanism: schema/per-component config). Marginal — debatable whether this needs to be enforced or is just a convention. |
| Constraint scope | constrain contracts, leave internals liquid | RATIONALE | Aspirational guidance; not directly enforceable. The methodology's *no AND* and atomicity rules indirectly support this; the rest is human judgment. |
| Vocabulary precision | hybrid types-as-glossary + glossary file | DECISION | Implies `methodology.glossary.complete` (already listed). |
| Registry framework approach | thin custom + per-mechanism tools | RATIONALE | Implementation choice; nothing to enforce. |
| Per-mechanism tool choices | rapid, depguard, semgrep, buf, etc. | RATIONALE | Tool selections are recommendations, not contracts. Per-project tunable. |
| Plugin shape | evolution of spec-driven-dev | DECISION | No new invariant beyond `methodology.dispatch.respects_mode`. |
| Bootstrap project | agent-plugins itself; methodology own first | DEFERRED | Implementation phasing. |
| Coexistence dispatch | per-component mode flag | DECISION | Implies `methodology.mode_flag.declared_per_component` (new — *Every component appearing in the project has a declared `mode` field in `.sdd/components.yaml`*. Mechanism: schema). |
| Stability tier | two-tier: draft / active | DECISION | Implies `methodology.invariant.tier_in_enum` (new — schema check on tier field) and `methodology.invariant.tier_default_draft` (new — *New invariants default to `draft` unless ADR justifies higher introduction*. Mechanism: schema + ADR delta lint). |
| Core attribute | computed from reliance count ≥ 3 | DECISION | Implies `methodology.invariant.core_computed_correctly` (new — *`core` field equals `relied_on_count ≥ threshold OR manually_set`*. Mechanism: codegen completeness — derived field consistency check). |
| Lifecycle status | active/deprecated/superseded/withdrawn | DECISION | Implies `methodology.invariant.status_in_enum` (new — schema) and `methodology.invariant.withdrawal_deletes_verifier` (already listed lifecycle). |
| Conflict resolution authority | statement > verifier > code | RATIONALE | Procedural — used by audit, not enforced by CI. |
| Invariant registry format | OPEN | OPEN | Cannot extract invariants until format is decided. |
| Glossary form | OPEN | OPEN | Cannot extract until decided. |
| Verifier file layout | OPEN | OPEN | Cannot extract until decided. |
| ADR delta block structure | OPEN | OPEN | Cannot extract until decided. |
| Differential regeneration cadence | OPEN | OPEN | Cannot extract until decided. |
| Skill suite scope | OPEN | OPEN | Cannot extract until decided. |

**Section 4 new invariants: 7** (`methodology.invariant.has_id`, `methodology.invariant.mechanism_in_taxonomy`, `methodology.language.matches_consumer` [marginal], `methodology.mode_flag.declared_per_component`, `methodology.invariant.tier_in_enum`, `methodology.invariant.tier_default_draft`, `methodology.invariant.core_computed_correctly`, `methodology.invariant.status_in_enum`).

Strictly, that's 8; one is marginal. Net for the section: **7-8 invariants**.

---

## Section 5: User Flow (lines 55-68)

The User Flow describes the sequence of steps for a v2 development cycle. Each step is a *behavioral contract* about how the methodology operates.

| Step | Claim | Classification | Proposed invariant if applicable |
|---|---|---|---|
| 1 | "Change request enters" | RATIONALE | Trivial; not a contract. |
| 2 | "Master session authors ADR via /plan-feature; uses v2 template for v2 mode" | **INVARIANT** | `methodology.plan_feature.v2_template_for_v2_components` — *When dispatched for a v2 component, /plan-feature uses the v2 ADR template including Invariant Delta block.* Mechanism: integration test. |
| 3 | "Each new invariant is named, statemented, tagged with mechanism" + "skill blocks finalization until every invariant has a mechanism" | **INVARIANT** | `methodology.plan_feature.blocks_unmechanism_invariants` — *`/plan-feature` cannot finalize an ADR if any proposed invariant lacks a mechanism field.* Mechanism: integration test on /plan-feature. |
| 4 | "Glossary check verifies every term resolves" | **INVARIANT** | This is the runtime behavior of `/check-glossary`; corresponds to `methodology.glossary.complete` (already listed). |
| 5 | "LLM compiles invariants → verifier code via invariant-compiler subagent" | **INVARIANT** | Multiple sub-invariants on the compiler: `methodology.invariant_compiler.outputs_compilable_code`, `methodology.invariant_compiler.outputs_match_mechanism`, `methodology.invariant_compiler.uses_only_resolved_terms`. (3 invariants) Mechanism: integration test on the subagent. |
| 6 | "Human reviews compiled verifiers" | RATIONALE | Process discipline; not a deterministic contract. |
| 7 | "/feature-change invokes dev-harness; for v2 components, replaces implementation-evaluator with verifier suite" | **INVARIANT** | `methodology.feature_change.uses_verifier_suite_for_v2` — *For v2 components, `/feature-change`'s success criterion is "verifier suite passes" not "implementation-evaluator returns CLEAN".* Mechanism: integration test. |
| 8 | "CI runs verifier suite on every commit; pure CPU; no model dependency" | **INVARIANT** | `methodology.ci.no_llm_in_validation` — covers same ground as `methodology.llm.no_recurring_validation` from Overview. Same invariant, dual-source. Don't double-register. |
| 9 | "Periodic differential regeneration audit (/audit-invariants)" | **INVARIANT** | `methodology.audit.differential_regeneration_per_cadence` — *`/audit-invariants` runs the rm-and-regenerate-N ritual on the configured cadence.* Mechanism: integration test. Plus `methodology.audit.outputs_structured_findings` — *Audit output is a structured Markdown file at a known location.* Mechanism: schema/path check. (2 invariants) |
| 10 | "Periodic LLM audit run; advisory; never blocks" | **INVARIANT** | `methodology.audit.advisory_only` (already listed). |

**Section 5 new invariants: 7-8** (depending on whether step-8 dedups with Overview):

1. `methodology.plan_feature.v2_template_for_v2_components`
2. `methodology.plan_feature.blocks_unmechanism_invariants`
3. `methodology.invariant_compiler.outputs_compilable_code`
4. `methodology.invariant_compiler.outputs_match_mechanism`
5. `methodology.invariant_compiler.uses_only_resolved_terms`
6. `methodology.feature_change.uses_verifier_suite_for_v2`
7. `methodology.audit.differential_regeneration_per_cadence`
8. `methodology.audit.outputs_structured_findings`

---

## Section 6: Component Changes (lines 70-129)

This section enumerates new and changed files. Each new tool / skill / subagent is itself a contract: "this thing exists, takes these inputs, produces these outputs." That's at least 1 invariant per item (existence), often more (behavior).

### 6a. `src/sdd/.agent/skills/` (lines 72-85)

Each new skill file's existence is a one-line invariant. Behavior contracts on the skill are extracted under the User Flow section above (so they're already counted).

| Item | Invariant |
|---|---|
| plan-feature/SKILL.md (extended) | Already counted in §5 (`methodology.plan_feature.v2_template_for_v2_components`, `methodology.plan_feature.blocks_unmechanism_invariants`). |
| feature-change/SKILL.md (extended) | Already counted (`methodology.feature_change.uses_verifier_suite_for_v2`). |
| setup/SKILL.md (extended) | **INVARIANT** `methodology.setup.asks_mode` — *`/setup` prompts the user for v1 or v2 mode and writes it to components.yaml.* Mechanism: integration. |
| compile-invariants/SKILL.md (new) | **INVARIANT** `methodology.compile_invariants.exists` (existence check) — composite-of: existence + the invariant_compiler subagent contracts (already counted in §5). Marginal: arguably the existence check is implementation; the *behavior* contracts are what matter. Skip the standalone "exists" invariant. |
| audit-invariants/SKILL.md (new) | Already counted (`methodology.audit.differential_regeneration_per_cadence`). |
| check-glossary/SKILL.md (new) | Already covered by `methodology.glossary.complete`. |
| check-registry-coverage/SKILL.md (new) | Already covered by `methodology.registry.no_orphans` and `methodology.adr.delta_reconciles`. |

**Section 6a new invariants: 1** (`methodology.setup.asks_mode`).

### 6b. `src/sdd/.agent/agents/` (lines 87-97)

| Item | Invariant |
|---|---|
| invariant-compiler.md (new) | **INVARIANT** `methodology.invariant_compiler.fresh_context` (sub-case of the general `methodology.subagent.fresh_context`). Behaviors already counted in §5. |
| journey-author.md (deferred) | DEFERRED |
| mutation-tester.md (deferred) | DEFERRED |
| dev-harness.md (extended) | Already covered (`methodology.feature_change.uses_verifier_suite_for_v2`). |

**Section 6b new invariants: 0** (all behaviors are subsumed by general subagent and already-counted compile-invariants invariants). The general `methodology.subagent.fresh_context` from the Day-1 list covers this.

### 6c. `src/sdd/docs/` (lines 99-111)

Spec files exist; no behavior contracts. **0 invariants.**

### 6d. Methodology's own registry (lines 113-129)

Lists 9 invariants. These are the Day-1 set explicitly named. Some duplicate what's been extracted above; the union is the actual Day-1 set.

The 9 explicitly named:
1. `methodology.registry.no_orphans`
2. `methodology.glossary.complete`
3. `methodology.adr.delta_reconciles`
4. `methodology.invariant.has_mechanism`
5. `methodology.invariant.statement_atomic`
6. `methodology.skills.context_isolation`
7. `methodology.subagent.fresh_context`
8. `methodology.dispatch.respects_mode`
9. `methodology.audit.advisory_only`

These are all also extractable from the Decisions / User Flow / Self-Application sections; no new ones from this listing.

**Section 6d new invariants: 0** (all 9 already extracted from earlier sections).

---

## Section 7: Data Model (lines 131-210)

### 7a. Invariant registry entry shape (lines 133-150)

| Field | Implies |
|---|---|
| id | `methodology.invariant.has_id` (already counted §4). |
| statement | `methodology.invariant.statement_atomic` (Day-1). |
| mechanism | `methodology.invariant.has_mechanism` (Day-1) + `methodology.invariant.mechanism_in_taxonomy` (§4). |
| verifier | `methodology.registry.no_orphans` (Day-1). |
| glossary_terms | **INVARIANT** `methodology.invariant.glossary_terms_resolved` — *Every term in `glossary_terms` resolves to a typed binding or glossary entry.* Same effect as `methodology.glossary.complete` but indexed differently. Probably consolidate. |
| tier | `methodology.invariant.tier_in_enum` (§4). |
| status | `methodology.invariant.status_in_enum` (§4). |
| introduced_by | **INVARIANT** `methodology.invariant.introduced_by_live_adr` — *`introduced_by` points to an ADR that exists in `docs/adr-*.md` and has status ≠ withdrawn.* Mechanism: schema cross-check. |
| promoted_by | **INVARIANT** `methodology.invariant.promoted_by_set_iff_active` — *`promoted_by` is set ⇔ `tier == active`.* Mechanism: schema. |
| superseded_by | **INVARIANT** `methodology.invariant.superseded_by_set_iff_superseded` — *`superseded_by` is set ⇔ `status == superseded`.* Mechanism: schema. |
| core | `methodology.invariant.core_computed_correctly` (§4). |
| relied_on_by | **INVARIANT** `methodology.invariant.relied_on_by_matches_graph` — *`relied_on_by` field equals the set of live ADRs with `Relies On` edge to this invariant per the anti-gaming rules.* Mechanism: codegen completeness — derived field consistency. |

### 7b. Glossary entry shape (lines 152-159)

| Field | Implies |
|---|---|
| term | **INVARIANT** `methodology.glossary.term_unique` — *Every glossary term is unique within its scope.* Mechanism: schema. |
| definition | RATIONALE (descriptive). |
| resolves_to | **INVARIANT** `methodology.glossary.resolves_to_valid_target` — *`resolves_to` either names a real type/method, an existing invariant ID, or another glossary term.* Mechanism: schema cross-check. |
| scope | **INVARIANT** `methodology.glossary.scope_in_enum` — *`scope` ∈ {methodology, project-cross-cutting, component-local}.* Mechanism: schema. |

### 7c. ADR Invariant Delta block (lines 161-195)

| Block | Implies |
|---|---|
| Block exists for ADRs that affect invariants | **INVARIANT** `methodology.adr.delta_block_required_for_invariant_changes` — *Any ADR that introduces, modifies, deprecates, supersedes, or withdraws an invariant has an `## Invariant Delta` section.* Mechanism: schema/AST scan on ADR markdown. |
| 7 sub-block kinds (Added/Modified/Promoted/Deprecated/Superseded/Withdrawn/Relies On) | **INVARIANT** `methodology.adr.delta_block_kinds_in_enum` — *Each sub-heading inside `## Invariant Delta` is one of the 7 known kinds.* Mechanism: schema. |
| Added: default tier draft | `methodology.invariant.tier_default_draft` (§4). |
| Withdrawn: verifier file deleted in same commit | `methodology.invariant.withdrawal_deletes_verifier` (§4 / Day-1). |
| Relies On: feeds reliance graph | Already counted (`methodology.invariant.relied_on_by_matches_graph`). |
| "running registry equals sum of deltas" | `methodology.adr.delta_reconciles` (Day-1). |

### 7d. Per-component mode flag (lines 197-210)

Already counted (`methodology.mode_flag.declared_per_component` §4).

**Section 7 new invariants: 8**

1. `methodology.invariant.glossary_terms_resolved` (probably consolidate with `methodology.glossary.complete` — net 0 new)
2. `methodology.invariant.introduced_by_live_adr`
3. `methodology.invariant.promoted_by_set_iff_active`
4. `methodology.invariant.superseded_by_set_iff_superseded`
5. `methodology.invariant.relied_on_by_matches_graph`
6. `methodology.glossary.term_unique`
7. `methodology.glossary.resolves_to_valid_target`
8. `methodology.glossary.scope_in_enum`
9. `methodology.adr.delta_block_required_for_invariant_changes`
10. `methodology.adr.delta_block_kinds_in_enum`

Strictly **9-10 new** (one consolidation).

---

## Section 8: Self-Application (lines 212-226)

| Claim | Classification |
|---|---|
| "Methodology is self-applicable" | RATIONALE |
| Day 0 / 1 / N bootstrap order | DEFERRED (implementation phasing). |
| "Recursion bottoms out at trusted primitives" | RATIONALE |

**Section 8 new invariants: 0.**

---

## Section 9: Methodology Governance (lines 228-714)

Largest section. Subsections analyzed individually.

### 9a. Stability tier (lines 232-241)

| Claim | Classification |
|---|---|
| Tier table (draft/active) | DECISION (tier-in-enum already counted §4). |
| Default tier on introduction | `methodology.invariant.tier_default_draft` (already §4). |
| Higher starting tier with justification | **INVARIANT** `methodology.invariant.higher_tier_introduction_requires_justification` — *If an invariant is introduced at tier=active, the introducing ADR includes a justification subsection.* Mechanism: AST scan on ADR. |

### 9b. Core attribute (lines 243-255)

| Claim | Classification |
|---|---|
| Computation rule | `methodology.invariant.core_computed_correctly` (§4). |
| Manual override | `methodology.invariant.core_computed_correctly` covers this (the OR clause). |
| Effect of core=true on removal ceremony | **INVARIANT** `methodology.removal_ceremony.respects_core` — *Removing a core invariant requires either Supersession or explicit redesign analysis section in the withdrawal ADR.* Mechanism: AST scan on ADR + reaction-process gating. |
| Default deprecation period for core ≥ 2 cycles | `methodology.removal_ceremony.respects_core` covers this. |

### 9c. Promotion criteria (lines 257-271)

| Claim | Classification |
|---|---|
| "Promotion is its own ADR" | **INVARIANT** `methodology.promotion.is_pure_tier_change_adr` — *A Promoted delta does not modify statement, mechanism, or verifier of the invariant.* Mechanism: schema. |
| 4 evidence requirements (survival/stability/utility/surrounding-code) | RATIONALE for the audit advisory; not directly enforceable as a CI gate (each criterion is a heuristic). The advisory check is itself an invariant: `methodology.promotion.evidence_advisory` — *Audit advisory flags promotion ADRs that lack required evidence sections.* Mechanism: AST scan + advisory output. |
| "Can be batched" | RATIONALE (process flexibility). |

### 9d. Demotion / removal path (lines 273-281)

Per-tier ceremony table. Most rows imply the same `methodology.removal_ceremony.respects_core` from §9b. The `draft → withdrawn` path is lighter; not separately enforceable.

### 9e. Operational effect of tier (lines 283-291)

Restates that CI enforcement is identical across tiers. RATIONALE.

### 9f. Modification policy and runbook (lines 293-348)

The biggest invariant-dense subsection.

| Claim | Classification |
|---|---|
| Three classes (A/B/C) | DECISION |
| "Class C must be Supersession" | **INVARIANT** `methodology.modification.class_c_via_supersession` — *Substantive content changes (Class C) cannot use the Modified delta; must be authored as a Supersession.* Mechanism: LLM-advisory + reviewer enforcement (not deterministic; weak). Weakness flagged. |
| Class A runbook | RATIONALE |
| Class B step 1: rationale field "sharpening" | **INVARIANT** `methodology.modified.has_rationale_field` — *Every Modified delta has a rationale field with classification.* Mechanism: schema. |
| Class B step 2: re-compile verifier | **INVARIANT** `methodology.modified.verifier_recompiled_for_class_b` — *Class B modifications include a verifier diff in the same commit as the ADR.* Mechanism: schema/git. |
| Class B step 4: roundtrip CI gate | **INVARIANT** `methodology.modified.roundtrip_after_class_b` — *Statement-↔-verifier roundtrip passes after a Class B modification.* Mechanism: integration test. |
| Class B step 5/6: reliance scan + advisory notification | Already covered (`methodology.invariant.relied_on_by_matches_graph` + reaction process). |
| Class B step 8: core requires deprecation phase | `methodology.removal_ceremony.respects_core` covers this. |
| Class C runbook (Supersession) | Already covered (Withdrawal + Added behaviors). |
| CI gates listed | Sub-counts: roundtrip-after-class-b (already counted), no_orphans (Day-1), modified-classification-advisory: **INVARIANT** `methodology.modified.classification_advisory` — *Audit LLM proposes A/B/C class for every Modified delta and flags suspected misclassification.* Mechanism: integration test on advisory output. |
| Default disposition for core | Already covered. |

**Section 9f new invariants: 4-5** (depending on consolidation of class-c-via-supersession with classification-advisory).

### 9g. Reaction process (lines 350-425)

| Claim | Classification |
|---|---|
| Reaction artifact generation on PR open | **INVARIANT** `methodology.reaction.artifact_generated_on_pr_open` — *Opening a PR with a Class B / Supersession / Withdrawal delta triggers reaction artifact generation; one artifact per relying ADR.* Mechanism: integration test on CI hook. |
| Reaction artifact YAML schema | **INVARIANT** `methodology.reaction.artifact_yaml_schema` — *Every reaction artifact validates against the declared YAML schema.* Mechanism: schema. |
| Owner identification rules | **INVARIANT** `methodology.reaction.owner_resolution` — *`relying_adr_owner` is populated using the documented resolution: explicit Owner frontmatter > git author > project fallback.* Mechanism: codegen completeness on resolution function. |
| 5 ack options (re-pin/update/migrate/accept-unpinning/object) | **INVARIANT** `methodology.reaction.ack_in_enum` — *`human_decision.ack` ∈ {re-pin, update, migrate, accept-unpinning, object}.* Mechanism: schema. |
| State machine (pending → acked / expired) | **INVARIANT** `methodology.reaction.state_machine_valid` — *Reaction state transitions follow the declared state machine.* Mechanism: codegen completeness. |
| Expiration disposition by tier | **INVARIANT** `methodology.reaction.expiration_disposition_per_tier` — *Auto-expire policy applied per the declared tier-based table.* Mechanism: integration test. |
| Merge gating | **INVARIANT** `methodology.reaction.merge_blocked_until_acked` — *Triggering ADR cannot merge until all reaction artifacts are acked or expired with acceptable disposition.* Mechanism: CI gate behavior (integration test). |
| Object blocks indefinitely | **INVARIANT** `methodology.reaction.objection_blocks_merge` — *Any reaction in objected state blocks merge until resolved.* Mechanism: CI gate. |

**Section 9g new invariants: 7.**

### 9h. Reaction triage assistant (lines 427-481)

| Claim | Classification |
|---|---|
| Assistant runs on each artifact, fresh context | `methodology.subagent.fresh_context` (Day-1) covers fresh context. |
| LLM suggestion structured fields | **INVARIANT** `methodology.triage.suggestion_schema` — *`llm_suggestion` block has the declared schema (ack, confidence, rationale, draft_followup, flags).* Mechanism: schema. |
| Per-tier auto-ack policy | **INVARIANT** `methodology.triage.auto_ack_per_tier_policy` — *Auto-ack only fires per the per-tier policy table; never on `core` invariants.* Mechanism: integration test. |
| Never auto-object | **INVARIANT** `methodology.triage.never_auto_objects` — *Triage never sets `human_decision.ack = object` autonomously.* Mechanism: integration test. |
| Never auto-merge follow-ups | **INVARIANT** `methodology.triage.never_auto_merges_followups` — *Generated follow-up ADR drafts are not auto-committed; require human commit step.* Mechanism: integration test on triage output handling. |
| Never override owner decisions | **INVARIANT** `methodology.triage.respects_human_decision` — *If `human_decision` is set, triage does not modify it.* Mechanism: integration test. |
| Never decide on core | Subsumed by `methodology.triage.auto_ack_per_tier_policy`. |
| Triage doesn't gate merge | **INVARIANT** `methodology.triage.advisory_only` — *Triage assistant output does not gate CI; merge gate checks `human_decision` only, not `llm_suggestion`.* Mechanism: integration test. (Or: this is a sub-case of `methodology.audit.advisory_only` — the advisory category covers it. Marginal new.) |
| LLM unavailable / nonsense fallback | RATIONALE (failure mode handling, not a contract). |

**Section 9h new invariants: 5-6** (counting the marginal triage.advisory_only).

### 9i. Where reactions literally run (lines 483-522)

| Claim | Classification |
|---|---|
| CI enforcement always on | Subsumed by `methodology.reaction.merge_blocked_until_acked`. |
| 8-step CI flow | RATIONALE/IMPLEMENTATION (the merge gate's correctness is the contract; the steps are how). |
| Local resolution slash commands | Each command is its own contract: |
| /list-reactions output shape | **INVARIANT** `methodology.cli.list_reactions.shape` — schema/golden test. |
| /show-reaction completeness | **INVARIANT** `methodology.cli.show_reaction.complete` — *`/show-reaction` outputs registry entry + LLM suggestion + relying-ADR context.* Mechanism: integration test. |
| /ack-reaction idempotency | **INVARIANT** `methodology.cli.ack_reaction.idempotent` — *Re-running with same args produces same artifact state.* Mechanism: integration test. |
| /ack-batch respects filters | **INVARIANT** `methodology.cli.ack_batch.respects_filters` — *Bulk-ack only modifies artifacts matching declared filter.* Mechanism: integration test. |
| /draft-followup outputs valid ADR | **INVARIANT** `methodology.cli.draft_followup.outputs_valid_adr` — *Drafted ADR passes the ADR template schema.* Mechanism: integration test + schema. |
| /object-reaction sets state | Subsumed by `methodology.reaction.state_machine_valid`. |
| /migrate-reaction records successor | **INVARIANT** `methodology.cli.migrate_reaction.records_successor` — *After /migrate-reaction, `human_decision.ack=migrate` and the artifact records the successor invariant.* Mechanism: integration test. |
| Local-CI parity | **INVARIANT** `methodology.local_ci.idempotent` — *Same triggering ADR + reliance graph → same reaction artifacts + same triage suggestions, regardless of venue.* Mechanism: integration test (run locally and in CI; diff outputs). |
| What's tunable per-project | RATIONALE (already in project config schema). |
| Day-1 default | DEFERRED. |

**Section 9i new invariants: 6-7.**

### 9j. Lineage and reliance graph (lines 524-674)

| Claim | Classification |
|---|---|
| Node types (5) | **INVARIANT** `methodology.lineage.node_types_in_enum` — *All graph nodes are typed as one of {ADR, Spec, Invariant, Verifier, GlossaryTerm}.* Mechanism: schema. |
| Edge types (10) | **INVARIANT** `methodology.lineage.edge_types_in_enum` — *All graph edges are typed as one of the 10 declared kinds.* Mechanism: schema. |
| Edge source-of-truth contracts | **INVARIANT** `methodology.lineage.edge_sources_consistent` — *Each edge type's data matches its declared source (ADR section / registry field / glossary field).* Mechanism: codegen completeness. |
| Reliance detection: explicit Relies On only | Subsumed by `methodology.lineage.edge_sources_consistent`. |
| Inline mentions advisory only | RATIONALE. |
| Reliance graph computation pseudocode | **INVARIANT** (already counted via §4 `methodology.invariant.core_computed_correctly` and the anti-gaming rules below). |
| Anti-gaming rule 1: live ADRs only | **INVARIANT** `methodology.reliance.live_adrs_only` — *Reliance count excludes withdrawn or superseded-as-doc ADRs.* Mechanism: codegen completeness. |
| Anti-gaming rule 2: no meta-edge double-count | **INVARIANT** `methodology.reliance.no_meta_double_count` — *An ADR with a meta-edge to an invariant cannot also have a Relies On edge.* Mechanism: schema/AST scan. |
| Anti-gaming rule 3: set cardinality | **INVARIANT** `methodology.reliance.set_cardinality` — *Per-ADR Relies On entries deduplicate to a set.* Mechanism: codegen completeness. |
| MCP tools (6) | Each tool is a contract: |
| list_invariants returns all + flags | **INVARIANT** `methodology.mcp.list_invariants_complete` — *Returns every registered invariant.* Mechanism: integration test on docs-mcp. |
| search_invariants supports declared dimensions | **INVARIANT** `methodology.mcp.search_invariants_supports_dimensions` — *Search supports full-text + structured filters on statement, glossary terms, mechanism.* Mechanism: integration test. |
| get_invariant returns full registry entry + computed fields | **INVARIANT** `methodology.mcp.get_invariant_returns_computed_fields` — *Includes `relied_on_count`, `core`, `relied_on_by` populated correctly.* Mechanism: integration test. |
| get_invariant_lineage returns all history edges | **INVARIANT** `methodology.mcp.get_invariant_lineage_complete` — *Returns all 6 edge types from ADR to this invariant.* Mechanism: integration test. |
| get_adr_invariants extends ADR view | Subsumed by lineage edge contracts. |
| get_verifier_invariants reverse mapping | **INVARIANT** `methodology.mcp.get_verifier_invariants_reverse` — *Returns the set of invariants that a given verifier file pins.* Mechanism: integration test. |
| Dashboard read views (8) | Each view is a contract on what it displays. Could be one composite invariant: |
| | **INVARIANT** `methodology.dashboard.declared_views_present` — *All 8 declared read views exist in the dashboard.* Mechanism: codegen completeness on dashboard route table. |
| Dashboard write actions (8) | **INVARIANT** `methodology.dashboard.cli_parity` — *Every CLI action in the action-parity table has a dashboard equivalent and vice versa.* Mechanism: codegen completeness. |
| Dashboard local mode commit semantics | **INVARIANT** `methodology.dashboard.local_mode_uses_local_git` — *Local-mode dashboard actions commit via local git.* Mechanism: integration test. |
| Dashboard hosted mode commit semantics | DEFERRED (hosted mode is deferred per Scope). |
| Author attribution recorded | **INVARIANT** `methodology.reaction.author_attribution_recorded` — *`human_decision.acked_by` and `acked_at` populated on ack.* Mechanism: schema. |
| Failure modes (dashboard down etc.) | RATIONALE. |
| "Dashboard extension is natural" | RATIONALE. |

**Section 9j new invariants: ~12.**

### 9k. Lifecycle status (lines 676-685)

Status table covered by `methodology.invariant.status_in_enum` (§4) and `methodology.invariant.withdrawal_deletes_verifier` (Day-1). The "registry-coverage gate's refined contract" is restated here but already covered by `methodology.registry.no_orphans` (Day-1).

**Section 9k new invariants: 0.**

### 9l. Conflict resolution (lines 687-714)

| Claim | Classification |
|---|---|
| Authority hierarchy | RATIONALE (procedural; not enforced by CI). |
| Operational reality (verifier is what CI runs) | RATIONALE. |
| Conflict shape table | RATIONALE. |
| Drift detection mechanism 1: roundtrip | **INVARIANT** `methodology.audit.roundtrip_runs_per_audit_cycle` — *Each audit cycle includes a statement-↔-verifier roundtrip per registered invariant.* Mechanism: integration test on /audit-invariants. |
| Drift detection mechanism 2: differential regen | Already covered (`methodology.audit.differential_regeneration_per_cadence`). |
| Drift detection mechanism 3: mutation testing | DEFERRED (audit-only, deferred per Scope). |
| Drift detection mechanism 4: coverage-of-statement audit | Already covered by audit advisory invariants. |
| "Why duplication is worth it" | RATIONALE. |
| Operational summary | RATIONALE. |

**Section 9l new invariants: 1.**

---

## Section 10: Error Handling (lines 716-722)

| Claim | Classification |
|---|---|
| Verifier compilation failure → build break | RATIONALE (default behavior; no specific contract). |
| Differential regen produces incorrect impl → spec gap | RATIONALE. |
| Registry drift → CI gate fails | Already covered (`methodology.registry.no_orphans`). |
| Coexistence dispatch error → halt | **INVARIANT** `methodology.dispatch.halts_on_unknown_mode` — *`/plan-feature` halts and asks for clarification when a component has unknown or missing mode.* Mechanism: integration test. |
| Glossary coverage failure → blocks authoring | Already covered (`methodology.glossary.complete`). |

**Section 10 new invariants: 1.**

---

## Section 11: Security (lines 724-731)

All claims are about what the methodology *enables* (consumer-side capabilities) or about subagent fresh context (already counted). RATIONALE except for the subagent point.

**Section 11 new invariants: 0.**

---

## Section 12: Impact (lines 733-750)

Lists files updated. STRUCTURAL/RATIONALE; no contracts.

**Section 12 new invariants: 0.**

---

## Section 13: Scope (lines 752-767)

Lists in-scope and deferred items. No contracts; either DECISION (in scope, already covered) or DEFERRED.

**Section 13 new invariants: 0.**

---

## Section 14: Open Questions (lines 769-783)

OPEN. No contracts can be extracted until each question is resolved.

**Section 14 new invariants: 0.**

---

## Section 15: Integration Test Cases (lines 785-794)

Test cases are *examples* of how to verify invariants. The test cases themselves aren't invariants; they're the verifier code for invariants already extracted.

**Section 15 new invariants: 0.**

---

## Section 16: Implementation Plan (lines 796-826)

Implementation phasing. STRUCTURAL/DEFERRED. No contracts.

**Section 16 new invariants: 0.**

---

## Aggregate registration list

Per-section count and the unified de-duplicated list of proposed invariants below.

### Per-section count

| Section | New invariants extracted |
|---|---|
| §2 Overview | 2 |
| §3 Motivation | 0 |
| §4 Decisions | 7-8 |
| §5 User Flow | 7-8 |
| §6 Component Changes | 1 |
| §7 Data Model | 9-10 |
| §8 Self-Application | 0 |
| §9a Stability tier | 1 |
| §9b Core attribute | 1 |
| §9c Promotion criteria | 2 |
| §9d Demotion path | 0 |
| §9e Operational effect | 0 |
| §9f Modification policy | 4-5 |
| §9g Reaction process | 7 |
| §9h Triage assistant | 5-6 |
| §9i Where reactions run | 6-7 |
| §9j Lineage / reliance | 12 |
| §9k Lifecycle status | 0 |
| §9l Conflict resolution | 1 |
| §10 Error Handling | 1 |
| §11-§16 | 0 |

**Subtotal across sections: 67-72** (depending on consolidation of overlapping claims).

### After de-duplication and consolidation

Many extracted invariants overlap or restate the same property in different sections. Consolidating yields the actual registration list:

#### Schema / structural (~14)

1. `methodology.invariant.has_id`
2. `methodology.invariant.has_mechanism` (Day-1)
3. `methodology.invariant.mechanism_in_taxonomy`
4. `methodology.invariant.statement_atomic` (Day-1)
5. `methodology.invariant.tier_in_enum`
6. `methodology.invariant.tier_default_draft`
7. `methodology.invariant.status_in_enum`
8. `methodology.invariant.introduced_by_live_adr`
9. `methodology.invariant.promoted_by_set_iff_active`
10. `methodology.invariant.superseded_by_set_iff_superseded`
11. `methodology.invariant.core_computed_correctly`
12. `methodology.invariant.relied_on_by_matches_graph`
13. `methodology.invariant.higher_tier_introduction_requires_justification`
14. `methodology.invariant.glossary_terms_resolved` (consolidate with `methodology.glossary.complete`)

#### Registry coverage (~3)

15. `methodology.registry.no_orphans` (Day-1)
16. `methodology.adr.delta_reconciles` (Day-1)
17. `methodology.adr.delta_block_required_for_invariant_changes`
18. `methodology.adr.delta_block_kinds_in_enum`

#### Glossary (~4)

19. `methodology.glossary.complete` (Day-1)
20. `methodology.glossary.term_unique`
21. `methodology.glossary.resolves_to_valid_target`
22. `methodology.glossary.scope_in_enum`

#### Mode dispatch (~4)

23. `methodology.dispatch.respects_mode` (Day-1)
24. `methodology.mode_flag.declared_per_component`
25. `methodology.dispatch.halts_on_unknown_mode`
26. `methodology.setup.asks_mode`

#### Skills (~6)

27. `methodology.skills.context_isolation` (Day-1)
28. `methodology.plan_feature.v2_template_for_v2_components`
29. `methodology.plan_feature.blocks_unmechanism_invariants`
30. `methodology.feature_change.uses_verifier_suite_for_v2`
31. `methodology.cli.list_reactions.shape`
32. `methodology.cli.show_reaction.complete`
33. `methodology.cli.ack_reaction.idempotent`
34. `methodology.cli.ack_batch.respects_filters`
35. `methodology.cli.draft_followup.outputs_valid_adr`
36. `methodology.cli.migrate_reaction.records_successor`

#### Subagents (~5)

37. `methodology.subagent.fresh_context` (Day-1)
38. `methodology.invariant_compiler.outputs_compilable_code`
39. `methodology.invariant_compiler.outputs_match_mechanism`
40. `methodology.invariant_compiler.uses_only_resolved_terms`

#### Audit (~5)

41. `methodology.audit.advisory_only` (Day-1)
42. `methodology.audit.differential_regeneration_per_cadence`
43. `methodology.audit.outputs_structured_findings`
44. `methodology.audit.roundtrip_runs_per_audit_cycle`
45. `methodology.modified.classification_advisory`

#### Modification (~4)

46. `methodology.modification.class_c_via_supersession`
47. `methodology.modified.has_rationale_field`
48. `methodology.modified.verifier_recompiled_for_class_b`
49. `methodology.modified.roundtrip_after_class_b`
50. `methodology.removal_ceremony.respects_core`
51. `methodology.invariant.withdrawal_deletes_verifier`
52. `methodology.promotion.is_pure_tier_change_adr`
53. `methodology.promotion.evidence_advisory`

#### Reaction process (~10)

54. `methodology.reaction.artifact_generated_on_pr_open`
55. `methodology.reaction.artifact_yaml_schema`
56. `methodology.reaction.owner_resolution`
57. `methodology.reaction.ack_in_enum`
58. `methodology.reaction.state_machine_valid`
59. `methodology.reaction.expiration_disposition_per_tier`
60. `methodology.reaction.merge_blocked_until_acked`
61. `methodology.reaction.objection_blocks_merge`
62. `methodology.reaction.author_attribution_recorded`
63. `methodology.local_ci.idempotent`

#### Triage (~5)

64. `methodology.triage.suggestion_schema`
65. `methodology.triage.auto_ack_per_tier_policy`
66. `methodology.triage.never_auto_objects`
67. `methodology.triage.never_auto_merges_followups`
68. `methodology.triage.respects_human_decision`
69. `methodology.triage.advisory_only` (consolidate with `audit.advisory_only`?)

#### Lineage / reliance (~9)

70. `methodology.lineage.node_types_in_enum`
71. `methodology.lineage.edge_types_in_enum`
72. `methodology.lineage.edge_sources_consistent`
73. `methodology.reliance.live_adrs_only`
74. `methodology.reliance.no_meta_double_count`
75. `methodology.reliance.set_cardinality`
76. `methodology.mcp.list_invariants_complete`
77. `methodology.mcp.search_invariants_supports_dimensions`
78. `methodology.mcp.get_invariant_returns_computed_fields`
79. `methodology.mcp.get_invariant_lineage_complete`
80. `methodology.mcp.get_verifier_invariants_reverse`

#### Dashboard (~3)

81. `methodology.dashboard.declared_views_present`
82. `methodology.dashboard.cli_parity`
83. `methodology.dashboard.local_mode_uses_local_git`

#### LLM boundaries (~1, mostly subsumed in triage)

84. `methodology.llm.no_recurring_validation`

#### Marginal / debatable (~1)

85. `methodology.language.matches_consumer` (per-component config check; arguably implementation, not contract)

---

### Final tally

After consolidation: **~75-85 atomic invariants** for the methodology declared by ADR-0075, of which:

- **9 are the original Day-1 list** explicitly named in §6d.
- **~30 are mechanically verifiable Day-1+** (could ship in Phase 2 with the original 9): all schema/registry/glossary/lifecycle items.
- **~20 are behavior contracts on tools that need to exist first** (Phase 1+2: skills, subagents, CI gates).
- **~15 are dashboard / lineage / MCP contracts** that depend on docs-mcp and dashboard extensions (Phase 1+).
- **~10 are reaction-process contracts** that depend on the reaction CI flow being wired up.
- **~5-10 are audit-time contracts** (roundtrip, advisory) that depend on /audit-invariants existing.

The original "9 invariants Day 1" framing is misleading. The realistic Day-1 set is closer to **30-40 mechanically verifiable invariants** (the schema/structural ones), with the behavioral contracts on tools registering as those tools come online (Days 1-N depending on phasing).

### Proposed staged registration

| Phase | Tools required | Invariants registerable | Cumulative count |
|---|---|---|---|
| **Phase 1**: registry/glossary/script CI gates exist | check-registry-coverage, check-glossary, ADR delta parser, mode-flag schema | All schema/structural (sections "Schema / structural", "Registry coverage", "Glossary", "Mode dispatch" in the list above) | ~25 |
| **Phase 2**: subagents and basic skills exist | invariant-compiler, /plan-feature v2, /feature-change v2, /setup v2 | Add subagent and skill behavior contracts | ~35 |
| **Phase 3**: audit + modification gates wired | /audit-invariants, modification CI gates, deferred mutation testing | Add audit and modification contracts | ~45 |
| **Phase 4**: reaction CI flow wired | reaction generator, merge gate, slash commands for resolution | Add reaction-process contracts | ~60 |
| **Phase 5**: lineage + dashboard extended | docs-mcp invariant index, dashboard new views and write actions | Add lineage + MCP + dashboard contracts | ~75 |
| **Phase 6**: cleanup and consolidation | optional triage assistant, hosted dashboard mode, etc. | Add remaining triage and dashboard-write contracts | ~85 |

The key insight: **invariants register as the tools they pin come online.** You can't pin a behavior contract on a tool that doesn't exist. The Phase 1 set is large (~25) because schema/structural invariants only need the registry to exist; they don't depend on tool behavior.

### What's NOT in the count

- **OPEN questions** — when resolved, each will likely add 1-3 invariants (registry format → schema invariant; glossary form → schema invariants; verifier file layout → arch rule invariant; etc.).
- **DEFERRED items** — TypeScript/Python/Rust language bindings, mutation testing as CI, hosted dashboard, journey-author skill — each will add invariants in a follow-up ADR.
- **Consumer-side invariants** — mclaude's invariants are out of scope here. ADR-0075 is the methodology; consumer invariants are introduced by consumer-project ADRs (e.g. mclaude ADR-0100).

### Recommendation

Update the Implementation Plan in ADR-0075 to:
1. Replace "9 methodology invariants" with **"~25 Phase-1 invariants registered first"** (the schema/structural set).
2. Add a phased registration table showing which invariants come online with which tools.
3. Note that the total methodology-own registry size at full implementation is **~75-85 invariants**, not 9.

The Day-1 list of 9 is a reasonable *minimum* to prove the machinery, but the *full* methodology registry is much larger — and that's expected, because the methodology has substantial tooling and each tool carries multiple behavior contracts.
