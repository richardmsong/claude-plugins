# Analysis: Invariant Extraction from ADR-0075 (line-by-line, atomic claims)

**Source**: `src/sdd/docs/adr-0075-invariant-driven-development.md` (826 lines)
**Purpose**: line-by-line breakdown identifying every invariant the ADR implies. The Master List below contains the canonical definition of each invariant. The Line-by-line walkthrough that follows references the Master List via clickable links — every invariant ID in the walkthrough is a link to its entry in the Master List.
**Companion**: see `analysis-adr-0075-invariant-extraction.md` for the section-grouped first pass.

## Classification key

- **INVARIANT** — register; defined in the Master List below.
- **DECISION** — recorded in the ADR's Decisions table; itself not registered.
- **GLOSSARY** — defines a term used by invariants.
- **RATIONALE** — context, motivation, justification; not a contract.
- **IMPLEMENTATION** — internal to a tool; refactor-safe.
- **OPEN** — pending decision in the ADR's Open questions section.
- **DEFERRED** — explicit future scope.
- **STRUCTURAL** — title, status, headings, code-block delimiters.
- **SUBSUMED** — restates an invariant proposed elsewhere; do not double-count.

---

# Master List of Invariants

Every invariant identified in the analysis is defined here exactly once. The Line-by-line walkthrough below uses links into this list. Headings are the canonical anchor for each invariant; click any link in the walkthrough to jump here.

## Schema / structural / lifecycle

### inv-methodology-invariant-has-id
**ID**: `methodology.invariant.has_id`
**Statement**: Every registry entry has a unique stable string ID matching `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$`.
**Mechanism**: schema check on registry.

### inv-methodology-invariant-has-mechanism
**ID**: `methodology.invariant.has_mechanism`
**Statement**: Every registry entry has a non-null `mechanism` field.
**Mechanism**: schema check.

### inv-methodology-invariant-mechanism-in-taxonomy
**ID**: `methodology.invariant.mechanism_in_taxonomy`
**Statement**: `mechanism` field's value is in the closed enum {unit, table, property, arch, ast, type, schema, completeness, integration, journey}.
**Mechanism**: schema check.

### inv-methodology-invariant-statement-atomic
**ID**: `methodology.invariant.statement_atomic`
**Statement**: Statement field contains no logical "AND" connector at the top level — invariants must be atomic.
**Mechanism**: lint heuristic on registry.

### inv-methodology-invariant-statement-single-line
**ID**: `methodology.invariant.statement_single_line`
**Statement**: Statement field contains no newline character.
**Mechanism**: schema.

### inv-methodology-invariant-tier-in-enum
**ID**: `methodology.invariant.tier_in_enum`
**Statement**: `tier` field's value is in {draft, active}.
**Mechanism**: schema.

### inv-methodology-invariant-tier-default-draft
**ID**: `methodology.invariant.tier_default_draft`
**Statement**: Newly registered invariants default to `tier=draft` unless the introducing ADR includes an explicit higher-tier-justification subsection.
**Mechanism**: AST scan on Added delta entries.

### inv-methodology-invariant-higher-tier-justification
**ID**: `methodology.invariant.higher_tier_introduction_requires_justification`
**Statement**: Adding an invariant at tier=active requires an explicit `### Justification` subsection in the introducing ADR's Added entry.
**Mechanism**: AST scan.

### inv-methodology-invariant-status-in-enum
**ID**: `methodology.invariant.status_in_enum`
**Statement**: `status` field is in {active, deprecated, superseded, withdrawn}.
**Mechanism**: schema.

### inv-methodology-invariant-introduced-by-live-adr
**ID**: `methodology.invariant.introduced_by_live_adr`
**Statement**: `introduced_by` field references an ADR file that exists and has status ≠ withdrawn.
**Mechanism**: schema cross-check.

### inv-methodology-invariant-promoted-by-iff-active
**ID**: `methodology.invariant.promoted_by_set_iff_active`
**Statement**: `promoted_by` field is set if and only if `tier == active`.
**Mechanism**: schema.

### inv-methodology-invariant-superseded-by-iff-superseded
**ID**: `methodology.invariant.superseded_by_set_iff_superseded`
**Statement**: `superseded_by` field is set if and only if `status == superseded`; if set, points to a live invariant ID.
**Mechanism**: schema cross-check.

### inv-methodology-invariant-core-computed-correctly
**ID**: `methodology.invariant.core_computed_correctly`
**Statement**: `core` field equals `(relied_on_count ≥ threshold) OR manually_set`, recomputed on every commit affecting the citation graph.
**Mechanism**: codegen completeness — derived field consistency check.

### inv-methodology-invariant-relied-on-by-matches-graph
**ID**: `methodology.invariant.relied_on_by_matches_graph`
**Statement**: `relied_on_by` field equals the set of live ADRs with Relies On edge to this invariant per anti-gaming rules.
**Mechanism**: codegen completeness — derived field.

### inv-methodology-invariant-glossary-terms-populated
**ID**: `methodology.invariant.glossary_terms_field_populated`
**Statement**: `glossary_terms` lists every term from the statement that requires resolution; populated at compile time.
**Mechanism**: codegen consistency.

### inv-methodology-invariant-withdrawal-deletes-verifier
**ID**: `methodology.invariant.withdrawal_deletes_verifier`
**Statement**: When an ADR's Withdrawn delta names an invariant, the same commit deletes the verifier file referenced in the registry.
**Mechanism**: deterministic script (CI gate, git-aware).

### inv-methodology-registry-no-orphans
**ID**: `methodology.registry.no_orphans`
**Statement**: Every active or deprecated registry entry has a live verifier; every verifier file is referenced by exactly one registered invariant.
**Mechanism**: deterministic script (CI gate).

### inv-methodology-adr-delta-reconciles
**ID**: `methodology.adr.delta_reconciles`
**Statement**: Sum of all live ADRs' (Added − Withdrawn) deltas equals the current registry contents.
**Mechanism**: deterministic script (CI gate).

### inv-methodology-adr-delta-block-required
**ID**: `methodology.adr.delta_block_required_for_invariant_changes`
**Statement**: Any ADR that introduces, modifies, deprecates, supersedes, or withdraws an invariant has an `## Invariant Delta` section.
**Mechanism**: AST scan on ADR markdown.

### inv-methodology-adr-delta-block-kinds-in-enum
**ID**: `methodology.adr.delta_block_kinds_in_enum`
**Statement**: Every sub-heading inside `## Invariant Delta` is one of the 7 declared kinds (Added, Modified, Promoted, Deprecated, Superseded, Withdrawn, Relies On).
**Mechanism**: AST scan.

### inv-methodology-added-block-complete
**ID**: `methodology.adr.added_block_complete`
**Statement**: Each Added entry includes id + statement + mechanism + verifier (and optional tier).
**Mechanism**: schema scan.

### inv-methodology-deprecated-block-includes-reason
**ID**: `methodology.deprecated_block_includes_reason_and_target`
**Statement**: Deprecated entry includes reason and expected withdrawal ADR / cycle.
**Mechanism**: schema.

### inv-methodology-superseded-block-maps-old-new
**ID**: `methodology.superseded_block_maps_old_to_new`
**Statement**: Superseded entry references both old and new invariant IDs.
**Mechanism**: schema.

## Glossary

### inv-methodology-glossary-complete
**ID**: `methodology.glossary.complete`
**Statement**: Every term in any active invariant statement resolves to a typed binding (Go type/method) or an entry in the glossary file.
**Mechanism**: deterministic script (CI gate).

### inv-methodology-glossary-term-unique
**ID**: `methodology.glossary.term_unique`
**Statement**: Every glossary term is unique within its scope.
**Mechanism**: schema.

