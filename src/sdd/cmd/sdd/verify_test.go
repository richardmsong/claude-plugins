package main

import (
	"os"
	"path/filepath"
	"testing"

	"sdd-build/spec"
)

// TestRunStructuralChecksDispatchesAll bounds methodology.validator.cli_runs_structural_checks.
//
// runStructuralChecks must dispatch every entry in spec.AllChecks exactly once
// when invoked. The test counts the number of check results returned and
// asserts it is at least len(spec.AllChecks) — each registered check produces
// at least one result entry. dev-harness defines runStructuralChecks and
// spec.AllChecks.
func TestRunStructuralChecksDispatchesAll(t *testing.T) {
	// runStructuralChecks is defined in verify.go by dev-harness.
	// It accepts the loaded registry, glossary, config, and adrDir.
	// It must call every entry in spec.AllChecks exactly once.
	reg := spec.Registry
	glos := spec.Glossary

	results := runStructuralChecks(reg, glos, nil, "")

	// Every entry in AllChecks must produce at least one result.
	if len(results) < len(AllChecks) {
		t.Errorf("runStructuralChecks returned %d results, want at least %d (one per AllChecks entry)",
			len(results), len(AllChecks))
	}

	// Build a set of dispatched check names from results.
	dispatched := make(map[string]bool, len(results))
	for _, r := range results {
		dispatched[r.Name] = true
	}

	// Every AllChecks entry must appear in the results.
	for _, c := range AllChecks {
		if !dispatched[c.Name] {
			t.Errorf("AllChecks entry %q was not dispatched by runStructuralChecks", c.Name)
		}
	}
}

// TestRunWalkADRsParsesDeltas bounds methodology.validator.cli_walks_adr_dir.
//
// runWalkADRs must read adrDir, glob adr-*.md (root only), parse each file's
// ## Invariant Delta block via spec.ParseADRDeltaBlock, and return the parsed
// deltas to the dispatcher. dev-harness defines runWalkADRs (renamed from
// runADRWalk).
func TestRunWalkADRsParsesDeltas(t *testing.T) {
	// Write two synthetic ADR files into a temp directory.
	dir := t.TempDir()

	adr1 := `# ADR: First

## Invariant Delta

### Added

- id: test.first
  definition: First test invariant.
  verifier: spec/checks_test.go::TestFirst
  status: active

## Decision history (rationale notes)

First ADR.
`
	adr2 := `# ADR: Second

## Invariant Delta

### Added

- id: test.second
  definition: Second test invariant.
  verifier: spec/checks_test.go::TestSecond
  status: active

## Decision history (rationale notes)

Second ADR.
`
	// A non-ADR file — must be ignored (root-only glob: adr-*.md).
	nonADR := `# Not an ADR

## Some Section

Content.
`
	// A nested ADR file — must NOT be picked up (root only, no recursion).
	nestedDir := filepath.Join(dir, "subdir")
	if err := os.MkdirAll(nestedDir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	for name, content := range map[string]string{
		"adr-0001-first.md":  adr1,
		"adr-0002-second.md": adr2,
		"not-an-adr.md":      nonADR,
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	if err := os.WriteFile(filepath.Join(nestedDir, "adr-9999-nested.md"), []byte(adr1), 0644); err != nil {
		t.Fatalf("write nested ADR: %v", err)
	}

	// runWalkADRs is defined in verify.go by dev-harness.
	// It takes the adrDir path and returns one checkResult per ADR file parsed.
	results := runWalkADRs(dir)

	// Must have parsed exactly 2 files (adr-0001 and adr-0002); nested file excluded.
	if len(results) != 2 {
		t.Errorf("runWalkADRs returned %d results, want 2 (one per root adr-*.md file): %v", len(results), results)
	}

	// Every returned result must have Passed == true (both ADRs are well-formed).
	for _, r := range results {
		if !r.Passed {
			t.Errorf("result %q failed unexpectedly: %v", r.Name, r.Errors)
		}
	}
}
