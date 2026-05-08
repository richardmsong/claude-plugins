# Analysis: Invariant Extraction from ADR-0075 (under its own methodology)

**Source**: `src/sdd/docs/adr-0075-invariant-driven-development.md`
**Method**: apply ADR-0075's own rules — verifier-required at draft time, Pattern B (each field is its own invariant), independence rule, `requires`-only DAG, no composites, no aggregates — and produce the actual Invariant Delta block this ADR would commit.
**Result**: ADR-0075 introduces ~22 invariants directly. The remaining ~80+ prose claims from earlier analyses don't ship in this ADR because their verifiers depend on tooling that doesn't exist yet; they enter the registry in subsequent ADRs alongside their tools.

---

## Rules applied

1. **Pattern B (fine granularity)**: each named field in a schema's contract surface is its own atomic invariant. A field exists in the schema only because some invariant's verifier depends on it being present and valid; no field exists "for vibes."
2. **Verifier-required**: an invariant is admissible only if its verifier code can be authored alongside this ADR. If the verifier requires not-yet-existing tooling, the invariant defers.
3. **Independence rule**: registered invariants are pairwise logically independent. No "schema as a whole" aggregate, because that would imply each field invariant. Each field invariant stands alone.
4. **DAG via `requires` only**: edges encode operational dependency. No `composed_of`, no `implies`, no composites.
5. **Definition vs Comments**: each invariant has a one-line `Definition` (contract) and free-form `Comments` (advisory annotations).

---

## What ships in this ADR

For an invariant to ship in ADR-0075, its verifier must be authorable today using just `go test`, `go/ast`, `go/parser`, `os` (filesystem), and a registry/glossary/ADR-block parser written as part of this ADR's commit. No LLMs, skills, subagents, dashboards, or audit machinery.

Day-1 invariants are scoped to fields actually used by the cross-cutting verifiers. Fields like `comments`, `relied_on_by`, `core`, `promoted_by`, etc. exist in the registry shape but aren't used by Day-1 verifiers, so their invariants defer until the consuming tool ships (audit, reaction process, etc.).

---

## Registry entry field invariants (Day 1)

Each field used by a Day-1 verifier gets its own invariant.

```
- methodology.registry.id_field
  Definition: Every registry entry has an `id` field that is a unique non-empty string matching the dotted-path regex.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_id_test.go::TestIDField
  Tier: draft
  Requires: []

- methodology.registry.definition_field
  Definition: Every registry entry has a `definition` field that is a non-empty single-line string.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_definition_test.go::TestDefinitionField
  Tier: draft
  Requires: []

- methodology.registry.mechanism_field
  Definition: Every registry entry has a `mechanism` field whose value is in the closed taxonomy {unit, table, property, arch, ast, type, schema, completeness, integration, journey}.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_mechanism_test.go::TestMechanismField
  Tier: draft
  Requires: []

- methodology.registry.verifier_field
  Definition: Every registry entry has a `verifier` field that is a non-empty string in the form `path` or `path::FuncName`.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_verifier_field_test.go::TestVerifierField
  Tier: draft
  Requires: []

- methodology.registry.tier_field
  Definition: Every registry entry has a `tier` field whose value is in {draft, active}.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_tier_test.go::TestTierField
  Tier: draft
  Requires: []

- methodology.registry.status_field
  Definition: Every registry entry has a `status` field whose value is in {active, deprecated, superseded, withdrawn}.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_status_test.go::TestStatusField
  Tier: draft
  Requires: []

- methodology.registry.introduced_by_field
  Definition: Every registry entry has an `introduced_by` field referencing an existing ADR file.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_introduced_by_test.go::TestIntroducedByField
  Tier: draft
  Requires: []

- methodology.registry.superseded_by_consistency
  Definition: A registry entry's `superseded_by` field is set if and only if its `status` is `superseded`; if set, it points to a live registry entry.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_superseded_by_test.go::TestSupersededByConsistency
  Tier: draft
  Requires: [methodology.registry.status_field]

- methodology.registry.glossary_terms_field
  Definition: Every registry entry has a `glossary_terms` field that is a (possibly empty) list of strings.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_glossary_terms_test.go::TestGlossaryTermsField
  Tier: draft
  Requires: []
```