### inv-methodology-glossary-resolves-to-valid
**ID**: `methodology.glossary.resolves_to_valid_target`
**Statement**: `resolves_to` value is a real type/method, an existing invariant ID, or another glossary term.
**Mechanism**: schema cross-check.

### inv-methodology-glossary-scope-in-enum
**ID**: `methodology.glossary.scope_in_enum`
**Statement**: `scope` value is in {methodology, project-cross-cutting, component-local}.
**Mechanism**: schema.

## Skills

### inv-methodology-adr-authoring-uses-plan-feature
**ID**: `methodology.adr_authoring.uses_plan_feature`
**Statement**: Any new or modified ADR that touches invariants is authored via `/plan-feature` (not by direct file write outside the skill).
**Mechanism**: integration test + advisory.

### inv-methodology-plan-feature-includes-delta-when-present
**ID**: `methodology.plan_feature.includes_invariant_delta_when_present`
**Statement**: When the author indicates the ADR introduces invariants, `/plan-feature` includes the Invariant Delta block in the template; otherwise produces a standard ADR.
**Mechanism**: integration test.

### inv-methodology-plan-feature-blocks-unmechanism
**ID**: `methodology.plan_feature.blocks_unmechanism_invariants`
**Statement**: `/plan-feature` cannot transition an ADR from draft → accepted while any proposed invariant lacks a mechanism field.
**Mechanism**: integration test on /plan-feature finalization step.

### inv-methodology-plan-feature-blocks-unresolved-terms
**ID**: `methodology.plan_feature.blocks_unresolved_terms`
**Statement**: `/plan-feature` cannot finalize ADRs with unresolved terms in proposed invariant statements.
**Mechanism**: integration test.

### inv-methodology-feature-change-uses-verifier-suite
**ID**: `methodology.feature_change.uses_verifier_suite_when_invariants_present`
**Statement**: When an ADR includes an Invariant Delta block, `/feature-change` adds the verifier suite as a success criterion alongside the existing implementation-evaluator.
**Mechanism**: integration test.

### inv-methodology-glossary-check-deterministic
**ID**: `methodology.glossary_check.is_deterministic_script`
**Statement**: `/check-glossary` is implemented as a non-LLM script (CI-runnable; same input → same output).
**Mechanism**: arch rule (forbid LLM imports in the script).

### inv-methodology-registry-check-deterministic
**ID**: `methodology.registry_check.is_deterministic_script`
**Statement**: `/check-registry-coverage` is implemented as a non-LLM script.
**Mechanism**: arch rule (forbid LLM imports).

### inv-methodology-cli-list-reactions
**ID**: `methodology.cli.list_reactions.shape`
**Statement**: `/list-reactions` output is a structured table including reaction id, target invariant, ack state, deadline, and LLM suggestion summary.
**Mechanism**: integration test (golden output).

### inv-methodology-cli-show-reaction
**ID**: `methodology.cli.show_reaction.complete`
**Statement**: `/show-reaction` output includes registry entry + LLM suggestion + relying-ADR full text excerpt.
**Mechanism**: integration test.

### inv-methodology-cli-ack-reaction
**ID**: `methodology.cli.ack_reaction.idempotent`
**Statement**: `/ack-reaction` re-running with same args produces the same artifact state.
**Mechanism**: integration test.

### inv-methodology-cli-ack-batch
**ID**: `methodology.cli.ack_batch.respects_filters`
**Statement**: `/ack-batch` only modifies artifacts matching the declared filters.
**Mechanism**: integration test.

### inv-methodology-cli-draft-followup
**ID**: `methodology.cli.draft_followup.outputs_valid_adr`
**Statement**: `/draft-followup` output ADR file passes ADR template schema validation.
**Mechanism**: integration test + schema check.

## Subagents

### inv-methodology-subagent-fresh-context
**ID**: `methodology.subagent.fresh_context`
**Statement**: Subagents run with no inherited conversation history from the master session.
**Mechanism**: agent definition check + integration test.

### inv-methodology-invariant-compiler-is-subagent
**ID**: `methodology.invariant_compiler.is_subagent`
**Statement**: Verifier code generation runs in a dedicated subagent (`invariant-compiler`), not inline in the master session.
**Mechanism**: skill/agent definition check.

### inv-methodology-invariant-compiler-input-is-adr-delta
**ID**: `methodology.invariant_compiler.input_is_adr_delta`
**Statement**: invariant-compiler subagent input is the ADR's Invariant Delta block contents only — not the full ADR or unrelated context.
**Mechanism**: integration test on subagent invocation.

### inv-methodology-invariant-compiler-outputs-match-mechanism
**ID**: `methodology.invariant_compiler.outputs_match_mechanism`
**Statement**: invariant-compiler output file type matches the invariant's mechanism (test file for unit/property/integration; lint rule for arch/ast; schema file for schema mechanism).
**Mechanism**: integration test.

### inv-methodology-invariant-compiler-output-in-pr-branch
**ID**: `methodology.invariant_compiler.output_in_pr_branch`
**Statement**: invariant-compiler generated verifier files are committed to the same PR branch as the ADR delta.
**Mechanism**: integration test.

### inv-methodology-invariant-compiler-outputs-compilable
**ID**: `methodology.invariant_compiler.outputs_compilable_code`
**Statement**: invariant-compiler generated verifier code compiles in the consumer-language toolchain.
**Mechanism**: build check.

## Audit

### inv-methodology-audit-advisory-only
**ID**: `methodology.audit.advisory_only`
**Statement**: Audit findings do not gate CI or block any merge; they are advisory output reviewed by humans.
**Mechanism**: integration test (audit failure does not change CI status).

### inv-methodology-audit-differential-regeneration-per-cadence
**ID**: `methodology.audit.differential_regeneration_per_cadence`
**Statement**: Audit removes production code, regenerates N times from registry, diffs outputs, and classifies divergence.
**Mechanism**: integration test on /audit-invariants.

### inv-methodology-audit-outputs-structured-findings
**ID**: `methodology.audit.outputs_structured_findings`
**Statement**: Audit produces a Markdown file at a known path (`docs/audit/audit-<date>.md`) with a declared schema for findings.
**Mechanism**: integration test on output.

### inv-methodology-audit-runs-per-cadence
**ID**: `methodology.audit.runs_per_cadence`
**Statement**: `/audit-invariants` runs at the cadence configured per project.
**Mechanism**: integration test + scheduled-job config check.

### inv-methodology-audit-input-scope
**ID**: `methodology.audit.input_scope`
**Statement**: Audit input is registry + ADRs in the configured time window; no production code.
**Mechanism**: integration test.

### inv-methodology-audit-roundtrip
**ID**: `methodology.audit.roundtrip_runs_per_audit_cycle`
**Statement**: Each audit cycle includes a statement-↔-verifier roundtrip per registered invariant.
**Mechanism**: integration test on /audit-invariants.

## Modification policy

### inv-methodology-modification-class-c-via-supersession
**ID**: `methodology.modification.class_c_via_supersession`
**Statement**: Substantive content changes (Class C) cannot use the Modified delta; must be authored as Supersession.
**Mechanism**: LLM-advisory + reviewer enforcement.

### inv-methodology-modified-has-rationale
**ID**: `methodology.modified.has_rationale_field`
**Statement**: Every Modified delta has a rationale field naming the class (mechanical / sharpening).
**Mechanism**: schema.

### inv-methodology-modified-verifier-recompiled
**ID**: `methodology.modified.verifier_recompiled_for_class_b`
**Statement**: A Class B Modified delta includes a verifier diff in the same commit (re-compiled output).
**Mechanism**: schema/git check.

