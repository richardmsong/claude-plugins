package spec

import (
	"os"
	"path/filepath"
	"testing"
)

// writeADR writes content to a file named name in dir and returns the path.
func writeADR(t *testing.T, dir, name, content string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0644); err != nil {
		t.Fatalf("write ADR %s: %v", name, err)
	}
	return p
}

// wellFormedAddedBlock is a minimal ADR with a valid ### Added block.
const wellFormedAddedBlock = `# ADR: Test

## Invariant Delta

### Added

- id: test.sentinel
  definition: Sentinel invariant.
  verifier: spec/checks_test.go::TestSentinel
  status: active

## Decision history (rationale notes)

Added for testing.
`

// wellFormedWithdrawnBlock is a minimal ADR with a valid ### Withdrawn block.
const wellFormedWithdrawnBlock = `# ADR: Test

## Invariant Delta

### Added

- id: test.new_thing
  definition: New invariant.
  verifier: spec/checks_test.go::TestNewThing
  status: active

### Withdrawn

- test.old_thing
  Reason: superseded

## Decision history (rationale notes)

Withdrawn for testing.
`

// malformedAddedBlock is an ADR whose ### Added entry is missing required fields.
const malformedAddedBlock = `# ADR: Test

## Invariant Delta

### Added

- id: test.bad
  status: active

## Decision history (rationale notes)

Bad entry for testing.
`

// malformedWithdrawnBlock is an ADR whose ### Withdrawn entry is missing the reason.
const malformedWithdrawnBlock = `# ADR: Test

## Invariant Delta

### Added

- id: test.new_thing
  definition: New invariant.
  verifier: spec/checks_test.go::TestNewThing
  status: active

### Withdrawn

- test.old_thing

## Decision history (rationale notes)

Bad withdrawn for testing.
`

// adrWithNoDelta has no Invariant Delta section at all.
const adrWithNoDelta = `# ADR: Test

## Overview

This ADR has no delta section.

## Decision history (rationale notes)

Something.
`

// adrWithEmptyDelta has a delta section but no Added or Withdrawn entries.
const adrWithEmptyDelta = `# ADR: Test

## Invariant Delta

(none)

## Decision history (rationale notes)

Something.
`

// adrWithDecisionHistory has both a delta and a decision history section.
const adrWithDecisionHistory = `# ADR: Test

## Invariant Delta

### Added

- id: test.sentinel
  definition: Sentinel.
  verifier: spec/checks_test.go::TestSentinel
  status: active

## Decision history (rationale notes)

Rationale here.
`

// adrWithoutDecisionHistory is missing the decision history section.
const adrWithoutDecisionHistory = `# ADR: Test

## Invariant Delta

### Added

- id: test.sentinel
  definition: Sentinel.
  verifier: spec/checks_test.go::TestSentinel
  status: active
`

