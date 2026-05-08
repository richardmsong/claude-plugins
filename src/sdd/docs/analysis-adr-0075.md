# Analysis: Invariant Extraction from ADR-0075 (under its own methodology)

**Source**: `src/sdd/docs/adr-0075-invariant-driven-development.md`
**Method**: apply ADR-0075's own rules — verifier-required at draft time, independence rule, lazy decomposition by independent governance, `requires`-only DAG, no composites — and produce the actual Invariant Delta block this ADR would commit.
**Result**: ADR-0075 introduces **6 invariants** directly. Most of the prose-level claims it makes about future tooling cannot become invariants in this ADR because their verifiers can't be authored yet — those invariants ship in subsequent ADRs alongside their tools.

---

## Rules applied

The analysis is constrained by the ADR's own rules:

1. **Verifier-required**: an invariant is admissible only if its verifier code can be authored and committed alongside this ADR. If the verifier requires not-yet-existing tooling, the invariant doesn't ship now.
2. **Independence**: registered invariants are pairwise logically independent. If A's truth implies B's truth, B is not separately registered.
3. **Lazy decomposition**: aspects become independent invariants only when an ADR proposes evolving them independently. Day-1 invariants stay coarse; granularity grows from real evolution history.
4. **DAG via `requires` only**: edges between invariants are operational dependency (`requires`) and temporal replacement (`supersedes`). No `composed_of`, no `implies`, no composites.
5. **Definition vs Comments**: each invariant has a one-line `Definition` (contract) and free-form `Comments` (advisory annotations).

---

## Tooling that exists / can be authored alongside this ADR

For an invariant to ship in ADR-0075, its verifier must be authorable. That requires:

- A registry parser (Go: load `internal/spec/invariants.go` → `[]Invariant`).
- A glossary parser (Go: load `internal/spec/glossary.go` → `[]GlossaryEntry`).
- An ADR markdown parser that can extract the `## Invariant Delta` block and its sub-sections.
- File-system access (for verifier-path existence checks).
- Go AST parsing (for "test function exists in file" checks).

These are all `go test` + standard library + `go/ast` + `go/parser`. No external tooling, no LLMs, no skills, no subagents, no dashboard. They can be authored as part of this ADR's commit.

What CANNOT be authored yet:
- `/audit-invariants` skill — the differential regeneration ritual.
- `invariant-compiler` subagent — verifier code generation.
- Reaction artifact generator (CI hook).
- Triage assistant.
- Dashboard extensions.
- docs-mcp invariant indexing.
- All slash commands for reaction resolution.

Therefore invariants whose verifiers depend on the above are NOT in this ADR's delta block. They ship in subsequent ADRs alongside their tools.

---

## Invariant Delta block this ADR would commit

