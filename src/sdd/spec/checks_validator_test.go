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

// TestValidatorInterfaceSatisfaction verifies methodology.validator.concrete_satisfies_interface.
//
// Two compile-time assertions:
//   - (*validator)(nil) satisfies Validator: catches concrete-type drift.
//   - newValidator() returns a Validator-satisfying value: catches constructor-return-type drift.
//
// Both fail at compile time if dev-harness's implementation drifts from the
// Validator interface. The test never runs at runtime — it exists purely to
// register the satisfaction contract as a verifier path.
func TestValidatorInterfaceSatisfaction(t *testing.T) {
	var _ Validator = (*validator)(nil)
	var _ Validator = newValidator()
}

// TestCheckInterfaceFilePurity bounds methodology.validator.interface_file_purity.
//
// CheckInterfaceFilePurity must return a CheckError for every *_interface.go file
// that contains a struct type declaration, and no error for files that contain
// only interface declarations or type aliases. Non-interface-file Go files are
// ignored entirely.
func TestCheckInterfaceFilePurity(t *testing.T) {
	v := newValidator()

	cases := []struct {
		name      string
		files     map[string]string // relative path (under <tempDir>/spec/) -> content
		wantCount int
		wantField string // if non-empty, all errors must have this Field
	}{
		{
			name: "interface-only file accepted",
			files: map[string]string{
				"foo_interface.go": `package x
type X interface { F() }
`,
			},
			wantCount: 0,
		},
		{
			name: "struct in interface file flagged",
			files: map[string]string{
				"bar_interface.go": `package x
type Y struct { z int }
`,
			},
			wantCount: 1,
			wantField: "type declaration",
		},
		{
			name: "type alias accepted",
			files: map[string]string{
				"baz_interface.go": `package x
type A = int
`,
			},
			wantCount: 0,
		},
		{
			name: "non-interface file ignored",
			files: map[string]string{
				"helper.go": `package x
type Helper struct { val int }
`,
			},
			wantCount: 0,
		},
		{
			name: "mix: struct in interface file + clean interface file",
			files: map[string]string{
				"clean_interface.go": `package x
type Clean interface { Do() }
`,
				"dirty_interface.go": `package x
type Dirty struct { n int }
`,
			},
			wantCount: 1,
			wantField: "type declaration",
		},
		{
			name:      "empty directory accepted",
			files:     map[string]string{},
			wantCount: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			specDir := filepath.Join(root, "spec")
			if err := os.MkdirAll(specDir, 0755); err != nil {
				t.Fatalf("mkdir spec: %v", err)
			}
			for name, content := range tc.files {
				if err := os.WriteFile(filepath.Join(specDir, name), []byte(content), 0644); err != nil {
					t.Fatalf("write %s: %v", name, err)
				}
			}
			// adrDir = <root>/docs so that filepath.Dir(adrDir) == root (module root).
			adrDir := filepath.Join(root, "docs")
			errs := v.CheckInterfaceFilePurity(nil, nil, nil, adrDir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" {
				for _, e := range errs {
					if e.Field != tc.wantField {
						t.Errorf("error Field = %q, want %q: %+v", e.Field, tc.wantField, e)
					}
				}
			}
		})
	}
}

