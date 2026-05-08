package spec

import (
	"regexp"
	"strings"
	"testing"
)

// TestGlossaryTermField verifies methodology.glossary.term_field.
func TestGlossaryTermField(t *testing.T) {
	seen := make(map[string]bool)
	for i, g := range Glossary {
		if strings.TrimSpace(g.Term) == "" {
			t.Errorf("Glossary[%d]: term is empty", i)
			continue
		}
		key := string(g.Scope) + "|" + g.Term
		if seen[key] {
			t.Errorf("Glossary[%d] term=%q scope=%q: duplicate within scope", i, g.Term, g.Scope)
		}
		seen[key] = true
	}
}

// TestGlossaryDefinitionField verifies methodology.glossary.definition_field.
func TestGlossaryDefinitionField(t *testing.T) {
	for _, g := range Glossary {
		if strings.TrimSpace(g.Definition) == "" {
			t.Errorf("glossary[%q]: definition is empty", g.Term)
		}
	}
}

// typedBindingRE matches qualified Go names (`pkg.Type` or `pkg.Type.Method`)
// or descriptive forms beginning with "string ".
var typedBindingRE = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*\.[A-Za-z_][a-zA-Z0-9_.]*$|^string( |$)`)

// TestGlossaryResolvesToField verifies methodology.glossary.resolves_to_field.
func TestGlossaryResolvesToField(t *testing.T) {
	terms := make(map[string]bool)
	for _, g := range Glossary {
		terms[g.Term] = true
	}
	invariantIDs := make(map[string]bool)
	for _, inv := range Registry {
		invariantIDs[inv.ID] = true
	}

	for _, g := range Glossary {
		if g.ResolvesTo == "" {
			t.Errorf("glossary[%q]: resolves_to is empty", g.Term)
			continue
		}
		if typedBindingRE.MatchString(g.ResolvesTo) {
			continue
		}
		if invariantIDs[g.ResolvesTo] {
			continue
		}
		if terms[g.ResolvesTo] {
			continue
		}
		t.Errorf("glossary[%q]: resolves_to %q doesn't match valid form (typed binding, invariant ID, or glossary term)",
			g.Term, g.ResolvesTo)
	}
}

// TestGlossaryScopeField verifies methodology.glossary.scope_field.
func TestGlossaryScopeField(t *testing.T) {
	for _, g := range Glossary {
		if !ValidScope(g.Scope) {
			t.Errorf("glossary[%q]: scope %q not in {methodology, project-cross-cutting, component-local}", g.Term, g.Scope)
		}
	}
}
