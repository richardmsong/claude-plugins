package spec

import (
	"testing"
)

// TestCheckRegistryIDField bounds methodology.validator.registry_id_field.
//
// CheckRegistryIDField must return a CheckError for every active registry entry
// whose id does not match ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$, and must
// return no error for entries whose id does match.
func TestCheckRegistryIDField(t *testing.T) {
	v := newValidator() // dev-harness defines newValidator() in spec/checks.go
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
		wantField string
	}{
		{
			name:      "valid dotted id accepted",
			input:     []Invariant{{ID: "methodology.registry.id_field", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "two-segment id accepted",
			input:     []Invariant{{ID: "a.b", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "uppercase id flagged",
			input:     []Invariant{{ID: "Methodology.Registry.IDField", Status: StatusActive}},
			wantCount: 1,
			wantField: "id",
		},
		{
			name:      "single-segment id flagged",
			input:     []Invariant{{ID: "methodology", Status: StatusActive}},
			wantCount: 1,
			wantField: "id",
		},
		{
			name:      "empty id flagged",
			input:     []Invariant{{ID: "", Status: StatusActive}},
			wantCount: 1,
			wantField: "id",
		},
		{
			name:      "id with space flagged",
			input:     []Invariant{{ID: "bad id.field", Status: StatusActive}},
			wantCount: 1,
			wantField: "id",
		},
		{
			name:      "withdrawn entry with bad id is still flagged",
			input:     []Invariant{{ID: "BAD", Status: StatusWithdrawn}},
			wantCount: 1,
			wantField: "id",
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
		{
			name: "mixed valid and invalid entries",
			input: []Invariant{
				{ID: "a.b", Status: StatusActive},
				{ID: "BAD", Status: StatusActive},
			},
			wantCount: 1,
			wantField: "id",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckRegistryIDField(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckRegistryDefinitionField bounds methodology.validator.registry_definition_field.
//
// CheckRegistryDefinitionField must return a CheckError for every active registry
// entry whose definition is empty or contains newlines, and no error otherwise.
func TestCheckRegistryDefinitionField(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
		wantField string
	}{
		{
			name:      "non-empty single-line definition accepted",
			input:     []Invariant{{ID: "a.b", Definition: "The validator does something.", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "empty definition flagged",
			input:     []Invariant{{ID: "a.b", Definition: "", Status: StatusActive}},
			wantCount: 1,
			wantField: "definition",
		},
		{
			name:      "multi-line definition flagged",
			input:     []Invariant{{ID: "a.b", Definition: "line one\nline two", Status: StatusActive}},
			wantCount: 1,
			wantField: "definition",
		},
		{
			name:      "withdrawn entry with empty definition flagged",
			input:     []Invariant{{ID: "a.b", Definition: "", Status: StatusWithdrawn}},
			wantCount: 1,
			wantField: "definition",
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
		{
			name: "multiple entries, one bad",
			input: []Invariant{
				{ID: "a.b", Definition: "Good definition.", Status: StatusActive},
				{ID: "a.c", Definition: "", Status: StatusActive},
			},
			wantCount: 1,
			wantField: "definition",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckRegistryDefinitionField(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckRegistryVerifierField bounds methodology.validator.registry_verifier_field.
//
// CheckRegistryVerifierField must return a CheckError for every active registry
// entry whose verifier field is empty, lacks "::", or has empty path/function
// segments; and no error for well-formed verifier references.
func TestCheckRegistryVerifierField(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
		wantField string
	}{
		{
			name:      "valid path::FuncName accepted",
			input:     []Invariant{{ID: "a.b", Verifier: "spec/checks_registry_test.go::TestCheckRegistryIDField", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "path without function accepted",
			input:     []Invariant{{ID: "a.b", Verifier: "spec/checks.go", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "empty verifier flagged",
			input:     []Invariant{{ID: "a.b", Verifier: "", Status: StatusActive}},
			wantCount: 1,
			wantField: "verifier",
		},
		{
			name:      "verifier with empty path flagged",
			input:     []Invariant{{ID: "a.b", Verifier: "::TestFoo", Status: StatusActive}},
			wantCount: 1,
			wantField: "verifier",
		},
		{
			name:      "verifier with empty function suffix flagged",
			input:     []Invariant{{ID: "a.b", Verifier: "spec/checks.go::", Status: StatusActive}},
			wantCount: 1,
			wantField: "verifier",
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckRegistryVerifierField(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckRegistryStatusField bounds methodology.validator.registry_status_field.
//
// CheckRegistryStatusField must return a CheckError for every registry entry
// whose status is not "active" or "withdrawn", and no error for valid statuses.
func TestCheckRegistryStatusField(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
		wantField string
	}{
		{
			name:      "active status accepted",
			input:     []Invariant{{ID: "a.b", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "withdrawn status accepted",
			input:     []Invariant{{ID: "a.b", Status: StatusWithdrawn}},
			wantCount: 0,
		},
		{
			name:      "empty status flagged",
			input:     []Invariant{{ID: "a.b", Status: ""}},
			wantCount: 1,
			wantField: "status",
		},
		{
			name:      "misspelled status flagged",
			input:     []Invariant{{ID: "a.b", Status: "Active"}},
			wantCount: 1,
			wantField: "status",
		},
		{
			name:      "unknown status flagged",
			input:     []Invariant{{ID: "a.b", Status: "deprecated"}},
			wantCount: 1,
			wantField: "status",
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckRegistryStatusField(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckRegistryGlossaryTermsField bounds methodology.validator.registry_glossary_terms_field.
//
// CheckRegistryGlossaryTermsField must return a CheckError for every active
// registry entry with an empty-string glossary_terms element, and no error
// when the field is absent or a list of non-empty strings.
func TestCheckRegistryGlossaryTermsField(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
		wantField string
	}{
		{
			name:      "nil glossary_terms accepted",
			input:     []Invariant{{ID: "a.b", GlossaryTerms: nil, Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "empty glossary_terms slice accepted",
			input:     []Invariant{{ID: "a.b", GlossaryTerms: []string{}, Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "non-empty terms accepted",
			input:     []Invariant{{ID: "a.b", GlossaryTerms: []string{"registry entry", "id"}, Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "empty-string term in list flagged",
			input:     []Invariant{{ID: "a.b", GlossaryTerms: []string{"registry entry", ""}, Status: StatusActive}},
			wantCount: 1,
			wantField: "glossary_terms",
		},
		{
			name:      "whitespace-only term flagged",
			input:     []Invariant{{ID: "a.b", GlossaryTerms: []string{"  "}, Status: StatusActive}},
			wantCount: 1,
			wantField: "glossary_terms",
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckRegistryGlossaryTermsField(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}

// TestCheckRegistryNoAndInDefinition bounds methodology.validator.registry_no_and_in_definition.
//
// CheckRegistryNoAndInDefinition must return a CheckError for every active
// registry entry whose definition matches the regex \band\b (case-insensitive),
// and no error for entries without "and".
func TestCheckRegistryNoAndInDefinition(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
		wantField string
	}{
		{
			name:      "definition without and accepted",
			input:     []Invariant{{ID: "a.b", Definition: "The validator flags empty ids.", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "definition with lowercase and flagged",
			input:     []Invariant{{ID: "a.b", Definition: "Flags this and that.", Status: StatusActive}},
			wantCount: 1,
			wantField: "definition",
		},
		{
			name:      "definition with uppercase And flagged",
			input:     []Invariant{{ID: "a.b", Definition: "Flags this And that.", Status: StatusActive}},
			wantCount: 1,
			wantField: "definition",
		},
		{
			name:      "word band not flagged",
			input:     []Invariant{{ID: "a.b", Definition: "Flags entries in the band.", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "withdrawn entry with and not flagged",
			input:     []Invariant{{ID: "a.b", Definition: "Flags this and that.", Status: StatusWithdrawn}},
			wantCount: 0,
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckRegistryNoAndInDefinition(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" && len(errs) > 0 && errs[0].Field != tc.wantField {
				t.Errorf("got Field=%q, want %q", errs[0].Field, tc.wantField)
			}
		})
	}
}