```markdown
## Invariant Delta

### Added

- methodology.registry_entry.well_formed
  Definition: Every registry entry has required fields (id, definition, mechanism, verifier, tier, status, introduced_by) with valid types and values; conditional fields (promoted_by, superseded_by) consistent with status/tier.
  Mechanism: schema
  Verifier: src/sdd/spec/registry_entry_test.go::TestWellFormed
  Tier: draft
  Requires: []
  Comments: |
    Includes ID format check (regex), enum validation (mechanism, tier, status),
    cross-field consistency (promoted_by ⇔ tier=active; superseded_by ⇔ status=superseded).
    All field-level checks are sub-assertions of one verifier — not separate invariants
    per the lazy-decomposition rule. Splits into per-field invariants only when an ADR
    forces independent governance.

- methodology.glossary_entry.well_formed
  Definition: Every glossary entry has required fields (term, definition, resolves_to, scope) with valid values.
  Mechanism: schema
  Verifier: src/sdd/spec/glossary_entry_test.go::TestWellFormed
  Tier: draft
  Requires: []
  Comments: |
    scope ∈ {methodology, project-cross-cutting, component-local}.
    resolves_to validation deferred to glossary.complete (which has cross-references).

- methodology.adr_delta_block.well_formed
  Definition: Any "## Invariant Delta" section in an ADR parses into the seven declared sub-block kinds (Added, Modified, Promoted, Deprecated, Superseded, Withdrawn, Relies On) with valid contents per kind.
  Mechanism: ast
  Verifier: src/sdd/spec/adr_delta_test.go::TestBlockWellFormed
  Tier: draft
  Requires: []
  Comments: |
    Verifier reads docs/adr-*.md, locates the section header, parses sub-sections.
    Doesn't check semantic consistency across ADRs — that's adr.delta_reconciles.
    Tolerates ADRs without the section (only validates if present).

- methodology.registry.no_orphans
  Definition: Every active or deprecated registry entry's verifier reference resolves to an existing file (and existing test function for Go test refs); every declared verifier reference is named by at most one registry entry.
  Mechanism: completeness
  Verifier: src/sdd/spec/registry_no_orphans_test.go::TestNoOrphans
  Tier: draft
  Requires: [methodology.registry_entry.well_formed]
  Comments: |
    Two assertions in one function: forward (every entry has live verifier) and
    reverse uniqueness (no two entries share a verifier ref). Could split into
    two invariants if independent governance emerges (e.g., "we want to allow
    shared verifiers" would split the reverse direction off).

- methodology.adr.delta_reconciles
  Definition: The current registry contents equals the sum of (Added − Withdrawn) deltas across all live ADRs, with status/tier transitions matching Promoted/Deprecated/Superseded entries.
  Mechanism: completeness
  Verifier: src/sdd/spec/delta_reconciles_test.go::TestReconciles
  Tier: draft
  Requires: [methodology.registry_entry.well_formed, methodology.adr_delta_block.well_formed]
  Comments: |
    Reads all docs/adr-*.md, parses delta blocks, computes the integral.
    Compares against the live registry. Mismatches = drift between ADR
    history and registry state.

- methodology.glossary.complete
  Definition: Every term listed in glossary_terms of any active or deprecated registry entry resolves to a typed binding or a glossary entry.
  Mechanism: schema
  Verifier: src/sdd/spec/glossary_complete_test.go::TestComplete
  Tier: draft
  Requires: [methodology.registry_entry.well_formed, methodology.glossary_entry.well_formed]
  Comments: |
    Operates on declared glossary_terms field, not on NLP-extracted terms from
    the definition string. Authors are responsible for populating glossary_terms
    correctly; this verifier checks resolution, not enumeration.

### Modified
(none — first registration)

### Promoted
(none — all introduced as draft)

### Deprecated
(none)

### Superseded
(none)

### Withdrawn
(none)

### Relies On
(none — this ADR is the methodology's introduction; nothing pre-exists for it to rely on)
```

---

## What this ADR does NOT introduce as invariants

The previous analyses extracted ~108 "potential invariants" from prose. Under the methodology's own rules, most of these fail the verifier-required test. They're future invariants, not this-ADR invariants.

**Categories deferred to subsequent ADRs:**