// TestCheckADRDeltaAddedBlock bounds methodology.validator.adr_delta_added_block.
//
// CheckADRDeltaAddedBlock must return a CheckError for every ADR whose
// ### Added block has malformed YAML entries (missing required fields), and
// no error for well-formed blocks.
func TestCheckADRDeltaAddedBlock(t *testing.T) {
	v := newValidator() // dev-harness defines newValidator() in spec/checks.go
	cases := []struct {
		name      string
		adrFiles  map[string]string // filename -> content
		wantCount int
	}{
		{
			name:      "well-formed Added block accepted",
			adrFiles:  map[string]string{"adr-0001-good.md": wellFormedAddedBlock},
			wantCount: 0,
		},
		{
			name:      "ADR with Added entry missing definition flagged",
			adrFiles:  map[string]string{"adr-0002-bad.md": malformedAddedBlock},
			wantCount: 1,
		},
		{
			name:      "ADR with no delta section accepted (not this validator's concern)",
			adrFiles:  map[string]string{"adr-0003-nodelta.md": adrWithNoDelta},
			wantCount: 0,
		},
		{
			name:      "empty adr dir accepted",
			adrFiles:  map[string]string{},
			wantCount: 0,
		},
		{
			name: "one good one bad",
			adrFiles: map[string]string{
				"adr-0001-good.md": wellFormedAddedBlock,
				"adr-0002-bad.md":  malformedAddedBlock,
			},
			wantCount: 1,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tc.adrFiles {
				writeADR(t, dir, name, content)
			}
			errs := v.CheckADRDeltaAddedBlock(nil, nil, nil, dir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckADRDeltaWithdrawnBlock bounds methodology.validator.adr_delta_withdrawn_block.
//
// CheckADRDeltaWithdrawnBlock must return a CheckError for every ADR whose
// ### Withdrawn block has malformed entries (missing id or reason), and no
// error for well-formed blocks.
func TestCheckADRDeltaWithdrawnBlock(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		adrFiles  map[string]string
		wantCount int
	}{
		{
			name:      "well-formed Withdrawn block accepted",
			adrFiles:  map[string]string{"adr-0001-good.md": wellFormedWithdrawnBlock},
			wantCount: 0,
		},
		{
			name:      "Withdrawn entry missing reason flagged",
			adrFiles:  map[string]string{"adr-0002-bad.md": malformedWithdrawnBlock},
			wantCount: 1,
		},
		{
			name:      "ADR with no delta section accepted",
			adrFiles:  map[string]string{"adr-0003-nodelta.md": adrWithNoDelta},
			wantCount: 0,
		},
		{
			name:      "empty adr dir accepted",
			adrFiles:  map[string]string{},
			wantCount: 0,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tc.adrFiles {
				writeADR(t, dir, name, content)
			}
			errs := v.CheckADRDeltaWithdrawnBlock(nil, nil, nil, dir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckADRRequiresDelta bounds methodology.validator.adr_requires_delta.
//
// CheckADRRequiresDelta must return a CheckError for every adr-*.md file that
// lacks a ## Invariant Delta section or whose section has no Added or Withdrawn
// entries; and no error for ADRs with a populated delta block.
func TestCheckADRRequiresDelta(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		adrFiles  map[string]string
		wantCount int
	}{
		{
			name:      "ADR with Added entries accepted",
			adrFiles:  map[string]string{"adr-0001-good.md": wellFormedAddedBlock},
			wantCount: 0,
		},
		{
			name:      "ADR with Withdrawn entries accepted",
			adrFiles:  map[string]string{"adr-0001-good.md": wellFormedWithdrawnBlock},
			wantCount: 0,
		},
		{
			name:      "ADR without delta section flagged",
			adrFiles:  map[string]string{"adr-0002-nodelta.md": adrWithNoDelta},
			wantCount: 1,
		},
		{
			name:      "ADR with empty delta section flagged",
			adrFiles:  map[string]string{"adr-0003-empty.md": adrWithEmptyDelta},
			wantCount: 1,
		},
		{
			name:      "empty adr dir accepted",
			adrFiles:  map[string]string{},
			wantCount: 0,
		},
		{
			name: "one good one bad",
			adrFiles: map[string]string{
				"adr-0001-good.md": wellFormedAddedBlock,
				"adr-0002-bad.md":  adrWithNoDelta,
			},
			wantCount: 1,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tc.adrFiles {
				writeADR(t, dir, name, content)
			}
			errs := v.CheckADRRequiresDelta(nil, nil, nil, dir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}

// TestCheckADRRequiresDecisionHistory bounds methodology.validator.adr_requires_decision_history.
//
// CheckADRRequiresDecisionHistory must return a CheckError for every adr-*.md
// file that lacks a ## Decision history (rationale notes) section, and no error
// when the section is present.
func TestCheckADRRequiresDecisionHistory(t *testing.T) {
	v := newValidator()
	cases := []struct {
		name      string
		adrFiles  map[string]string
		wantCount int
	}{
		{
			name:      "ADR with decision history accepted",
			adrFiles:  map[string]string{"adr-0001-good.md": adrWithDecisionHistory},
			wantCount: 0,
		},
		{
			name:      "ADR without decision history flagged",
			adrFiles:  map[string]string{"adr-0002-bad.md": adrWithoutDecisionHistory},
			wantCount: 1,
		},
		{
			name:      "empty adr dir accepted",
			adrFiles:  map[string]string{},
			wantCount: 0,
		},
		{
			name: "one good one bad",
			adrFiles: map[string]string{
				"adr-0001-good.md": adrWithDecisionHistory,
				"adr-0002-bad.md":  adrWithoutDecisionHistory,
			},
			wantCount: 1,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			for name, content := range tc.adrFiles {
				writeADR(t, dir, name, content)
			}
			errs := v.CheckADRRequiresDecisionHistory(nil, nil, nil, dir)
			if len(errs) != tc.wantCount {
				t.Errorf("got %d errors, want %d: %v", len(errs), tc.wantCount, errs)
			}
		})
	}
}