9 field invariants. Each is logically independent (one field's validity doesn't imply another's). Fields like `comments`, `core`, `relied_on_by`, `promoted_by`, `requires` aren't checked Day 1 because no Day-1 verifier reads them.

---

## Glossary entry field invariants (Day 1)

```
- methodology.glossary.term_field
  Definition: Every glossary entry has a non-empty `term` field, unique across all entries.
  Mechanism: schema
  Verifier: src/sdd/spec/glossary_term_test.go::TestTermField
  Tier: draft
  Requires: []

- methodology.glossary.definition_field
  Definition: Every glossary entry has a non-empty `definition` field.
  Mechanism: schema
  Verifier: src/sdd/spec/glossary_definition_test.go::TestDefinitionField
  Tier: draft
  Requires: []

- methodology.glossary.resolves_to_field
  Definition: Every glossary entry has a `resolves_to` field that names a real type/method, an existing registry entry ID, or another glossary term.
  Mechanism: schema
  Verifier: src/sdd/spec/glossary_resolves_to_test.go::TestResolvesToField
  Tier: draft
  Requires: [methodology.glossary.term_field]

- methodology.glossary.scope_field
  Definition: Every glossary entry has a `scope` field whose value is in {methodology, project-cross-cutting, component-local}.
  Mechanism: schema
  Verifier: src/sdd/spec/glossary_scope_test.go::TestScopeField
  Tier: draft
  Requires: []
```

4 field invariants for glossary entries.

---

## ADR delta block sub-block invariants (Day 1)

The `## Invariant Delta` block has seven declared sub-section kinds. Each sub-section's well-formedness is its own invariant — the kinds aren't aggregated. `Relies On` defers to the reactions ADR since it's not used by Day-1 verifiers.

```
- methodology.adr_delta.added_block
  Definition: Each `### Added` entry parses to (id, definition, mechanism, verifier, tier, requires) with valid values per Day-1 field invariants.
  Mechanism: ast
  Verifier: src/sdd/spec/adr_delta_added_test.go::TestAddedBlock
  Tier: draft
  Requires: []

- methodology.adr_delta.modified_block
  Definition: Each `### Modified` entry parses to (id, rationale_class) with rationale_class in {mechanical, sharpening}.
  Mechanism: ast
  Verifier: src/sdd/spec/adr_delta_modified_test.go::TestModifiedBlock
  Tier: draft
  Requires: []

- methodology.adr_delta.promoted_block
  Definition: Each `### Promoted` entry parses to (id, from_tier, to_tier) with both tier values valid.
  Mechanism: ast
  Verifier: src/sdd/spec/adr_delta_promoted_test.go::TestPromotedBlock
  Tier: draft
  Requires: []

- methodology.adr_delta.deprecated_block
  Definition: Each `### Deprecated` entry parses to (id, reason, expected_withdrawal).
  Mechanism: ast
  Verifier: src/sdd/spec/adr_delta_deprecated_test.go::TestDeprecatedBlock
  Tier: draft
  Requires: []

- methodology.adr_delta.superseded_block
  Definition: Each `### Superseded` entry parses to (old_id, new_id, rationale).
  Mechanism: ast
  Verifier: src/sdd/spec/adr_delta_superseded_test.go::TestSupersededBlock
  Tier: draft
  Requires: []

- methodology.adr_delta.withdrawn_block
  Definition: Each `### Withdrawn` entry parses to (id, reason).
  Mechanism: ast
  Verifier: src/sdd/spec/adr_delta_withdrawn_test.go::TestWithdrawnBlock
  Tier: draft
  Requires: []
```

6 sub-block invariants. (Relies On block deferred — it's used only by reaction-process verifiers.)

---

## Cross-cutting invariants (Day 1)

Claims that aren't field-level or sub-block-level but operate over the registry/ADR set as a whole.

```
- methodology.registry.no_orphans
  Definition: Every active or deprecated registry entry's `verifier` reference resolves to an existing file (and existing test function for Go test refs); every declared verifier reference is named by at most one registry entry.
  Mechanism: completeness
  Verifier: src/sdd/spec/registry_no_orphans_test.go::TestNoOrphans
  Tier: draft
  Requires: [methodology.registry.id_field, methodology.registry.verifier_field, methodology.registry.status_field]

- methodology.adr.delta_reconciles
  Definition: The current registry contents equal the integral of (Added − Withdrawn) deltas across all live ADRs, with status/tier transitions matching Promoted/Deprecated/Superseded entries.
  Mechanism: completeness
  Verifier: src/sdd/spec/delta_reconciles_test.go::TestReconciles
  Tier: draft
  Requires: [methodology.registry.id_field, methodology.registry.status_field, methodology.registry.introduced_by_field, methodology.registry.superseded_by_consistency, methodology.adr_delta.added_block, methodology.adr_delta.withdrawn_block, methodology.adr_delta.promoted_block, methodology.adr_delta.deprecated_block, methodology.adr_delta.superseded_block, methodology.adr_delta.modified_block]

- methodology.glossary.complete
  Definition: Every term listed in `glossary_terms` of any active or deprecated registry entry resolves to a typed binding or a glossary entry.
  Mechanism: schema
  Verifier: src/sdd/spec/glossary_complete_test.go::TestComplete
  Tier: draft
  Requires: [methodology.registry.glossary_terms_field, methodology.registry.status_field, methodology.glossary.term_field, methodology.glossary.resolves_to_field]
```

3 cross-cutting invariants.

---

## Final tally

**ADR-0075 directly introduces 22 invariants:**

| Category | Count | DAG layer |
|---|---|---|
| Registry entry fields | 9 | mostly roots; one Layer-1 (superseded_by depends on status) |
| Glossary entry fields | 4 | mostly roots; one Layer-1 (resolves_to depends on term) |
| ADR delta block sub-blocks | 6 | all roots |
| Cross-cutting | 3 | Layer 1+ (require many field invariants) |

**Why 22 and not 6:** my previous analysis collapsed the per-field invariants into single `*.well_formed` aggregates, which would imply each field invariant — violating the independence rule (and contradicting Pattern B). Under Pattern B + independence + verifier-required, each field is its own invariant (with its own one-line contract and its own verifier function), and there's no aggregate.

**Why 22 and not 100+:** the Day-1 set is bounded by what verifiers can author *now*. Fields not consumed by Day-1 verifiers (`comments`, `core`, `relied_on_by`, `promoted_by`, `requires`) don't ship as invariants because nothing depends on them yet. They enter the registry when the consuming tool ships (audit, reactions, dashboard, etc.).

---

## What this ADR does NOT introduce as invariants

The remaining ~80+ prose claims from earlier analyses are deferred to subsequent ADRs that introduce their tooling. Each of those ADRs ships its tool's code AND the verifiers for the corresponding invariants in the same commit.

| Category | Sample invariants | Ships in (future) | Reason deferred |
|---|---|---|---|
| Audit | `methodology.audit.advisory_only`, `methodology.audit.runs_per_cadence`, etc. | ADR introducing `/audit-invariants` skill | Verifier requires the skill to invoke and observe |
| Reaction process | `methodology.reaction.artifact_generated_on_pr_open`, all CLI command shapes | ADR introducing reaction CI hook + slash commands | Verifier requires the reaction generator + merge gate |
| Triage assistant | `methodology.triage.never_auto_objects`, etc. | ADR introducing triage subagent | Verifier requires subagent + harness |
| Subagents | `methodology.subagent.fresh_context`, `methodology.invariant_compiler.*` | ADR introducing subagent test harness | Verifier requires the harness to capture context |
| Dashboard | `methodology.dashboard.declared_views_present`, `methodology.dashboard.cli_parity` | ADR introducing dashboard extensions | Verifier requires dashboard to exist |
| MCP tools | `methodology.mcp.list_invariants_complete`, etc. | ADR introducing docs-mcp invariant indexing | Verifier requires MCP server to expose tools |
| Modification policy | `methodology.modification.class_c_via_supersession`, etc. | ADR introducing the modification advisory | Verifier requires the advisory infrastructure |
| Plan-feature behavior | `methodology.plan_feature.blocks_unmechanism_invariants`, etc. | ADR extending /plan-feature | Verifier requires extended skill |
| Feature-change behavior | `methodology.feature_change.uses_verifier_suite_when_invariants_present` | ADR extending /feature-change | Verifier requires extended skill |
| Reaction artifact field invariants (per-field) | `methodology.reaction.ack_field`, `methodology.reaction.deadline_field`, etc. | ADR introducing reaction artifact schema | Verifier requires reaction artifacts to exist |
| Relies On block (sub-block of ADR delta) | `methodology.adr_delta.relies_on_block` | ADR introducing reactions | Day-1 reconciler doesn't need it |

---

## DAG of Day-1 invariants

```
Roots (no requires):
  registry: id_field, definition_field, mechanism_field, verifier_field,
            tier_field, status_field, introduced_by_field, glossary_terms_field
  glossary: term_field, definition_field, scope_field
  adr_delta: added_block, modified_block, promoted_block,
             deprecated_block, superseded_block, withdrawn_block

Layer 1:
  registry.superseded_by_consistency      → status_field
  glossary.resolves_to_field              → term_field

Layer 2 (cross-cutting):
  registry.no_orphans                     → id_field, verifier_field, status_field
  glossary.complete                       → glossary_terms_field, status_field,
                                            term_field, resolves_to_field
  adr.delta_reconciles                    → id_field, status_field, introduced_by_field,
                                            superseded_by_consistency, all 6 adr_delta sub-blocks
```

22 invariants, acyclic DAG. The cross-cutting invariants have wide `requires` fan-in — they're the leaves of the DAG (deepest layer), pulling in many roots.

---

## Why this count is honest

- **Verifier-required filters speculation.** Only 22 of the previous ~108 prose claims have authorable verifiers today.
- **Pattern B respects the user's discipline-forcing intent.** Each field is its own contract; AI-generated bloat-fields would have to justify themselves.
- **Independence rule prevents aggregation smells.** No "schema well-formed" invariant; each field stands on its own.
- **DAG-shaped registration is paid-as-you-go.** Future invariants enter as their tooling lands; the registry grows from 22 to 50-80 over the methodology's full implementation arc.

This is the count under the methodology's own rules, applied honestly. Not the 6 from my earlier mistake (which sneaked aggregates back in), not the 108 from prose-decomposition without verifier-required.