// TestCheckNoTestScaffoldingTypes bounds methodology.validator.no_test_scaffolding_types.
//
// CheckNoTestScaffoldingTypes must return a CheckError for every struct declared in
// a *_test.go file whose method set (in the same file) is a superset of any interface
// declared in a *_interface.go file. Partial method sets, structs in production files,
// and mocks of unrelated interfaces are accepted.
func TestCheckNoTestScaffoldingTypes(t *testing.T) {
	v := newValidator()

	// interfaceFile declares a two-method interface used across multiple sub-cases.
	interfaceFile := `package spec
type MyIface interface {
	Foo()
	Bar()
}
`

	cases := []struct {
		name      string
		files     map[string]string // relative path (under <tempDir>/spec/) -> content
		wantCount int
	}{
		{
			name: "type covering full interface method set flagged",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"x_test.go": `package spec
type mockFull struct{}
func (m mockFull) Foo() {}
func (m mockFull) Bar() {}
`,
			},
			wantCount: 1,
		},
		{
			name: "partial method set accepted",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"x_test.go": `package spec
type mockPartial struct{}
func (m mockPartial) Foo() {}
`,
			},
			wantCount: 0,
		},
		{
			name: "test file with no struct declarations accepted",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"x_test.go": `package spec
import "testing"
func TestSomething(t *testing.T) { _ = t }
`,
			},
			wantCount: 0,
		},
		{
			name: "struct in production file ignored",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"foo.go": `package spec
type prodImpl struct{}
func (p prodImpl) Foo() {}
func (p prodImpl) Bar() {}
`,
			},
			wantCount: 0,
		},
		{
			name: "mock of unrelated interface accepted",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"x_test.go": `package spec
type mockX struct{}
func (m mockX) Read() ([]byte, error) { return nil, nil }
`,
			},
			wantCount: 0,
		},
		{
			name:      "empty directory accepted",
			files:     map[string]string{},
			wantCount: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			specDir := filepath.Join(root, "spec")
			if err := os.MkdirAll(specDir, 0755); err != nil {
				t.Fatalf("mkdir spec: %v", err)
			}
			for name, content := range tc.files {
				if err := os.WriteFile(filepath.Join(specDir, name), []byte(content), 0644); err != nil {
					t.Fatalf("write %s: %v", name, err)
				}
			}
			adrDir := filepath.Join(root, "docs")
			errs := v.CheckNoTestScaffoldingTypes(nil, nil, nil, adrDir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckNoProductionSatisfactionAssertions bounds methodology.validator.no_production_satisfaction_assertions.
//
// CheckNoProductionSatisfactionAssertions must return a CheckError for every
// package-level `var _ <Interface> = <expr>` in a non-_test.go file where the
// identifier resolves to an interface type in the package. Assertions in test
// files, `var _ = expr` without a type, and assertions against non-interface
// types must all be accepted.
func TestCheckNoProductionSatisfactionAssertions(t *testing.T) {
	v := newValidator()

	// interfaceFile declares the interface used to detect assertions.
	interfaceFile := `package spec
type X interface { F() }
`

	cases := []struct {
		name      string
		files     map[string]string // relative path (under <tempDir>/spec/) -> content
		wantCount int
		wantField string
	}{
		{
			name: "var _ Interface assertion in production flagged",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"x.go": `package spec
type y struct{}
func (y) F() {}
var _ X = (*y)(nil)
`,
			},
			wantCount: 1,
			wantField: "var declaration",
		},
		{
			name: "var _ Interface assertion in test file accepted",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"x_test.go": `package spec
type y struct{}
func (y) F() {}
var _ X = (*y)(nil)
`,
			},
			wantCount: 0,
		},
		{
			name: "var _ = expr without interface type accepted",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"x.go": `package spec
var _ = "hello"
`,
			},
			wantCount: 0,
		},
		{
			name: "var _ NonInterfaceType = expr accepted",
			files: map[string]string{
				"checks_interface.go": interfaceFile,
				"x.go": `package spec
type MyStruct struct{}
var _ MyStruct = MyStruct{}
`,
			},
			wantCount: 0,
		},
		{
			name:      "empty directory accepted",
			files:     map[string]string{},
			wantCount: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			specDir := filepath.Join(root, "spec")
			if err := os.MkdirAll(specDir, 0755); err != nil {
				t.Fatalf("mkdir spec: %v", err)
			}
			for name, content := range tc.files {
				if err := os.WriteFile(filepath.Join(specDir, name), []byte(content), 0644); err != nil {
					t.Fatalf("write %s: %v", name, err)
				}
			}
			adrDir := filepath.Join(root, "docs")
			errs := v.CheckNoProductionSatisfactionAssertions(nil, nil, nil, adrDir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
			if tc.wantField != "" {
				for _, e := range errs {
					if e.Field != tc.wantField {
						t.Errorf("error Field = %q, want %q: %+v", e.Field, tc.wantField, e)
					}
				}
			}
		})
	}
}