| Category | Sample invariants | Ships in (future) | Reason deferred |
|---|---|---|---|
| Audit | `methodology.audit.advisory_only`, `methodology.audit.differential_regeneration_per_cadence`, `methodology.audit.runs_per_cadence`, etc. | ADR introducing `/audit-invariants` skill | Verifier requires the audit skill to invoke and observe |
| Reaction process | `methodology.reaction.artifact_generated_on_pr_open`, `methodology.reaction.merge_blocked_until_acked`, all CLI command shapes, etc. | ADR introducing reaction CI hook + slash commands | Verifier requires the reaction generator + merge gate to exist |
| Triage assistant | `methodology.triage.never_auto_objects`, `methodology.triage.suggestion_schema`, etc. | ADR introducing triage subagent | Verifier requires the triage subagent + harness |
| Subagents | `methodology.subagent.fresh_context`, `methodology.invariant_compiler.outputs_match_mechanism`, etc. | ADR introducing subagent test harness | Verifier requires the harness to capture context |
| Dashboard | `methodology.dashboard.declared_views_present`, `methodology.dashboard.cli_parity`, etc. | ADR introducing dashboard extensions | Verifier requires dashboard to exist with the views/actions |
| MCP tools | `methodology.mcp.list_invariants_complete`, etc. | ADR introducing docs-mcp invariant indexing | Verifier requires the MCP server to expose the tools |
| Modification policy enforcement | `methodology.modification.class_c_via_supersession`, `methodology.modified.classification_advisory`, etc. | ADR introducing the modification advisory | Verifier requires the advisory infrastructure |
| Plan-feature behavior | `methodology.plan_feature.blocks_unmechanism_invariants`, etc. | ADR extending /plan-feature | Verifier requires the extended skill |
| Feature-change behavior | `methodology.feature_change.uses_verifier_suite_when_invariants_present` | ADR extending /feature-change | Verifier requires the extended skill |

**Categories collapsed by independence rule:**

The previous analyses speculated separate invariants for each schema field (~12 for registry entries; 4 for glossary; 7 for ADR delta blocks; 6 for reaction artifacts; etc.). Under the independence rule + lazy decomposition, each of these structures becomes ONE invariant (`X.well_formed`) until an ADR proposes evolving a specific field independently. Net collapse: ~30 prose invariants → 3 schema-validity invariants here.

---

## DAG of this ADR's invariants

```
Roots (no requires):
  methodology.registry_entry.well_formed
  methodology.glossary_entry.well_formed
  methodology.adr_delta_block.well_formed

Layer 1 (requires roots):
  methodology.registry.no_orphans            → registry_entry.well_formed
  methodology.adr.delta_reconciles           → registry_entry.well_formed
                                              + adr_delta_block.well_formed
  methodology.glossary.complete              → registry_entry.well_formed
                                              + glossary_entry.well_formed
```

Six invariants total. Three roots, three Layer-1. Acyclic by construction.

---

## Final tally

**Invariants ADR-0075 directly introduces: 6.**

This is dramatically smaller than the previous analyses' counts (10-15 in v0, 75-85 in v1, 108-113 in v2, ~30-40 under earlier rules). The reason is the verifier-required rule combined with independence and lazy decomposition: most of the prose claims describe behaviors of tools that don't yet exist, so they can't be invariants this ADR introduces — they ship in subsequent ADRs as the tooling lands.

The methodology's full registry will reach an estimated 30-50 invariants over its implementation arc, but they enter the registry across many ADRs, not all in ADR-0075. This is the methodology's own bootstrap behavior: the registry grows leaf-up, paid-as-you-go, with each invariant arriving alongside its working verifier.

---

## What this analysis demonstrates about the methodology

1. **Verifier-required radically reduces speculation.** Without it, prose can produce 100+ candidate invariants. With it, the count is bounded by what's actually buildable today.

2. **Independence + lazy decomposition deflates schema-as-many-invariants.** The 12 prose claims about registry entry fields collapse to 1 invariant (`registry_entry.well_formed`) until an ADR forces independent evolution.

3. **The DAG is genuinely sparse.** Six invariants, three roots, three Layer-1. The methodology starts simple and grows by accretion, not by upfront decomposition.

4. **Future invariants are explicit, not speculative.** Instead of registering 100+ "potential" invariants now, the methodology defers them to the ADRs that introduce their tooling. Each future ADR's delta block adds its tool's invariants concretely; the registration plan is the implementation plan.

5. **Comments are valuable.** Each of the 6 invariants above has a Comments block capturing nuance (sub-assertions, scope limits, future split conditions) that doesn't belong in the one-line Definition. Without the Definition/Comments split, this nuance would either bloat the contract or be lost.
