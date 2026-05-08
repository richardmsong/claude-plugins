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
