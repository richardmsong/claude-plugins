package spec

import (
	"os"
	"path/filepath"
	"testing"
)

// TestCheckVerifierResolves bounds methodology.validator.registry_verifier_resolves.
//
// CheckVerifierResolves must return a CheckError for every active registry entry
// whose verifier path does not resolve to an existing file (or function within
// that file), and no error for entries whose verifier resolves.
func TestCheckVerifierResolves(t *testing.T) {
	v := newValidator() // dev-harness defines newValidator() in spec/checks.go

	// Create a temp file to act as the "existing" verifier file.
	dir := t.TempDir()
	realFile := filepath.Join(dir, "checks_test.go")
	if err := os.WriteFile(realFile, []byte("package spec\n\nfunc TestRealCheck() {}\n"), 0644); err != nil {
		t.Fatalf("write real file: %v", err)
	}

	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
	}{
		{
			name:      "verifier file exists accepted",
			input:     []Invariant{{ID: "a.b", Verifier: realFile + "::TestRealCheck", Status: StatusActive}},
			wantCount: 0,
		},
		{
			name:      "verifier file does not exist flagged",
			input:     []Invariant{{ID: "a.b", Verifier: filepath.Join(dir, "nonexistent_test.go") + "::TestMissing", Status: StatusActive}},
			wantCount: 1,
		},
		{
			name:      "withdrawn entry with missing verifier not flagged",
			input:     []Invariant{{ID: "a.b", Verifier: filepath.Join(dir, "nonexistent_test.go") + "::TestMissing", Status: StatusWithdrawn}},
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
			errs := v.CheckVerifierResolves(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckVerifierUnique bounds methodology.validator.registry_verifier_unique.
//
// CheckVerifierUnique must return a CheckError for every pair of active registry
// entries that share the same verifier path, and no error if all active verifier
// paths are unique.
func TestCheckVerifierUnique(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
	}{
		{
			name: "unique verifiers accepted",
			input: []Invariant{
				{ID: "a.b", Verifier: "spec/checks_test.go::TestFoo", Status: StatusActive},
				{ID: "a.c", Verifier: "spec/checks_test.go::TestBar", Status: StatusActive},
			},
			wantCount: 0,
		},
		{
			name: "duplicate verifier path flagged",
			input: []Invariant{
				{ID: "a.b", Verifier: "spec/checks_test.go::TestFoo", Status: StatusActive},
				{ID: "a.c", Verifier: "spec/checks_test.go::TestFoo", Status: StatusActive},
			},
			wantCount: 1,
		},
		{
			name: "withdrawn duplicate not flagged",
			input: []Invariant{
				{ID: "a.b", Verifier: "spec/checks_test.go::TestFoo", Status: StatusActive},
				{ID: "a.c", Verifier: "spec/checks_test.go::TestFoo", Status: StatusWithdrawn},
			},
			wantCount: 0,
		},
		{
			name:      "single entry accepted",
			input:     []Invariant{{ID: "a.b", Verifier: "spec/checks_test.go::TestFoo", Status: StatusActive}},
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
			errs := v.CheckVerifierUnique(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckDeltaReconciles bounds methodology.validator.adr_delta_reconciles.
//
// CheckDeltaReconciles must return a CheckError when the set of currently-active
// registry IDs differs from the integral of Added minus Withdrawn across all ADR
// delta blocks; no error when they reconcile.
func TestCheckDeltaReconciles(t *testing.T) {
	v := newValidator()

	// ADR that adds "a.b" and "a.c".
	adrAddsTwo := `# ADR

## Invariant Delta

### Added

- id: a.b
  definition: First invariant.
  verifier: spec/checks_test.go::TestFoo
  status: active

- id: a.c
  definition: Second invariant.
  verifier: spec/checks_test.go::TestBar
  status: active

## Decision history (rationale notes)

Added for testing.
`
	// ADR that adds "a.d" and withdraws "a.c".
	adrAddWithdraw := `# ADR

## Invariant Delta

### Added

- id: a.d
  definition: Third invariant.
  verifier: spec/checks_test.go::TestBaz
  status: active

### Withdrawn

- a.c
  Reason: superseded

## Decision history (rationale notes)

Added for testing.
`

	cases := []struct {
		name      string
		reg       []Invariant       // current active registry
		adrFiles  map[string]string // adr dir content
		wantCount int
	}{
		{
			name: "registry reconciles with ADR deltas accepted",
			reg: []Invariant{
				{ID: "a.b", Status: StatusActive},
				{ID: "a.d", Status: StatusActive},
				{ID: "a.c", Status: StatusWithdrawn},
			},
			adrFiles: map[string]string{
				"adr-0001-adds.md":   adrAddsTwo,
				"adr-0002-update.md": adrAddWithdraw,
			},
			wantCount: 0,
		},
		{
			name: "registry has extra active entry not in deltas flagged",
			reg: []Invariant{
				{ID: "a.b", Status: StatusActive},
				{ID: "a.d", Status: StatusActive},
				{ID: "a.e", Status: StatusActive}, // not in any ADR
				{ID: "a.c", Status: StatusWithdrawn},
			},
			adrFiles: map[string]string{
				"adr-0001-adds.md":   adrAddsTwo,
				"adr-0002-update.md": adrAddWithdraw,
			},
			wantCount: 1,
		},
		{
			name:      "empty registry with no ADRs accepted",
			reg:       []Invariant{},
			adrFiles:  map[string]string{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tc.adrFiles {
				if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
					t.Fatalf("write ADR %s: %v", name, err)
				}
			}
			errs := v.CheckDeltaReconciles(tc.reg, nil, nil, dir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckGlossaryComplete bounds methodology.validator.glossary_complete.
//
// CheckGlossaryComplete must return a CheckError for every term appearing in
// an active registry entry's glossary_terms field that does not resolve to a
// glossary entry, and no error when every cited term resolves.
func TestCheckGlossaryComplete(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		reg       []Invariant
		glos      []GlossaryEntry
		wantCount int
	}{
		{
			name: "all cited terms resolve accepted",
			reg: []Invariant{
				{ID: "a.b", GlossaryTerms: []string{"registry entry"}, Status: StatusActive},
			},
			glos: []GlossaryEntry{
				{Term: "registry entry", Definition: "A record.", ResolvesTo: "spec.Invariant", Scope: ScopeMethodology},
			},
			wantCount: 0,
		},
		{
			name: "cited term not in glossary flagged",
			reg: []Invariant{
				{ID: "a.b", GlossaryTerms: []string{"missing term"}, Status: StatusActive},
			},
			glos:      []GlossaryEntry{},
			wantCount: 1,
		},
		{
			name: "withdrawn entry's terms not checked",
			reg: []Invariant{
				{ID: "a.b", GlossaryTerms: []string{"missing term"}, Status: StatusWithdrawn},
			},
			glos:      []GlossaryEntry{},
			wantCount: 0,
		},
		{
			name:      "empty registry accepted",
			reg:       []Invariant{},
			glos:      []GlossaryEntry{},
			wantCount: 0,
		},
		{
			name: "no glossary terms cited accepted",
			reg: []Invariant{
				{ID: "a.b", GlossaryTerms: []string{}, Status: StatusActive},
			},
			glos:      []GlossaryEntry{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckGlossaryComplete(tc.reg, tc.glos, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckRequiresTargetsExist bounds methodology.validator.registry_requires_targets_exist.
//
// CheckRequiresTargetsExist must return a CheckError for every requires
// reference in an active registry entry that does not resolve to another
// existing registry entry, and no error when all references resolve.
func TestCheckRequiresTargetsExist(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
	}{
		{
			name: "all requires targets exist accepted",
			input: []Invariant{
				{ID: "a.b", Status: StatusActive},
				{ID: "a.c", Requires: []string{"a.b"}, Status: StatusActive},
			},
			wantCount: 0,
		},
		{
			name: "requires target missing flagged",
			input: []Invariant{
				{ID: "a.c", Requires: []string{"a.b"}, Status: StatusActive}, // a.b not in registry
			},
			wantCount: 1,
		},
		{
			name: "requires pointing to withdrawn entry accepted",
			input: []Invariant{
				{ID: "a.b", Status: StatusWithdrawn},
				{ID: "a.c", Requires: []string{"a.b"}, Status: StatusActive},
			},
			wantCount: 0,
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
		{
			name: "no requires fields accepted",
			input: []Invariant{
				{ID: "a.b", Status: StatusActive},
			},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckRequiresTargetsExist(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckRequiresDAGAcyclic bounds methodology.validator.registry_requires_dag_acyclic.
//
// CheckRequiresDAGAcyclic must return a CheckError when the directed graph
// formed by registry entries' requires edges contains a cycle, and no error
// when the graph is acyclic.
func TestCheckRequiresDAGAcyclic(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
	}{
		{
			name: "linear chain accepted",
			input: []Invariant{
				{ID: "a.b", Status: StatusActive},
				{ID: "a.c", Requires: []string{"a.b"}, Status: StatusActive},
				{ID: "a.d", Requires: []string{"a.c"}, Status: StatusActive},
			},
			wantCount: 0,
		},
		{
			name: "self-loop cycle flagged",
			input: []Invariant{
				{ID: "a.b", Requires: []string{"a.b"}, Status: StatusActive},
			},
			wantCount: 1,
		},
		{
			name: "two-node cycle flagged",
			input: []Invariant{
				{ID: "a.b", Requires: []string{"a.c"}, Status: StatusActive},
				{ID: "a.c", Requires: []string{"a.b"}, Status: StatusActive},
			},
			wantCount: 1,
		},
		{
			name:      "empty registry accepted",
			input:     []Invariant{},
			wantCount: 0,
		},
		{
			name: "no requires accepted",
			input: []Invariant{
				{ID: "a.b", Status: StatusActive},
				{ID: "a.c", Status: StatusActive},
			},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			errs := v.CheckRequiresDAGAcyclic(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckSupersedesTargetsExist bounds methodology.validator.registry_supersedes_targets_exist.
//
// CheckSupersedesTargetsExist must return a CheckError for every active registry
// entry whose supersedes field references a non-existent entry, or references
// an entry whose status is not withdrawn; and no error when all supersession
// links resolve correctly.
func TestCheckSupersedesTargetsExist(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		input     []Invariant
		wantCount int
	}{
		{
			name: "supersedes withdrawn predecessor accepted",
			input: []Invariant{
				{ID: "a.b", Status: StatusWithdrawn},
				{ID: "a.c", Supersedes: "a.b", Status: StatusActive},
			},
			wantCount: 0,
		},
		{
			name: "supersedes non-existent entry flagged",
			input: []Invariant{
				{ID: "a.c", Supersedes: "a.nonexistent", Status: StatusActive},
			},
			wantCount: 1,
		},
		{
			name: "supersedes active entry flagged",
			input: []Invariant{
				{ID: "a.b", Status: StatusActive},
				{ID: "a.c", Supersedes: "a.b", Status: StatusActive},
			},
			wantCount: 1,
		},
		{
			name: "no supersedes field accepted",
			input: []Invariant{
				{ID: "a.b", Status: StatusActive},
			},
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
			errs := v.CheckSupersedesTargetsExist(tc.input, nil, nil, "")
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckTestsBoundToRegistry bounds methodology.validator.tests_bound_to_registry.
//
// CheckTestsBoundToRegistry must return a CheckError for every Test* function
// in spec/checks_*_test.go files that does not correspond to an active registry
// entry's verifier field, and no error when every test is bound.
func TestCheckTestsBoundToRegistry(t *testing.T) {
	v := newValidator()

	// Write synthetic test files into a temp dir that we pass as adrDir.
	// The validator interprets adrDir as the directory to scan test files in.
	dir := t.TempDir()

	// A test file with a function that IS bound to the registry.
	boundTestFile := `package spec

import "testing"

func TestBoundCheck(t *testing.T) {}
`
	// A test file with a function that is NOT bound to any registry entry.
	unboundTestFile := `package spec

import "testing"

func TestUnboundCheck(t *testing.T) {}
`
	reg := []Invariant{
		{ID: "a.b", Verifier: "checks_test.go::TestBoundCheck", Status: StatusActive},
	}

	cases := []struct {
		name      string
		reg       []Invariant
		testFiles map[string]string
		wantCount int
	}{
		{
			name: "all test functions bound accepted",
			reg:  reg,
			testFiles: map[string]string{
				"checks_test.go": boundTestFile,
			},
			wantCount: 0,
		},
		{
			name: "unbound test function flagged",
			reg:  reg,
			testFiles: map[string]string{
				"checks_test.go": boundTestFile + "\n" + unboundTestFile,
			},
			wantCount: 1,
		},
		{
			name:      "no test files accepted",
			reg:       reg,
			testFiles: map[string]string{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			subdir := filepath.Join(dir, tc.name)
			if err := os.MkdirAll(subdir, 0755); err != nil {
				t.Fatalf("mkdir: %v", err)
			}
			for name, content := range tc.testFiles {
				if err := os.WriteFile(filepath.Join(subdir, name), []byte(content), 0644); err != nil {
					t.Fatalf("write test file: %v", err)
				}
			}
			errs := v.CheckTestsBoundToRegistry(tc.reg, nil, nil, subdir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}
