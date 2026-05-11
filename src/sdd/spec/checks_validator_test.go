package spec

import (
	"os"
	"path/filepath"
	"testing"
)

// TestCheckTestShapeUnitOnly bounds methodology.validator.test_shape_unit_only.
//
// CheckTestShapeUnitOnly must return a CheckError for every *_test.go file that
// contains an AST reference to spec.Registry or spec.Glossary (the methodology's
// embedded package-level vars), and no error for test files that use only
// synthetic inputs.
func TestCheckTestShapeUnitOnly(t *testing.T) {
	v := newValidator() // dev-harness defines newValidator() in spec/checks.go

	// A test file that reads spec.Registry directly — must be flagged.
	badTestFile := `package spec

import "testing"

func TestBadShape(t *testing.T) {
	// This reads the embedded registry data directly — violates test shape.
	for _, inv := range spec.Registry {
		_ = inv.ID
	}
}
`

	// A test file that reads spec.Glossary directly — must be flagged.
	badTestFileGlossary := `package spec

import "testing"

func TestBadGlossaryShape(t *testing.T) {
	// This reads the embedded glossary data directly — violates test shape.
	for _, g := range spec.Glossary {
		_ = g.Term
	}
}
`

	// A test file that uses only synthetic inputs — must be accepted.
	goodTestFile := `package spec

import "testing"

func TestGoodShape(t *testing.T) {
	// Uses synthetic inputs — no embedded data read.
	inv := Invariant{ID: "a.b", Status: StatusActive}
	_ = inv
}
`

	// A test file that references "Registry" as a local variable (not spec.Registry)
	// — must be accepted.
	localVarTestFile := `package spec

import "testing"

func TestLocalVar(t *testing.T) {
	// "Registry" here is a local variable, not spec.Registry.
	Registry := []Invariant{{ID: "a.b"}}
	_ = Registry
}
`

	cases := []struct {
		name      string
		testFiles map[string]string // filename -> content
		wantCount int
	}{
		{
			name: "test file with spec.Registry reference flagged",
			testFiles: map[string]string{
				"bad_test.go": badTestFile,
			},
			wantCount: 1,
		},
		{
			name: "test file with spec.Glossary reference flagged",
			testFiles: map[string]string{
				"bad_glossary_test.go": badTestFileGlossary,
			},
			wantCount: 1,
		},
		{
			name: "test file with synthetic inputs only accepted",
			testFiles: map[string]string{
				"good_test.go": goodTestFile,
			},
			wantCount: 0,
		},
		{
			name: "local variable named Registry not flagged",
			testFiles: map[string]string{
				"local_var_test.go": localVarTestFile,
			},
			wantCount: 0,
		},
		{
			name: "mix of good and bad flagged once per bad file",
			testFiles: map[string]string{
				"good_test.go": goodTestFile,
				"bad_test.go":  badTestFile,
			},
			wantCount: 1,
		},
		{
			name:      "empty directory accepted",
			testFiles: map[string]string{},
			wantCount: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tc.testFiles {
				if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
					t.Fatalf("write test file %s: %v", name, err)
				}
			}
			errs := v.CheckTestShapeUnitOnly(nil, nil, nil, dir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}
