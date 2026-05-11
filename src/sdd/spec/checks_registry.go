package spec

// NamedCheck pairs a dispatch label, a method value, and the invariant ID
// it implements.
type NamedCheck struct {
	Name        string // dispatch label, e.g., "registry.id_field"
	Method      func(reg []Invariant, glos []GlossaryEntry, cfg *Config, adrDir string) []CheckError
	InvariantID string // matches Registry's id field
}

// AllChecks is the ordered slice of all registered checks.
// Populated at package init by topoSort over the Requires DAG.
var AllChecks []NamedCheck

func init() {
	v := &validator{}
	raw := []NamedCheck{
		// Registry schema (6)
		{
			Name:        "registry.id_field",
			Method:      v.CheckRegistryIDField,
			InvariantID: "methodology.validator.registry_id_field",
		},
		{
			Name:        "registry.definition_field",
			Method:      v.CheckRegistryDefinitionField,
			InvariantID: "methodology.validator.registry_definition_field",
		},
		{
			Name:        "registry.verifier_field",
			Method:      v.CheckRegistryVerifierField,
			InvariantID: "methodology.validator.registry_verifier_field",
		},
		{
			Name:        "registry.status_field",
			Method:      v.CheckRegistryStatusField,
			InvariantID: "methodology.validator.registry_status_field",
		},
		{
			Name:        "registry.glossary_terms_field",
			Method:      v.CheckRegistryGlossaryTermsField,
			InvariantID: "methodology.validator.registry_glossary_terms_field",
		},
		{
			Name:        "registry.no_and_in_definition",
			Method:      v.CheckRegistryNoAndInDefinition,
			InvariantID: "methodology.validator.registry_no_and_in_definition",
		},
		// Glossary schema (4)
		{
			Name:        "glossary.term_field",
			Method:      v.CheckGlossaryTermField,
			InvariantID: "methodology.validator.glossary_term_field",
		},
		{
			Name:        "glossary.definition_field",
			Method:      v.CheckGlossaryDefinitionField,
			InvariantID: "methodology.validator.glossary_definition_field",
		},
		{
			Name:        "glossary.resolves_to_field",
			Method:      v.CheckGlossaryResolvesToField,
			InvariantID: "methodology.validator.glossary_resolves_to_field",
		},
		{
			Name:        "glossary.scope_field",
			Method:      v.CheckGlossaryScopeField,
			InvariantID: "methodology.validator.glossary_scope_field",
		},
		// ADR delta schema (2)
		{
			Name:        "adr_delta.added_block",
			Method:      v.CheckADRDeltaAddedBlock,
			InvariantID: "methodology.validator.adr_delta_added_block",
		},
		{
			Name:        "adr_delta.withdrawn_block",
			Method:      v.CheckADRDeltaWithdrawnBlock,
			InvariantID: "methodology.validator.adr_delta_withdrawn_block",
		},
		// Cross-cutting (8)
		{
			Name:        "registry.verifier_resolves",
			Method:      v.CheckVerifierResolves,
			InvariantID: "methodology.validator.registry_verifier_resolves",
		},
		{
			Name:        "registry.verifier_unique",
			Method:      v.CheckVerifierUnique,
			InvariantID: "methodology.validator.registry_verifier_unique",
		},
		{
			Name:        "adr_delta.reconciles",
			Method:      v.CheckDeltaReconciles,
			InvariantID: "methodology.validator.adr_delta_reconciles",
		},
		{
			Name:        "glossary.complete",
			Method:      v.CheckGlossaryComplete,
			InvariantID: "methodology.validator.glossary_complete",
		},
		{
			Name:        "registry.requires_targets_exist",
			Method:      v.CheckRequiresTargetsExist,
			InvariantID: "methodology.validator.registry_requires_targets_exist",
		},
		{
			Name:        "registry.requires_dag_acyclic",
			Method:      v.CheckRequiresDAGAcyclic,
			InvariantID: "methodology.validator.registry_requires_dag_acyclic",
		},
		{
			Name:        "registry.supersedes_targets_exist",
			Method:      v.CheckSupersedesTargetsExist,
			InvariantID: "methodology.validator.registry_supersedes_targets_exist",
		},
		{
			Name:        "tests.bound_to_registry",
			Method:      v.CheckTestsBoundToRegistry,
			InvariantID: "methodology.validator.tests_bound_to_registry",
		},
		// ADR structural (2)
		{
			Name:        "adr.requires_delta",
			Method:      v.CheckADRRequiresDelta,
			InvariantID: "methodology.validator.adr_requires_delta",
		},
		{
			Name:        "adr.requires_decision_history",
			Method:      v.CheckADRRequiresDecisionHistory,
			InvariantID: "methodology.validator.adr_requires_decision_history",
		},
		// Config schema (5)
		{
			Name:        "config.spec_registry",
			Method:      v.CheckConfigSpecRegistry,
			InvariantID: "methodology.validator.config_spec_registry",
		},
		{
			Name:        "config.spec_glossary",
			Method:      v.CheckConfigSpecGlossary,
			InvariantID: "methodology.validator.config_spec_glossary",
		},
		{
			Name:        "config.spec_adr_dir",
			Method:      v.CheckConfigSpecADRDir,
			InvariantID: "methodology.validator.config_spec_adr_dir",
		},
		{
			Name:        "config.spec_reactions_dir",
			Method:      v.CheckConfigSpecReactionsDir,
			InvariantID: "methodology.validator.config_spec_reactions_dir",
		},
		{
			Name:        "config.verify_array",
			Method:      v.CheckConfigVerifyArray,
			InvariantID: "methodology.validator.config_verify_array_well_formed",
		},
		// Meta (1)
		{
			Name:        "validator.test_shape_unit_only",
			Method:      v.CheckTestShapeUnitOnly,
			InvariantID: "methodology.validator.test_shape_unit_only",
		},
	}
	AllChecks = topoSort(raw)
}

