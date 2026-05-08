package spec

import (
	"strings"
	"testing"
)

// TestRegistryIDField verifies methodology.registry.id_field.
func TestRegistryIDField(t *testing.T) {
	seen := make(map[string]bool)
	for i, inv := range Registry {
		if inv.ID == "" {
			t.Errorf("Registry[%d]: id is empty", i)
			continue
		}
		if !IDPattern.MatchString(inv.ID) {
			t.Errorf("Registry[%d] id=%q: doesn't match dotted-path regex", i, inv.ID)
		}
		if seen[inv.ID] {
			t.Errorf("Registry[%d] id=%q: duplicate id", i, inv.ID)
		}
		seen[inv.ID] = true
	}
}

// TestRegistryDefinitionField verifies methodology.registry.definition_field.
func TestRegistryDefinitionField(t *testing.T) {
	for _, inv := range Registry {
		if inv.Definition == "" {
			t.Errorf("%s: definition is empty", inv.ID)
		}
		if strings.Contains(inv.Definition, "\n") {
			t.Errorf("%s: definition is multi-line (must be single-line)", inv.ID)
		}
	}
}

// TestRegistryMechanismField verifies methodology.registry.mechanism_field.
func TestRegistryMechanismField(t *testing.T) {
	for _, inv := range Registry {
		if !ValidMechanism(inv.Mechanism) {
			t.Errorf("%s: mechanism %q not in taxonomy", inv.ID, inv.Mechanism)
		}
	}
}

// TestRegistryVerifierField verifies methodology.registry.verifier_field.
func TestRegistryVerifierField(t *testing.T) {
	for _, inv := range Registry {
		if inv.Verifier == "" {
			t.Errorf("%s: verifier is empty", inv.ID)
			continue
		}
		parts := strings.SplitN(inv.Verifier, "::", 2)
		if parts[0] == "" {
			t.Errorf("%s: verifier path is empty", inv.ID)
		}
		if len(parts) == 2 && parts[1] == "" {
			t.Errorf("%s: verifier ::FuncName suffix is empty", inv.ID)
		}
	}
}

// TestRegistryStatusField verifies methodology.registry.status_field.
func TestRegistryStatusField(t *testing.T) {
	for _, inv := range Registry {
		if !ValidStatus(inv.Status) {
			t.Errorf("%s: status %q not in {active, withdrawn}", inv.ID, inv.Status)
		}
	}
}

// TestRegistryGlossaryTermsField verifies methodology.registry.glossary_terms_field.
func TestRegistryGlossaryTermsField(t *testing.T) {
	for _, inv := range Registry {
		for j, term := range inv.GlossaryTerms {
			if strings.TrimSpace(term) == "" {
				t.Errorf("%s: glossary_terms[%d] is empty/whitespace", inv.ID, j)
			}
		}
	}
}

// TestRegistryRequiresTargetsExist verifies methodology.registry.requires_targets_exist.
//
// Every invariant ID listed in any entry's Requires field must reference an
// invariant that actually exists in the Registry. Catches typos, stale
// references after withdrawal, and dangling DAG edges.
func TestRegistryRequiresTargetsExist(t *testing.T) {
	ids := make(map[string]bool, len(Registry))
	for _, inv := range Registry {
		ids[inv.ID] = true
	}
	for _, inv := range Registry {
		for _, req := range inv.Requires {
			if !ids[req] {
				t.Errorf("%s: requires references non-existent invariant %q", inv.ID, req)
			}
		}
	}
}

// TestRegistryRequiresDAGAcyclic verifies methodology.registry.requires_dag_acyclic.
//
// Walks the requires graph from each invariant; uses three-color DFS to detect
// back-edges (cycles). Reports the cycle path on detection.
func TestRegistryRequiresDAGAcyclic(t *testing.T) {
	const (
		white = 0 // unvisited
		gray  = 1 // in current DFS stack
		black = 2 // fully explored
	)
	color := make(map[string]int, len(Registry))
	requires := make(map[string][]string, len(Registry))
	for _, inv := range Registry {
		color[inv.ID] = white
		requires[inv.ID] = inv.Requires
	}

	var stack []string
	var visit func(id string) bool
	visit = func(id string) bool {
		if color[id] == gray {
			// Cycle detected. Find where in stack it started.
			cycleStart := 0
			for i, s := range stack {
				if s == id {
					cycleStart = i
					break
				}
			}
			t.Errorf("requires DAG has cycle: %s -> %s",
				strings.Join(stack[cycleStart:], " -> "), id)
			return false
		}
		if color[id] == black {
			return true
		}
		color[id] = gray
		stack = append(stack, id)
		for _, dep := range requires[id] {
			if !visit(dep) {
				return false
			}
		}
		stack = stack[:len(stack)-1]
		color[id] = black
		return true
	}
	for _, inv := range Registry {
		if color[inv.ID] == white {
			visit(inv.ID)
		}
	}
}

// TestRegistrySupersedesTargetsExist verifies methodology.registry.supersedes_targets_exist.
//
// If an entry has Supersedes set, it must point at an existing registry entry
// whose Status is StatusWithdrawn. Catches stale supersession links and
// supersessions that didn't properly retire the predecessor.
func TestRegistrySupersedesTargetsExist(t *testing.T) {
	byID := make(map[string]Invariant, len(Registry))
	for _, inv := range Registry {
		byID[inv.ID] = inv
	}
	for _, inv := range Registry {
		if inv.Supersedes == "" {
			continue
		}
		predecessor, ok := byID[inv.Supersedes]
		if !ok {
			t.Errorf("%s: supersedes references non-existent invariant %q",
				inv.ID, inv.Supersedes)
			continue
		}
		if predecessor.Status != StatusWithdrawn {
			t.Errorf("%s: supersedes %q whose status is %q (expected withdrawn)",
				inv.ID, inv.Supersedes, predecessor.Status)
		}
	}
}
