package spec

import (
	"regexp"
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

// TestRegistryTierField verifies methodology.registry.tier_field.
func TestRegistryTierField(t *testing.T) {
	for _, inv := range Registry {
		if !ValidTier(inv.Tier) {
			t.Errorf("%s: tier %q not in {draft, active}", inv.ID, inv.Tier)
		}
	}
}

// TestRegistryStatusField verifies methodology.registry.status_field.
func TestRegistryStatusField(t *testing.T) {
	for _, inv := range Registry {
		if !ValidStatus(inv.Status) {
			t.Errorf("%s: status %q not in {active, deprecated, superseded, withdrawn}", inv.ID, inv.Status)
		}
	}
}

var adrIDRE = regexp.MustCompile(`^adr-[0-9]{4}(-[a-z0-9-]+)?$`)

// TestRegistryIntroducedByField verifies methodology.registry.introduced_by_field.
func TestRegistryIntroducedByField(t *testing.T) {
	for _, inv := range Registry {
		if inv.IntroducedBy == "" {
			t.Errorf("%s: introduced_by is empty", inv.ID)
			continue
		}
		if !adrIDRE.MatchString(inv.IntroducedBy) {
			t.Errorf("%s: introduced_by %q not in form `adr-NNNN` or `adr-NNNN-<slug>`", inv.ID, inv.IntroducedBy)
		}
	}
}

// TestRegistrySupersededByConsistency verifies methodology.registry.superseded_by_consistency.
func TestRegistrySupersededByConsistency(t *testing.T) {
	for _, inv := range Registry {
		if (inv.Status == StatusSuperseded) != (inv.SupersededBy != "") {
			t.Errorf("%s: superseded_by=%q vs status=%q (must be set iff status=superseded)",
				inv.ID, inv.SupersededBy, inv.Status)
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
