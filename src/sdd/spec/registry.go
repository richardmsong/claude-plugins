package spec

// Registry is the methodology's own invariant registry.
//
// Day-1 contents per ADR-0075 (post-collapse): no tier field, no
// introduced_by/promoted_by/superseded_by_consistency, no Modified/Promoted/
// Deprecated/Superseded sub-block invariants. Two-state status, computed
// stability, two ADR meta-edges (introduces, withdraws). Each entry's
// verifier exists in src/sdd/spec/.
var Registry = []Invariant{
	// --- Registry entry field invariants (6) ---
	{
		ID:            "methodology.registry.id_field",
		Definition:    "Every registry entry has an `id` field that is a unique non-empty string matching the dotted-path regex.",
		Mechanism:     MechSchema,
		Verifier:      "registry_test.go::TestRegistryIDField",
		GlossaryTerms: []string{"registry entry", "id"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.registry.definition_field",
		Definition:    "Every registry entry has a `definition` field that is a non-empty single-line string.",
		Mechanism:     MechSchema,
		Verifier:      "registry_test.go::TestRegistryDefinitionField",
		GlossaryTerms: []string{"registry entry", "definition"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.registry.mechanism_field",
		Definition:    "Every registry entry has a `mechanism` field whose value is in the closed taxonomy {unit, table, property, arch, ast, type, schema, completeness, integration, journey}.",
		Mechanism:     MechSchema,
		Verifier:      "registry_test.go::TestRegistryMechanismField",
		GlossaryTerms: []string{"registry entry", "mechanism"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.registry.verifier_field",
		Definition:    "Every registry entry has a `verifier` field that is a non-empty string in the form `path` or `path::FuncName`.",
		Mechanism:     MechSchema,
		Verifier:      "registry_test.go::TestRegistryVerifierField",
		GlossaryTerms: []string{"registry entry", "verifier"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.registry.status_field",
		Definition:    "Every registry entry has a `status` field whose value is in {active, withdrawn}.",
		Mechanism:     MechSchema,
		Verifier:      "registry_test.go::TestRegistryStatusField",
		GlossaryTerms: []string{"registry entry", "status"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.registry.glossary_terms_field",
		Definition:    "Every registry entry has a `glossary_terms` field that is a (possibly empty) list of non-empty strings.",
		Mechanism:     MechSchema,
		Verifier:      "registry_test.go::TestRegistryGlossaryTermsField",
		GlossaryTerms: []string{"registry entry"},
		Status:        StatusActive,
	},

	// --- Glossary entry field invariants (4) ---
	{
		ID:            "methodology.glossary.term_field",
		Definition:    "Every glossary entry has a non-empty `term` field unique within its scope.",
		Mechanism:     MechSchema,
		Verifier:      "glossary_test.go::TestGlossaryTermField",
		GlossaryTerms: []string{"glossary entry"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.glossary.definition_field",
		Definition:    "Every glossary entry has a non-empty `definition` field.",
		Mechanism:     MechSchema,
		Verifier:      "glossary_test.go::TestGlossaryDefinitionField",
		GlossaryTerms: []string{"glossary entry"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.glossary.resolves_to_field",
		Definition:    "Every glossary entry has a `resolves_to` field that names a typed binding, an existing registry entry ID, or another glossary term.",
		Mechanism:     MechSchema,
		Verifier:      "glossary_test.go::TestGlossaryResolvesToField",
		Requires:      []string{"methodology.glossary.term_field"},
		GlossaryTerms: []string{"glossary entry", "typed binding"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.glossary.scope_field",
		Definition:    "Every glossary entry has a `scope` field whose value is in {methodology, project-cross-cutting, component-local}.",
		Mechanism:     MechSchema,
		Verifier:      "glossary_test.go::TestGlossaryScopeField",
		GlossaryTerms: []string{"glossary entry"},
		Status:        StatusActive,
	},

	// --- ADR delta sub-block invariants (2) ---
	{
		ID:            "methodology.adr_delta.added_block",
		Definition:    "Every `### Added` entry parses to (id, definition, mechanism, verifier, requires) with valid types; may include an optional `supersedes` sub-field naming a predecessor invariant.",
		Mechanism:     MechAST,
		Verifier:      "adr_delta_test.go::TestADRDeltaAddedBlock",
		GlossaryTerms: []string{"ADR delta block"},
		Status:        StatusActive,
	},
	{
		ID:            "methodology.adr_delta.withdrawn_block",
		Definition:    "Every `### Withdrawn` entry parses to (id, reason); the named invariant's verifier file must be deleted in the same commit.",
		Mechanism:     MechAST,
		Verifier:      "adr_delta_test.go::TestADRDeltaWithdrawnBlock",
		GlossaryTerms: []string{"ADR delta block"},
		Status:        StatusActive,
	},

	// --- Cross-cutting (4) ---
	{
		ID:         "methodology.registry.requires_targets_exist",
		Definition: "Every invariant ID listed in any registry entry's `requires` field references an invariant that exists in the registry.",
		Mechanism:  MechCompleteness,
		Verifier:   "registry_test.go::TestRegistryRequiresTargetsExist",
		Requires: []string{
			"methodology.registry.id_field",
		},
		GlossaryTerms: []string{"registry entry", "id"},
		Status:        StatusActive,
	},
	{
		ID:         "methodology.registry.requires_dag_acyclic",
		Definition: "The directed graph formed by registry entries' `requires` edges is acyclic.",
		Mechanism:  MechCompleteness,
		Verifier:   "registry_test.go::TestRegistryRequiresDAGAcyclic",
		Requires: []string{
			"methodology.registry.id_field",
			"methodology.registry.requires_targets_exist",
		},
		GlossaryTerms: []string{"registry entry"},
		Status:        StatusActive,
	},
	{
		ID:         "methodology.registry.supersedes_targets_exist",
		Definition: "Every registry entry's `supersedes` field, when set, references an existing registry entry whose status is `withdrawn`.",
		Mechanism:  MechCompleteness,
		Verifier:   "registry_test.go::TestRegistrySupersedesTargetsExist",
		Requires: []string{
			"methodology.registry.id_field",
			"methodology.registry.status_field",
		},
		GlossaryTerms: []string{"registry entry", "status"},
		Status:        StatusActive,
	},

	{
		ID:         "methodology.registry.no_orphans",
		Definition: "Every active registry entry's verifier reference resolves to an existing file (and existing test function for Go test refs); every declared verifier reference is named by at most one registry entry.",
		Mechanism:  MechCompleteness,
		Verifier:   "cross_cutting_test.go::TestNoOrphans",
		Requires: []string{
			"methodology.registry.id_field",
			"methodology.registry.verifier_field",
			"methodology.registry.status_field",
		},
		GlossaryTerms: []string{"registry entry", "verifier", "status"},
		Status:        StatusActive,
	},
	{
		ID:         "methodology.adr.delta_reconciles",
		Definition: "The current registry contents equal the integral of (Added minus Withdrawn) deltas across all live ADRs; supersession is recorded as Added with a supersedes sub-field, marking the predecessor withdrawn.",
		Mechanism:  MechCompleteness,
		Verifier:   "cross_cutting_test.go::TestDeltaReconciles",
		Requires: []string{
			"methodology.registry.id_field",
			"methodology.registry.status_field",
			"methodology.adr_delta.added_block",
			"methodology.adr_delta.withdrawn_block",
		},
		GlossaryTerms: []string{"registry entry", "ADR delta block"},
		Status:        StatusActive,
	},
	{
		ID:         "methodology.glossary.complete",
		Definition: "Every term listed in `glossary_terms` of any active registry entry resolves to a typed binding or a glossary entry.",
		Mechanism:  MechSchema,
		Verifier:   "cross_cutting_test.go::TestGlossaryComplete",
		Requires: []string{
			"methodology.registry.glossary_terms_field",
			"methodology.registry.status_field",
			"methodology.glossary.term_field",
		},
		GlossaryTerms: []string{"registry entry", "glossary entry", "typed binding"},
		Status:        StatusActive,
	},
}
