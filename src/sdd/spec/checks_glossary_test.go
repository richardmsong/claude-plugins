package spec

import (
	"testing"
)

// TestCheckGlossaryTermField bounds methodology.validator.glossary_term_field.
//
// CheckGlossaryTermField must return a CheckError for every glossary entry
// whose term is empty or whitespace-only, and no error for non-empty terms.
func TestCheckGlossaryTermField(t *testing.T) {
	v := newValidator() // dev-harness defines newValidator() in spec/checks.go
	cases := []struct {
		name      string
		input     []GlossaryEntry
		wantCount int
		wantField string
	}{
		{
			name:      "non-empty term accepted",
			input:     []GlossaryEntry{{Term: "registry entry", Definition: "A record.", ResolvesTo: "spec.Invariant", Scope: ScopeMethodology}},
			wantCount: 0,
		},
		{
			name:      "empty term flagged",
			input:     []GlossaryEntry{{Term: "", Definition: "Something.", ResolvesTo: "spec.Invariant", Scope: ScopeMethodology}},
			wantCount: 1,
			wantField: "term",
		},
		{
			name:      "whitespace-only term flagged",
			input:     []GlossaryEntry{{Term: "   ", Definition: "Something.", ResolvesTo: "spec.Invariant", Scope: ScopeMethodology}},
			wantCount: 1,
			wantField: "term",
		},
		{
			name:      "empty glossary accepted",
			input:     []GlossaryEntry{},
			wantCount: 0,
		},
		{
			name: "one good one bad",
			input: []GlossaryEntry{
				{Term: "id", Definition: "The unique identifier.", ResolvesTo: "spec.Invariant.ID", Scope: ScopeMethodology},
				{Term: "", Definition: "Missing term.", ResolvesTo: "spec.Invariant", Scope: ScopeMethodology},
			},
			wantCount: 1,
			wantField: "term",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckGlossaryTermField(nil, tc.input, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckGlossaryDefinitionField bounds methodology.validator.glossary_definition_field.
//
// CheckGlossaryDefinitionField must return a CheckError for every glossary
// entry whose definition is empty or whitespace-only, and no error otherwise.
func TestCheckGlossaryDefinitionField(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []GlossaryEntry
		wantCount int
		wantField string
	}{
		{
			name:      "non-empty definition accepted",
			input:     []GlossaryEntry{{Term: "id", Definition: "The unique identifier.", ResolvesTo: "spec.Invariant.ID", Scope: ScopeMethodology}},
			wantCount: 0,
		},
		{
			name:      "empty definition flagged",
			input:     []GlossaryEntry{{Term: "id", Definition: "", ResolvesTo: "spec.Invariant.ID", Scope: ScopeMethodology}},
			wantCount: 1,
			wantField: "definition",
		},
		{
			name:      "whitespace-only definition flagged",
			input:     []GlossaryEntry{{Term: "id", Definition: "   ", ResolvesTo: "spec.Invariant.ID", Scope: ScopeMethodology}},
			wantCount: 1,
			wantField: "definition",
		},
		{
			name:      "nil/empty glossary accepted",
			input:     []GlossaryEntry{},
			wantCount: 0,
		},
		{
			name: "two entries, one missing definition",
			input: []GlossaryEntry{
				{Term: "id", Definition: "The identifier.", ResolvesTo: "spec.Invariant.ID", Scope: ScopeMethodology},
				{Term: "verifier", Definition: "", ResolvesTo: "spec.Invariant.Verifier", Scope: ScopeMethodology},
			},
			wantCount: 1,
			wantField: "definition",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckGlossaryDefinitionField(nil, tc.input, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckGlossaryResolvesToField bounds methodology.validator.glossary_resolves_to_field.
//
// CheckGlossaryResolvesToField must return a CheckError for every glossary
// entry whose resolves_to field is non-empty but does not point to a valid
// typed binding identifier; must return no error for entries with empty or
// valid resolves_to.
//
// Valid forms (per existing typedBindingRE in the spec package):
//   - a qualified Go name like "spec.Invariant" or "spec.Invariant.ID"
//   - a string starting with "string " (string descriptor form)
//   - another glossary term in the provided list
//   - an invariant ID in the provided registry
func TestCheckGlossaryResolvesToField(t *testing.T) {
	v := newValidator()

	reg := []Invariant{{ID: "methodology.registry.id_field", Status: StatusActive}}
	glos := []GlossaryEntry{
		{Term: "registry entry", Definition: "A record.", ResolvesTo: "spec.Invariant", Scope: ScopeMethodology},
	}

	cases := []struct {
		name      string
		glos      []GlossaryEntry
		reg       []Invariant
		wantCount int
		wantField string
	}{
		{
			name:      "qualified Go name accepted",
			glos:      []GlossaryEntry{{Term: "id", Definition: "The id.", ResolvesTo: "spec.Invariant.ID", Scope: ScopeMethodology}},
			reg:       nil,
			wantCount: 0,
		},
		{
			name:      "string descriptor form accepted",
			glos:      []GlossaryEntry{{Term: "bound", Definition: "A string.", ResolvesTo: "string of form `package.Type`", Scope: ScopeMethodology}},
			reg:       nil,
			wantCount: 0,
		},
		{
			name:      "empty resolves_to flagged",
			glos:      []GlossaryEntry{{Term: "orphan", Definition: "No binding.", ResolvesTo: "", Scope: ScopeMethodology}},
			reg:       nil,
			wantCount: 1,
			wantField: "resolves_to",
		},
		{
			name:      "resolves_to another glossary term accepted",
			glos:      append(glos, GlossaryEntry{Term: "alias", Definition: "Same as registry entry.", ResolvesTo: "registry entry", Scope: ScopeMethodology}),
			reg:       nil,
			wantCount: 0,
		},
		{
			name:      "resolves_to invariant id accepted",
			glos:      []GlossaryEntry{{Term: "id_field invariant", Definition: "The invariant.", ResolvesTo: "methodology.registry.id_field", Scope: ScopeMethodology}},
			reg:       reg,
			wantCount: 0,
		},
		{
			name:      "unresolvable resolves_to flagged",
			glos:      []GlossaryEntry{{Term: "mystery", Definition: "Something.", ResolvesTo: "does not exist anywhere", Scope: ScopeMethodology}},
			reg:       nil,
			wantCount: 1,
			wantField: "resolves_to",
		},
		{
			name:      "empty glossary accepted",
			glos:      []GlossaryEntry{},
			reg:       nil,
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckGlossaryResolvesToField(tc.reg, tc.glos, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckGlossaryScopeField bounds methodology.validator.glossary_scope_field.
//
// CheckGlossaryScopeField must return a CheckError for every glossary entry
// whose scope is not a valid GlossaryScope value; and no error for valid scopes.
func TestCheckGlossaryScopeField(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []GlossaryEntry
		wantCount int
		wantField string
	}{
		{
			name:      "methodology scope accepted",
			input:     []GlossaryEntry{{Term: "id", Definition: "Identifier.", ResolvesTo: "spec.Invariant.ID", Scope: ScopeMethodology}},
			wantCount: 0,
		},
		{
			name:      "project-cross-cutting scope accepted",
			input:     []GlossaryEntry{{Term: "id", Definition: "Identifier.", ResolvesTo: "spec.Invariant.ID", Scope: ScopeProjectCrossCut}},
			wantCount: 0,
		},
		{
			name:      "component-local scope accepted",
			input:     []GlossaryEntry{{Term: "id", Definition: "Identifier.", ResolvesTo: "spec.Invariant.ID", Scope: ScopeComponentLocal}},
			wantCount: 0,
		},
		{
			name:      "empty scope flagged",
			input:     []GlossaryEntry{{Term: "id", Definition: "Identifier.", ResolvesTo: "spec.Invariant.ID", Scope: ""}},
			wantCount: 1,
			wantField: "scope",
		},
		{
			name:      "unknown scope flagged",
			input:     []GlossaryEntry{{Term: "id", Definition: "Identifier.", ResolvesTo: "spec.Invariant.ID", Scope: "consumer"}},
			wantCount: 1,
			wantField: "scope",
		},
		{
			name:      "misspelled scope flagged",
			input:     []GlossaryEntry{{Term: "id", Definition: "Identifier.", ResolvesTo: "spec.Invariant.ID", Scope: "Methodology"}},
			wantCount: 1,
			wantField: "scope",
		},
		{
			name:      "empty glossary accepted",
			input:     []GlossaryEntry{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckGlossaryScopeField(nil, tc.input, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}