### inv-methodology-modified-roundtrip-after-class-b
**ID**: `methodology.modified.roundtrip_after_class_b`
**Statement**: Statement-↔-verifier roundtrip is run on every Class B Modified delta and must pass.
**Mechanism**: integration test.

### inv-methodology-modified-classification-advisory
**ID**: `methodology.modified.classification_advisory`
**Statement**: Audit LLM proposes A/B/C class for every Modified delta and flags suspected misclassification.
**Mechanism**: integration test on advisory.

### inv-methodology-removal-ceremony-respects-core
**ID**: `methodology.removal_ceremony.respects_core`
**Statement**: Withdrawing or substantively modifying a core=true invariant requires a successor (Supersession) or an explicit redesign-impact analysis subsection in the withdrawal ADR.
**Mechanism**: AST scan + reaction-process gating.

### inv-methodology-deprecation-period-per-tier
**ID**: `methodology.deprecation.period_per_tier`
**Statement**: Active core invariants deprecate ≥ 2 audit cycles before withdrawal; non-core ≥ 1 cycle.
**Mechanism**: AST scan + reaction-process gating (deadline calculations).

### inv-methodology-promotion-is-pure-tier-change-adr
**ID**: `methodology.promotion.is_pure_tier_change_adr`
**Statement**: A Promoted delta does not modify the invariant's statement, mechanism, or verifier; only its tier.
**Mechanism**: schema (compare before/after).

### inv-methodology-promotion-evidence-advisory
**ID**: `methodology.promotion.evidence_advisory`
**Statement**: Audit advisory flags promotion ADRs that lack the required evidence sections (survival cycles, utility evidence, surrounding-code-stability metric).
**Mechanism**: AST scan + advisory.

## Reaction process

### inv-methodology-reaction-required
**ID**: `methodology.reaction.required_for_class_b_supersession_withdrawal`
**Statement**: Any Class B / Supersession / Withdrawal delta affecting an invariant with one or more relying ADRs requires reaction artifacts to be generated.
**Mechanism**: integration test on PR-open hook.

### inv-methodology-reaction-artifact-on-pr-open
**ID**: `methodology.reaction.artifact_generated_on_pr_open`
**Statement**: Opening a PR with a triggering delta triggers reaction artifact generation; CI hook does this on every push.
**Mechanism**: integration test.

### inv-methodology-reaction-one-per-relying
**ID**: `methodology.reaction.one_artifact_per_relying_adr`
**Statement**: Number of artifacts generated equals number of live ADRs with relies_on edge to the affected invariant(s).
**Mechanism**: integration test.

### inv-methodology-reaction-artifact-schema
**ID**: `methodology.reaction.artifact_yaml_schema`
**Statement**: Every reaction artifact validates against the declared schema (triggering_adr, target_invariant, delta_kind, optional new_invariant, relying_adr, owner, state, created, deadline, ack, ack_rationale).
**Mechanism**: schema.

### inv-methodology-reaction-artifacts-pr-branch
**ID**: `methodology.reaction.artifacts_in_pr_branch`
**Statement**: Reaction artifacts live in `docs/reactions/` on the PR branch (and persist to main on merge).
**Mechanism**: integration test.

### inv-methodology-reaction-artifacts-persist
**ID**: `methodology.reaction.artifacts_persist_in_main`
**Statement**: On merge of triggering ADR, reaction artifacts remain in main's git history (optionally archived).
**Mechanism**: integration test.

### inv-methodology-reaction-owner-resolution
**ID**: `methodology.reaction.owner_resolution`
**Statement**: Owner is resolved as: explicit Owner frontmatter > git author of original ADR commit > project fallback in `.sdd/components.yaml`.
**Mechanism**: codegen completeness on resolution function.

### inv-methodology-reaction-ack-in-enum
**ID**: `methodology.reaction.ack_in_enum`
**Statement**: `human_decision.ack` field is in {re-pin, update, migrate, accept-unpinning, object}.
**Mechanism**: schema.

### inv-methodology-reaction-repin
**ID**: `methodology.reaction.repin_preserves_or_migrates_edge`
**Statement**: re-pin ack preserves the reliance edge (or auto-migrates to successor for Supersession).
**Mechanism**: integration test.

### inv-methodology-reaction-update
**ID**: `methodology.reaction.update_blocks_until_followup`
**Statement**: update ack requires a follow-up ADR before merge can proceed.
**Mechanism**: integration test on merge gate.

### inv-methodology-reaction-migrate-records
**ID**: `methodology.reaction.migrate_records_successor`
**Statement**: migrate ack records the successor invariant ID in the reaction artifact.
**Mechanism**: schema.

### inv-methodology-reaction-unpinning
**ID**: `methodology.reaction.unpinning_marks_adr`
**Statement**: accept-unpinning ack flags the relying ADR as un-pinned in its frontmatter or status.
**Mechanism**: schema.

### inv-methodology-reaction-objection
**ID**: `methodology.reaction.objection_blocks_merge`
**Statement**: object ack blocks merge until the artifact's state changes (escalation / re-author / withdrawal of objection).
**Mechanism**: integration test.

### inv-methodology-reaction-state-machine
**ID**: `methodology.reaction.state_machine_valid`
**Statement**: Reaction state transitions follow the declared graph (pending → acked / expired; acked / expired terminal).
**Mechanism**: codegen completeness.

### inv-methodology-reaction-expiration-per-tier
**ID**: `methodology.reaction.expiration_disposition_per_tier`
**Statement**: On expiration, draft and non-core active default to accept-unpinning; core active blocks until explicit ack.
**Mechanism**: integration test.

### inv-methodology-reaction-merge-gate
**ID**: `methodology.reaction.merge_blocked_until_acked`
**Statement**: Merge gate fails when any reaction artifact is in pending state (with non-acceptable expiration) or in objected state.
**Mechanism**: integration test on CI gate.

### inv-methodology-reaction-attribution
**ID**: `methodology.reaction.author_attribution_recorded`
**Statement**: Every acked reaction artifact has populated `human_decision.ack`, `acked_by`, `acked_at`, `venue` fields.
**Mechanism**: schema.

### inv-methodology-reaction-venue-enum
**ID**: `methodology.reaction.venue_in_enum`
**Statement**: `venue` field is in {cli, dashboard-local, dashboard-hosted}.
**Mechanism**: schema.

### inv-methodology-reaction-cli-action-parity
**ID**: `methodology.reaction.cli_action_parity`
**Statement**: Every reaction-related action declared in this ADR has a corresponding slash command implementation.
**Mechanism**: codegen completeness.

### inv-methodology-reaction-cli-writes-direct
**ID**: `methodology.reaction.cli_writes_artifact_directly`
**Statement**: Slash commands modify the artifact YAML files in the working tree (do not bypass via APIs).
**Mechanism**: integration test.

### inv-methodology-reaction-ci-always-on
**ID**: `methodology.reaction.ci_always_on_with_registry`
**Statement**: Any project with a non-empty invariant registry has CI gates for reaction generation, triage, and merge enforcement.
**Mechanism**: project-config check.

## Triage assistant

### inv-methodology-triage-input-scope
**ID**: `methodology.triage.input_scope`
**Statement**: Triage assistant receives the ADR diff, target invariant entry, relying ADR full text, and registry entry; no other context.
**Mechanism**: integration test on subagent invocation.

### inv-methodology-triage-suggestion-schema
**ID**: `methodology.triage.suggestion_schema`
**Statement**: `llm_suggestion` block has the declared fields (ack, confidence, rationale, draft_followup, flags) with validated types.
**Mechanism**: schema.