// topoSort orders the entries by the Requires DAG in registry.yaml so that
// prerequisites run before dependents. Ties (same in-degree) sort
// alphabetically by Name for determinism.
//
// The sort uses the InvariantID → requires edges from the in-memory Registry
// (loaded at package init from registry.yaml). Entries whose InvariantID is
// not found in Registry, or has no Requires, are treated as having no
// prerequisites and sort to the front alphabetically.
func topoSort(entries []NamedCheck) []NamedCheck {
	// Build a map from InvariantID → NamedCheck index.
	byID := make(map[string]int, len(entries))
	for i, e := range entries {
		byID[e.InvariantID] = i
	}

	// Build in-degree and adjacency from Registry's Requires edges,
	// restricted to the invariant IDs present in entries.
	inDegree := make([]int, len(entries))
	deps := make([][]int, len(entries)) // deps[i] = indices that i depends on

	// Build requires lookup from Registry.
	requiresOf := make(map[string][]string)
	for _, inv := range Registry {
		requiresOf[inv.ID] = inv.Requires
	}

	for i, e := range entries {
		for _, reqID := range requiresOf[e.InvariantID] {
			if j, ok := byID[reqID]; ok {
				// i depends on j → j must come before i
				inDegree[i]++
				deps[j] = append(deps[j], i)
			}
		}
	}

	// Kahn's algorithm. For determinism, collect candidates in a sorted slice.
	remaining := len(entries)
	queue := make([]int, 0, remaining)
	for i := range entries {
		if inDegree[i] == 0 {
			queue = append(queue, i)
		}
	}
	sortInts(queue)

	result := make([]NamedCheck, 0, remaining)
	for len(queue) > 0 {
		// Pop the front.
		idx := queue[0]
		queue = queue[1:]
		result = append(result, entries[idx])

		// Collect newly zero-in-degree candidates.
		var newCandidates []int
		for _, next := range deps[idx] {
			inDegree[next]--
			if inDegree[next] == 0 {
				newCandidates = append(newCandidates, next)
			}
		}
		sortInts(newCandidates)
		queue = append(queue, newCandidates...)
	}

	// If the graph had a cycle (shouldn't happen in a valid registry), fall back
	// to the original order.
	if len(result) < len(entries) {
		return entries
	}
	return result
}

// sortInts sorts a slice of ints in place using insertion sort (small n).
func sortInts(s []int) {
	for i := 1; i < len(s); i++ {
		x := s[i]
		j := i - 1
		for j >= 0 && s[j] > x {
			s[j+1] = s[j]
			j--
		}
		s[j+1] = x
	}
}