### inv-methodology-triage-human-decision-null
**ID**: `methodology.triage.human_decision_initially_null`
**Statement**: Newly generated reaction artifact has `human_decision: null`.
**Mechanism**: schema/integration test.

### inv-methodology-triage-auto-ack-policy
**ID**: `methodology.triage.auto_ack_per_tier_policy`
**Statement**: Auto-ack only fires per the declared per-tier policy table; never on `core` invariants regardless of confidence.
**Mechanism**: integration test.

### inv-methodology-triage-no-auto-object
**ID**: `methodology.triage.never_auto_objects`
**Statement**: Triage never sets `human_decision.ack = object` autonomously; it can flag concerns but routes to human review.
**Mechanism**: integration test on triage output handling.

### inv-methodology-triage-no-auto-merge
**ID**: `methodology.triage.never_auto_merges_followups`
**Statement**: Generated follow-up ADR drafts are placed in the working tree but not committed by triage.
**Mechanism**: integration test.

### inv-methodology-triage-respects-human
**ID**: `methodology.triage.respects_human_decision`
**Statement**: If `human_decision` is non-null, triage does not modify it.
**Mechanism**: integration test.

### inv-methodology-triage-advisory-only
**ID**: `methodology.triage.advisory_only`
**Statement**: Reaction merge-gate only checks `human_decision`; `llm_suggestion` is advisory.
**Mechanism**: integration test.

## Lineage / reliance / MCP

### inv-methodology-lineage-node-types
**ID**: `methodology.lineage.node_types_in_enum`
**Statement**: All graph nodes are typed as one of {ADR, Spec, Invariant, Verifier, GlossaryTerm}.
**Mechanism**: schema.

### inv-methodology-lineage-edge-types
**ID**: `methodology.lineage.edge_types_in_enum`
**Statement**: All graph edges are typed as one of the 10 declared kinds {relies_on, introduces, modifies, promotes, deprecates, withdraws, supersedes, pinned_by, uses_term, defines_term}.
**Mechanism**: schema.

### inv-methodology-lineage-edge-sources
**ID**: `methodology.lineage.edge_sources_consistent`
**Statement**: Each edge type's data matches its declared source-of-truth (ADR section / registry field / glossary field).
**Mechanism**: codegen completeness.

### inv-methodology-reliance-inline-advisory
**ID**: `methodology.reliance.inline_mentions_advisory`
**Statement**: Inline mentions of invariant IDs in ADR prose do not contribute to the reliance count; only explicit Relies On blocks do.
**Mechanism**: integration test.

### inv-methodology-reliance-live-only
**ID**: `methodology.reliance.live_adrs_only`
**Statement**: Reliance count excludes withdrawn ADRs and superseded-as-doc ADRs.
**Mechanism**: codegen completeness.

### inv-methodology-reliance-no-meta-double-count
**ID**: `methodology.reliance.no_meta_double_count`
**Statement**: An ADR with any meta-edge (introduces / modifies / promotes / deprecates / withdraws / supersedes) to an invariant cannot also have a Relies On edge to that invariant; if both are declared, the meta-edge wins.
**Mechanism**: schema/AST scan.

### inv-methodology-reliance-set-cardinality
**ID**: `methodology.reliance.set_cardinality`
**Statement**: Per-ADR Relies On entries deduplicate to a set; multiple entries for the same invariant ID count as one.
**Mechanism**: codegen completeness.

### inv-methodology-mcp-list
**ID**: `methodology.mcp.list_invariants_complete`
**Statement**: `list_invariants` returns every registered invariant with tier/status/core/mechanism/verifier path.
**Mechanism**: integration test on docs-mcp.

### inv-methodology-mcp-search
**ID**: `methodology.mcp.search_invariants_supports_dimensions`
**Statement**: `search_invariants` supports full-text + structured filters on statement, glossary terms, mechanism, tier, status.
**Mechanism**: integration test.

### inv-methodology-mcp-get
**ID**: `methodology.mcp.get_invariant_returns_computed_fields`
**Statement**: `get_invariant` returns full registry entry with computed `relied_on_count`, `core`, `relied_on_by` fields populated.
**Mechanism**: integration test.

### inv-methodology-mcp-lineage
**ID**: `methodology.mcp.get_invariant_lineage_complete`
**Statement**: `get_invariant_lineage` returns all 6 ADR-edge types and the supersession chain.
**Mechanism**: integration test.

### inv-methodology-mcp-adr-invariants
**ID**: `methodology.mcp.get_adr_invariants_extends_lineage`
**Statement**: For an ADR, `get_adr_invariants` returns all introduces/modifies/promotes/deprecates/withdraws/relies-on edges to invariants.
**Mechanism**: integration test.

### inv-methodology-mcp-verifier-invariants
**ID**: `methodology.mcp.get_verifier_invariants_reverse`
**Statement**: For a verifier file path, `get_verifier_invariants` returns the set of invariants pinned by it.
**Mechanism**: integration test.

## Dashboard

### inv-methodology-dashboard-views
**ID**: `methodology.dashboard.declared_views_present`
**Statement**: Dashboard route table includes all 8 declared read views (Invariants tab, Invariant detail, Reliance graph view, Core candidates panel, Drift heatmap, Tier distribution, Promotion candidates, Reactions queue).
**Mechanism**: codegen completeness on dashboard route table.

### inv-methodology-dashboard-cli-parity
**ID**: `methodology.dashboard.cli_parity`
**Statement**: Each CLI slash command has a corresponding dashboard write action; bijection enforced by codegen.
**Mechanism**: codegen completeness.

### inv-methodology-dashboard-same-format
**ID**: `methodology.dashboard.same_artifact_format`
**Statement**: Dashboard write actions produce artifact YAML files identical in shape to those produced by CLI.
**Mechanism**: integration test (compare CLI and dashboard outputs for same input).

### inv-methodology-dashboard-local-mode
**ID**: `methodology.dashboard.local_mode_uses_local_git`
**Statement**: Local-mode dashboard write actions execute via local git operations (add/commit/optional push) using the developer's git identity.
**Mechanism**: integration test.

## Self-application + cross-cutting

### inv-methodology-self-application-same-machinery
**ID**: `methodology.self_application.same_machinery`
**Statement**: agent-plugins's own invariant registry uses the same registry format, glossary system, and CI gates that consumer projects use.
**Mechanism**: integration check (no methodology-specific paths).

### inv-methodology-local-ci-same-code
**ID**: `methodology.local_ci.same_code`
**Statement**: Slash command implementations and CI hook implementations call the same underlying function.
**Mechanism**: arch rule (forbid divergent implementations).

### inv-methodology-local-ci-idempotent
**ID**: `methodology.local_ci.idempotent`
**Statement**: Same triggering ADR + reliance graph produces the same reaction artifacts and triage suggestions regardless of venue.
**Mechanism**: integration test (run locally and in CI; diff outputs).

## CI behavior

### inv-methodology-ci-runs-verifier-suite
**ID**: `methodology.ci.runs_verifier_suite_on_every_commit`
**Statement**: CI workflow includes a job that runs the verifier suite for every PR commit.
**Mechanism**: GH Actions config schema check.

### inv-methodology-ci-failures-attributed
**ID**: `methodology.ci.failures_attributed_to_invariant_id`
**Statement**: When a verifier fails, the CI output identifies the failing invariant ID.
**Mechanism**: integration test on CI output format.

### inv-methodology-llm-no-recurring-validation
**ID**: `methodology.llm.no_recurring_validation`
**Statement**: No CI gate's pass/fail decision invokes an LLM; LLM calls only appear in skills/subagents that produce committed artifacts (invariant-compiler, audit, triage).
**Mechanism**: arch-rule (forbid LLM-call imports inside CI gate scripts) + AST scan.

## Mechanism documentation

### inv-methodology-mechanism-tool-documented
**ID**: `methodology.mechanism.tool_documented`
**Statement**: Every mechanism in the taxonomy has a documented default tool in `spec-verifier-conventions.md` (per language).
**Mechanism**: codegen completeness on the spec doc.

## Marginal

### inv-methodology-language-matches-consumer
**ID**: `methodology.language.matches_consumer`
**Statement**: A v2 component's verifier files are written in the same language as the production code they verify.
**Mechanism**: schema check on per-component config + arch rule.

---

# Line-by-line walkthrough

Every substantive line of ADR-0075 is decomposed below. Invariant references are clickable links into the Master List above.

## Lines 1-5: Header / Status

| Line | Content | Classification |
|---|---|---|
| 1 | `# ADR: ...` | STRUCTURAL (title) |
| 3-5 | Status / status history | STRUCTURAL |

## Lines 7-13: Overview

### Line 9
> "Evolve the spec-driven-dev plugin from markdown-spec methodology (v1) to invariant-driven development with compiled verification (v2). Named invariants — not markdown spec prose — become the canonical contract surface, and verification is performed by deterministic CPU-bound mechanisms..."

Atomic claims:
1. "Evolve from v1 to v2" — DECISION.
2. "Named invariants are canonical contract surface" — DECISION.
3. "Verification by deterministic CPU-bound mechanisms" — DECISION.
4. "Mechanism enumeration: test files, lint, schemas, types" — RATIONALE (taxonomy preview).
5. "LLMs only at authoring + audit time, never recurring CI" — INVARIANT [`methodology.llm.no_recurring_validation`](#inv-methodology-llm-no-recurring-validation).
6. "Audit cadence quarterly" — OPEN.

### Line 11
> "V1 markdown-spec methodology coexists with v2... Consumer projects opt in per-component; both modes ship in the same plugin and share the existing skills which dispatch internally based on the per-component mode."

Atomic claims:
1. "Methodology is additive, not parallel mode" — DECISION (post-simplification).
2. "ADRs include Invariant Delta block when invariants are introduced" — SUBSUMED by [`methodology.adr.delta_block_required_for_invariant_changes`](#inv-methodology-adr-delta-block-required).
3. "ADRs without delta blocks continue to work as-is" — RATIONALE (additive design).
4. "Registry/CI/glossary machinery activates only when invariants present" — RATIONALE.

### Line 13
> "The plugin's own development uses v2 from Day 1..."

Atomic claims: DEFERRED (phasing) / RATIONALE.

## Lines 15-25: Motivation

Lines 17, 19-23: problem statements — all RATIONALE.

### Line 25
> "V2 shifts the contract surface from prose to executable artifacts... typed invariant registry as the meta-layer that names, indexes, and coverage-checks every claim... dead code becomes mechanically detectable via differential regeneration."

Atomic claims:
1. "Contract surface = executable artifacts" — DECISION.
2. "Typed invariant registry meta-layer" — DECISION.
3. "Registry names, indexes, coverage-checks every claim" — INVARIANT [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans).
4. "Dead code mechanically detectable via differential regeneration" — INVARIANT [`methodology.audit.differential_regeneration_per_cadence`](#inv-methodology-audit-differential-regeneration-per-cadence).

## Lines 27-53: Decisions table

### Line 31 (Spec form)
1. "Spec form is tests + lint + schemas + analyzers, indexed by registry" — DECISION + SUBSUMED by [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans).
2. "Language-native test files" — INVARIANT [`methodology.language.matches_consumer`](#inv-methodology-language-matches-consumer).

### Line 32 (Decomposition unit)
1. "Decomposition unit is named invariant" — DECISION.
2. "IDs are stable" — INVARIANT [`methodology.invariant.has_id`](#inv-methodology-invariant-has-id).

### Line 33 (Invariant lifecycle)
1. "ADRs declare deltas" — INVARIANT [`methodology.adr.delta_block_required_for_invariant_changes`](#inv-methodology-adr-delta-block-required).
2. "Registry is source of truth" — DECISION.
3. "Sum of deltas = current registry" — INVARIANT [`methodology.adr.delta_reconciles`](#inv-methodology-adr-delta-reconciles).

### Line 34 (Verification taxonomy)
1. "Each invariant names exactly one mechanism" — INVARIANT [`methodology.invariant.has_mechanism`](#inv-methodology-invariant-has-mechanism).
2. "Mechanism enum: 10 declared kinds" — INVARIANT [`methodology.invariant.mechanism_in_taxonomy`](#inv-methodology-invariant-mechanism-in-taxonomy).

### Line 35 (LLM role)
- SUBSUMED by [`methodology.llm.no_recurring_validation`](#inv-methodology-llm-no-recurring-validation).

### Line 36 (Language binding)
- SUBSUMED by [`methodology.language.matches_consumer`](#inv-methodology-language-matches-consumer).

### Line 37 (Constraint scope)
- RATIONALE (philosophy).

### Line 38 (Vocabulary precision)
1. "Hybrid types-as-glossary + glossary file" — DECISION.
2. "CI gate: every term resolves" — INVARIANT [`methodology.glossary.complete`](#inv-methodology-glossary-complete).

### Line 39 (Registry framework approach)
- All RATIONALE / IMPLEMENTATION.

### Line 40 (Per-mechanism tool choices)
- "Per-mechanism tools documented" — INVARIANT [`methodology.mechanism.tool_documented`](#inv-methodology-mechanism-tool-documented).

### Line 41 (Plugin shape)
- DECISION (additive evolution; no dispatch).

### Line 42 (Bootstrap project)
- DEFERRED / RATIONALE.

### Line 44 (Stability tier)
1. "Tier enum {draft, active}" — INVARIANT [`methodology.invariant.tier_in_enum`](#inv-methodology-invariant-tier-in-enum).
2. "Default tier draft" — INVARIANT [`methodology.invariant.tier_default_draft`](#inv-methodology-invariant-tier-default-draft).
3. "Promotion is pure tier-change" — INVARIANT [`methodology.promotion.is_pure_tier_change_adr`](#inv-methodology-promotion-is-pure-tier-change-adr).
4. "Evidence required" — INVARIANT [`methodology.promotion.evidence_advisory`](#inv-methodology-promotion-evidence-advisory).

### Line 45 (Core attribute)
1. "core auto when ≥3 reliances" — INVARIANT [`methodology.invariant.core_computed_correctly`](#inv-methodology-invariant-core-computed-correctly).
2. "Affects removal ceremony" — INVARIANT [`methodology.removal_ceremony.respects_core`](#inv-methodology-removal-ceremony-respects-core).

### Line 46 (Lifecycle status)
1. "Status enum" — INVARIANT [`methodology.invariant.status_in_enum`](#inv-methodology-invariant-status-in-enum).
2. "Withdrawal deletes verifier" — INVARIANT [`methodology.invariant.withdrawal_deletes_verifier`](#inv-methodology-invariant-withdrawal-deletes-verifier).

### Line 47 (Conflict resolution)
- RATIONALE.

### Lines 48-53 (OPEN questions in table)
- All OPEN.

## Lines 55-68: User Flow

### Line 60 (Step 2: ADR authoring)
1. "Master session authors ADRs" — DECISION.
2. "ADR authoring goes through `/plan-feature`" — INVARIANT [`methodology.adr_authoring.uses_plan_feature`](#inv-methodology-adr-authoring-uses-plan-feature).
3. "Author indicates whether ADR introduces invariants" — RATIONALE (process discipline).
4. "Template includes Invariant Delta block when invariants present" — INVARIANT [`methodology.plan_feature.includes_invariant_delta_when_present`](#inv-methodology-plan-feature-includes-delta-when-present).
5. "Template includes Invariant Delta block" — SUBSUMED by [`methodology.adr.delta_block_required_for_invariant_changes`](#inv-methodology-adr-delta-block-required).
6. "Block contains added/modified/removed entries" — INVARIANT [`methodology.adr.delta_block_kinds_in_enum`](#inv-methodology-adr-delta-block-kinds-in-enum).
7. "Each entry has mechanism" — SUBSUMED by [`methodology.invariant.has_mechanism`](#inv-methodology-invariant-has-mechanism).
8. "Each entry has verifier pointer" — SUBSUMED by [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans).

### Line 61 (Step 3: decomposition)
1. "Each invariant named" — SUBSUMED by [`methodology.invariant.has_id`](#inv-methodology-invariant-has-id).
2. "Statement is one line" — INVARIANT [`methodology.invariant.statement_single_line`](#inv-methodology-invariant-statement-single-line).
3. "Tagged with mechanism" — SUBSUMED by [`methodology.invariant.has_mechanism`](#inv-methodology-invariant-has-mechanism).
4. "Inadmissible without mechanism" — SUBSUMED.
5. "Skill blocks finalization without mechanism" — INVARIANT [`methodology.plan_feature.blocks_unmechanism_invariants`](#inv-methodology-plan-feature-blocks-unmechanism).

### Line 62 (Step 4: glossary check)
1. "Glossary check is deterministic script" — INVARIANT [`methodology.glossary_check.is_deterministic_script`](#inv-methodology-glossary-check-deterministic).
2. "Verifies every term resolves" — SUBSUMED by [`methodology.glossary.complete`](#inv-methodology-glossary-complete).
3. "New terms typed/glossaried before finalization" — INVARIANT [`methodology.plan_feature.blocks_unresolved_terms`](#inv-methodology-plan-feature-blocks-unresolved-terms).

### Line 63 (Step 5: LLM compiles invariants)
1. "Subagent does compilation" — INVARIANT [`methodology.invariant_compiler.is_subagent`](#inv-methodology-invariant-compiler-is-subagent).
2. "Reads invariants from ADR delta" — INVARIANT [`methodology.invariant_compiler.input_is_adr_delta`](#inv-methodology-invariant-compiler-input-is-adr-delta).
3. "Generates test files / lint / schemas" — INVARIANT [`methodology.invariant_compiler.outputs_match_mechanism`](#inv-methodology-invariant-compiler-outputs-match-mechanism).
4. "Output staged in PR branch" — INVARIANT [`methodology.invariant_compiler.output_in_pr_branch`](#inv-methodology-invariant-compiler-output-in-pr-branch).
5. "Subagent runs in fresh context" — INVARIANT [`methodology.subagent.fresh_context`](#inv-methodology-subagent-fresh-context).
6. "Output must compile" — INVARIANT [`methodology.invariant_compiler.outputs_compilable_code`](#inv-methodology-invariant-compiler-outputs-compilable).

### Line 64 (Step 6: human reviews)
- RATIONALE.

### Line 65 (Step 7: implementation)
1. "Implementation through /feature-change" — DECISION.
2. "v2 success = verifier suite passes" — INVARIANT [`methodology.feature_change.uses_verifier_suite_for_v2`](#inv-methodology-feature-change-uses-verifier-suite).

### Line 66 (Step 8: CI runs verifier suite)
1. "CI runs verifier suite per commit" — INVARIANT [`methodology.ci.runs_verifier_suite_on_every_commit`](#inv-methodology-ci-runs-verifier-suite).
2. "No model dependency" — SUBSUMED by [`methodology.llm.no_recurring_validation`](#inv-methodology-llm-no-recurring-validation).
3. "Failures localize to invariant ID" — INVARIANT [`methodology.ci.failures_attributed_to_invariant_id`](#inv-methodology-ci-failures-attributed).

### Line 67 (Step 9: differential audit)
1. "Audit runs periodically" — INVARIANT [`methodology.audit.runs_per_cadence`](#inv-methodology-audit-runs-per-cadence).
2. "Audit ritual: rm + regen × N + diff" — SUBSUMED by [`methodology.audit.differential_regeneration_per_cadence`](#inv-methodology-audit-differential-regeneration-per-cadence).
3. "Output is structured Markdown" — INVARIANT [`methodology.audit.outputs_structured_findings`](#inv-methodology-audit-outputs-structured-findings).

### Line 68 (Step 10: LLM audit)
1. "Reads registry + recent ADRs" — INVARIANT [`methodology.audit.input_scope`](#inv-methodology-audit-input-scope).
2. "Output is advisory" — INVARIANT [`methodology.audit.advisory_only`](#inv-methodology-audit-advisory-only).

## Lines 70-129: Component Changes

### Lines 72-78: extended skills
- /plan-feature, /feature-change extensions — SUBSUMED by skill invariants above.
- /setup unchanged — methodology is additive; no mode setup needed.

### Lines 80-85: new skills
- compile-invariants — DECISION + SUBSUMED.
- audit-invariants — DECISION + SUBSUMED.
- check-glossary — INVARIANT [`methodology.glossary_check.is_deterministic_script`](#inv-methodology-glossary-check-deterministic).
- check-registry-coverage — INVARIANT [`methodology.registry_check.is_deterministic_script`](#inv-methodology-registry-check-deterministic).

### Lines 87-97: agents
- invariant-compiler — SUBSUMED by §63 invariants.
- journey-author, mutation-tester — DEFERRED.

### Lines 99-111: docs
- All DECISION / STRUCTURAL.
- spec-verifier-conventions — covered by [`methodology.mechanism.tool_documented`](#inv-methodology-mechanism-tool-documented).

### Lines 113-129: Day-1 invariants list
- Explicit listing of 9 IDs. All extracted earlier.

## Lines 131-210: Data Model

### Lines 133-148: registry entry schema
| Field | Invariant |
|---|---|
| `id` | [`methodology.invariant.has_id`](#inv-methodology-invariant-has-id) |
| `statement` | [`methodology.invariant.statement_atomic`](#inv-methodology-invariant-statement-atomic) + [`methodology.invariant.statement_single_line`](#inv-methodology-invariant-statement-single-line) |
| `mechanism` | [`methodology.invariant.has_mechanism`](#inv-methodology-invariant-has-mechanism) + [`methodology.invariant.mechanism_in_taxonomy`](#inv-methodology-invariant-mechanism-in-taxonomy) |
| `verifier` | [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans) |
| `glossary_terms` | [`methodology.invariant.glossary_terms_field_populated`](#inv-methodology-invariant-glossary-terms-populated) |
| `tier` | [`methodology.invariant.tier_in_enum`](#inv-methodology-invariant-tier-in-enum) |
| `status` | [`methodology.invariant.status_in_enum`](#inv-methodology-invariant-status-in-enum) |
| `introduced_by` | [`methodology.invariant.introduced_by_live_adr`](#inv-methodology-invariant-introduced-by-live-adr) |
| `promoted_by` | [`methodology.invariant.promoted_by_set_iff_active`](#inv-methodology-invariant-promoted-by-iff-active) |
| `superseded_by` | [`methodology.invariant.superseded_by_set_iff_superseded`](#inv-methodology-invariant-superseded-by-iff-superseded) |
| `core` | [`methodology.invariant.core_computed_correctly`](#inv-methodology-invariant-core-computed-correctly) |
| `relied_on_by` | [`methodology.invariant.relied_on_by_matches_graph`](#inv-methodology-invariant-relied-on-by-matches-graph) |

### Line 150: orthogonality of axes — RATIONALE.

### Lines 154-159: glossary entry schema
| Field | Invariant |
|---|---|
| `term` | [`methodology.glossary.term_unique`](#inv-methodology-glossary-term-unique) |
| `resolves_to` | [`methodology.glossary.resolves_to_valid_target`](#inv-methodology-glossary-resolves-to-valid) |
| `scope` | [`methodology.glossary.scope_in_enum`](#inv-methodology-glossary-scope-in-enum) |

### Lines 163-195: ADR Invariant Delta block schema
- Block exists requirement — [`methodology.adr.delta_block_required_for_invariant_changes`](#inv-methodology-adr-delta-block-required).
- 7 sub-block kinds — [`methodology.adr.delta_block_kinds_in_enum`](#inv-methodology-adr-delta-block-kinds-in-enum).
- Per sub-block:
  - Added — [`methodology.adr.added_block_complete`](#inv-methodology-added-block-complete).
  - Modified — covered later (§295-305).
  - Promoted — [`methodology.promotion.is_pure_tier_change_adr`](#inv-methodology-promotion-is-pure-tier-change-adr).
  - Deprecated — [`methodology.deprecated_block_includes_reason_and_target`](#inv-methodology-deprecated-block-includes-reason).
  - Superseded — [`methodology.superseded_block_maps_old_to_new`](#inv-methodology-superseded-block-maps-old-new).
  - Withdrawn — [`methodology.invariant.withdrawal_deletes_verifier`](#inv-methodology-invariant-withdrawal-deletes-verifier).
  - Relies On — [`methodology.invariant.relied_on_by_matches_graph`](#inv-methodology-invariant-relied-on-by-matches-graph).

### Line 195: registry == sum of deltas — [`methodology.adr.delta_reconciles`](#inv-methodology-adr-delta-reconciles).

### Lines 197-210: components.yaml schema
- (Mode flag invariants removed — methodology is additive, no per-component dispatch.)

## Lines 212-226: Self-Application

### Line 214
1. "Self-applicable" — RATIONALE.
2. "Same machinery for methodology and consumers" — INVARIANT [`methodology.self_application.same_machinery`](#inv-methodology-self-application-same-machinery).

### Lines 216-220: Bootstrap order — DEFERRED.

### Lines 222-226: Recursion bottom-out — RATIONALE.

## Lines 228-714: Methodology Governance

### Lines 234-241: Stability tier
- Tier table covered by §44 invariants.
- Higher-tier introduction — INVARIANT [`methodology.invariant.higher_tier_introduction_requires_justification`](#inv-methodology-invariant-higher-tier-justification).

### Lines 243-255: Core attribute — covered by §45.

### Lines 257-271: Promotion criteria — covered by §44.

### Lines 273-281: Demotion path — covered by §45/§46. Plus deprecation period:
- INVARIANT [`methodology.deprecation.period_per_tier`](#inv-methodology-deprecation-period-per-tier).

### Lines 283-291: Operational effect of tier — RATIONALE.

### Lines 295-303: Modification 3-class table
- Class A/B/C definitions — DECISION.
- "Class C must be Supersession" — INVARIANT [`methodology.modification.class_c_via_supersession`](#inv-methodology-modification-class-c-via-supersession).

### Lines 307-315: Class A runbook
- "Modified delta has rationale field" — INVARIANT [`methodology.modified.has_rationale_field`](#inv-methodology-modified-has-rationale).

### Lines 317-327: Class B runbook
- "Verifier re-compiled for Class B" — INVARIANT [`methodology.modified.verifier_recompiled_for_class_b`](#inv-methodology-modified-verifier-recompiled).
- "Roundtrip CI gate after Class B" — INVARIANT [`methodology.modified.roundtrip_after_class_b`](#inv-methodology-modified-roundtrip-after-class-b).

### Lines 329-335: Class C runbook — SUBSUMED.

### Lines 337-341: CI gates listed
- "Modified classification advisory" — INVARIANT [`methodology.modified.classification_advisory`](#inv-methodology-modified-classification-advisory).

### Lines 343-348: core stricter rules — covered by [`methodology.deprecation.period_per_tier`](#inv-methodology-deprecation-period-per-tier) and [`methodology.removal_ceremony.respects_core`](#inv-methodology-removal-ceremony-respects-core).

### Line 352 (reaction required)
- INVARIANT [`methodology.reaction.required_for_class_b_supersession_withdrawal`](#inv-methodology-reaction-required).

### Line 356 (artifact generation on PR open)
- INVARIANT [`methodology.reaction.artifact_generated_on_pr_open`](#inv-methodology-reaction-artifact-on-pr-open).
- INVARIANT [`methodology.reaction.one_artifact_per_relying_adr`](#inv-methodology-reaction-one-per-relying).

### Lines 358-371: artifact YAML schema
- INVARIANT [`methodology.reaction.artifact_yaml_schema`](#inv-methodology-reaction-artifact-schema).

### Line 373 (artifacts in PR branch)
- INVARIANT [`methodology.reaction.artifacts_in_pr_branch`](#inv-methodology-reaction-artifacts-pr-branch).

### Lines 377-379 (owner identification)
- INVARIANT [`methodology.reaction.owner_resolution`](#inv-methodology-reaction-owner-resolution).

### Lines 383-389 (5 ack options)
- INVARIANT [`methodology.reaction.ack_in_enum`](#inv-methodology-reaction-ack-in-enum).
- Per-row effects:
  - re-pin — [`methodology.reaction.repin_preserves_or_migrates_edge`](#inv-methodology-reaction-repin).
  - update — [`methodology.reaction.update_blocks_until_followup`](#inv-methodology-reaction-update).
  - migrate — [`methodology.reaction.migrate_records_successor`](#inv-methodology-reaction-migrate-records).
  - accept-unpinning — [`methodology.reaction.unpinning_marks_adr`](#inv-methodology-reaction-unpinning).
  - object — [`methodology.reaction.objection_blocks_merge`](#inv-methodology-reaction-objection).

### Lines 393-398 (state machine)
- INVARIANT [`methodology.reaction.state_machine_valid`](#inv-methodology-reaction-state-machine).

### Lines 402-406 (expiration disposition)
- INVARIANT [`methodology.reaction.expiration_disposition_per_tier`](#inv-methodology-reaction-expiration-per-tier).

### Lines 410-414 (merge gating)
- INVARIANT [`methodology.reaction.merge_blocked_until_acked`](#inv-methodology-reaction-merge-gate).

### Lines 418-420 (3 CI gates) — all SUBSUMED.

### Lines 429-437 (triage inputs)
- INVARIANT [`methodology.triage.input_scope`](#inv-methodology-triage-input-scope).

### Lines 441-452 (llm_suggestion schema)
- INVARIANT [`methodology.triage.suggestion_schema`](#inv-methodology-triage-suggestion-schema).
- INVARIANT [`methodology.triage.human_decision_initially_null`](#inv-methodology-triage-human-decision-null).

### Lines 456-462 (auto-ack policy)
- INVARIANT [`methodology.triage.auto_ack_per_tier_policy`](#inv-methodology-triage-auto-ack-policy).

### Lines 468-471 (4 boundaries)
- INVARIANT [`methodology.triage.never_auto_objects`](#inv-methodology-triage-no-auto-object).
- INVARIANT [`methodology.triage.never_auto_merges_followups`](#inv-methodology-triage-no-auto-merge).
- INVARIANT [`methodology.triage.respects_human_decision`](#inv-methodology-triage-respects-human).

### Lines 475-477 (triage advisory)
- INVARIANT [`methodology.triage.advisory_only`](#inv-methodology-triage-advisory-only).

### Lines 479-481: principle preservation — RATIONALE.

### Line 485 (CI always on)
- INVARIANT [`methodology.reaction.ci_always_on_with_registry`](#inv-methodology-reaction-ci-always-on).

### Lines 489-498 (8-step CI flow)
- "Artifacts persist in main" — INVARIANT [`methodology.reaction.artifacts_persist_in_main`](#inv-methodology-reaction-artifacts-persist).

### Line 502 (every action is slash command)
- INVARIANT [`methodology.reaction.cli_action_parity`](#inv-methodology-reaction-cli-action-parity).
- INVARIANT [`methodology.reaction.cli_writes_artifact_directly`](#inv-methodology-reaction-cli-writes-direct).

### Lines 504-512 (command table)
- /list-reactions — [`methodology.cli.list_reactions.shape`](#inv-methodology-cli-list-reactions).
- /show-reaction — [`methodology.cli.show_reaction.complete`](#inv-methodology-cli-show-reaction).
- /ack-reaction — [`methodology.cli.ack_reaction.idempotent`](#inv-methodology-cli-ack-reaction).
- /ack-batch — [`methodology.cli.ack_batch.respects_filters`](#inv-methodology-cli-ack-batch).
- /draft-followup — [`methodology.cli.draft_followup.outputs_valid_adr`](#inv-methodology-cli-draft-followup).
- /object-reaction — SUBSUMED.
- /migrate-reaction — [`methodology.reaction.migrate_records_successor`](#inv-methodology-reaction-migrate-records).

### Line 518 (local-CI parity)
- INVARIANT [`methodology.local_ci.same_code`](#inv-methodology-local-ci-same-code).
- INVARIANT [`methodology.local_ci.idempotent`](#inv-methodology-local-ci-idempotent).

### Lines 530-534: 5 node types
- INVARIANT [`methodology.lineage.node_types_in_enum`](#inv-methodology-lineage-node-types).

### Lines 538-549: 10 edge types
- INVARIANT [`methodology.lineage.edge_types_in_enum`](#inv-methodology-lineage-edge-types).
- INVARIANT [`methodology.lineage.edge_sources_consistent`](#inv-methodology-lineage-edge-sources).

### Lines 553-558: explicit Relies On only
- INVARIANT [`methodology.reliance.inline_mentions_advisory`](#inv-methodology-reliance-inline-advisory).

### Lines 562-575: relied_on_count formula — covered by anti-gaming rules.

### Lines 577-583 (3 anti-gaming rules)
- INVARIANT [`methodology.reliance.live_adrs_only`](#inv-methodology-reliance-live-only).
- INVARIANT [`methodology.reliance.no_meta_double_count`](#inv-methodology-reliance-no-meta-double-count).
- INVARIANT [`methodology.reliance.set_cardinality`](#inv-methodology-reliance-set-cardinality).

### Lines 587-594 (6 MCP tools)
- [`methodology.mcp.list_invariants_complete`](#inv-methodology-mcp-list).
- [`methodology.mcp.search_invariants_supports_dimensions`](#inv-methodology-mcp-search).
- [`methodology.mcp.get_invariant_returns_computed_fields`](#inv-methodology-mcp-get).
- [`methodology.mcp.get_invariant_lineage_complete`](#inv-methodology-mcp-lineage).
- [`methodology.mcp.get_adr_invariants_extends_lineage`](#inv-methodology-mcp-adr-invariants).
- [`methodology.mcp.get_verifier_invariants_reverse`](#inv-methodology-mcp-verifier-invariants).

### Lines 598-609 (dashboard read views)
- INVARIANT [`methodology.dashboard.declared_views_present`](#inv-methodology-dashboard-views).

### Lines 613-624 (dashboard write parity)
- INVARIANT [`methodology.dashboard.cli_parity`](#inv-methodology-dashboard-cli-parity).
- INVARIANT [`methodology.dashboard.same_artifact_format`](#inv-methodology-dashboard-same-format).

### Lines 632-635 (dashboard local mode)
- INVARIANT [`methodology.dashboard.local_mode_uses_local_git`](#inv-methodology-dashboard-local-mode).

### Lines 639-643: hosted mode — DEFERRED.

### Lines 647-656 (human_decision schema)
- INVARIANT [`methodology.reaction.author_attribution_recorded`](#inv-methodology-reaction-attribution).
- INVARIANT [`methodology.reaction.venue_in_enum`](#inv-methodology-reaction-venue-enum).

### Lines 662-664: failure modes — IMPLEMENTATION.

### Lines 668-674: dashboard infrastructure — RATIONALE.

### Lines 676-685: lifecycle status table — SUBSUMED.

### Lines 687-714 (conflict resolution)
- Authority hierarchy / table — RATIONALE.
- "Roundtrip drift detection" — INVARIANT [`methodology.audit.roundtrip_runs_per_audit_cycle`](#inv-methodology-audit-roundtrip).
- Differential regen — SUBSUMED.
- Mutation testing — DEFERRED.
- Coverage-of-statement audit — SUBSUMED.

## Lines 716-722: Error Handling

- Verifier compilation failure — RATIONALE.
- Differential regen incorrect — RATIONALE.
- Registry drift — SUBSUMED by [`methodology.registry.no_orphans`](#inv-methodology-registry-no-orphans).
- Glossary failure — SUBSUMED by [`methodology.plan_feature.blocks_unresolved_terms`](#inv-methodology-plan-feature-blocks-unresolved-terms).

## Lines 724-731: Security

- Consumer-side capabilities — RATIONALE.
- Subagent fresh context — SUBSUMED by [`methodology.subagent.fresh_context`](#inv-methodology-subagent-fresh-context).

## Lines 733-826: Impact / Scope / Open / Tests / Implementation

- Impact: STRUCTURAL / DECISION (file enumeration).
- Scope: covered or DEFERRED.
- Open Questions: all OPEN.
- Integration Test Cases: verifier code for already-extracted invariants.
- Implementation Plan: STRUCTURAL / DEFERRED.

---

# Final tally

**Total atomic invariants identified: ~108-113** after de-duplication and consolidation, and after dropping the mode-flag/coexistence-dispatch invariants per the additive-methodology simplification.

The Master List above contains every invariant. Click any link in the walkthrough to jump to its definition.

## Phased registration

| Phase | Tools required | Cumulative invariants |
|---|---|---|
| Phase 1 | registry parser + glossary parser + ADR delta parser + 3 deterministic CI scripts | ~28 (schema/lifecycle/glossary) |
| Phase 2 | invariant-compiler subagent + extended /plan-feature + /feature-change | ~42 |
| Phase 3 | /audit-invariants + /check-glossary + /check-registry-coverage + modification CI gates | ~58 |
| Phase 4 | reaction artifact generator + merge gate + 7 reaction slash commands + triage assistant | ~88 |
| Phase 5 | docs-mcp invariant index + 6 MCP tools + 8 dashboard read views + 8 dashboard write actions | ~110 |
| Phase 6 | Hosted-mode dashboard + cleanup | ~113 |

The original "9 Day-1 invariants" framing in ADR-0075 was a bootstrap minimum, not the full registry. The realistic Phase-1 set is ~28 invariants (schema/lifecycle/glossary — provable on Day 1 with only the registry/glossary parsers in place). The full methodology registry at completion is ~108-113.

### What changed in this revision

The mode-flag/coexistence-dispatch invariants were dropped (7 invariants) per the simplification: the methodology is additive, not a parallel mode. ADRs include Invariant Delta blocks when they have invariants to declare; ADRs without them just work as before. No per-component opt-in flag, no `components.yaml`, no dispatch logic. Two skill invariants were renamed to drop the "v2"-specific framing.
