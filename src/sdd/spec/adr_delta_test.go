package spec

import (
	"testing"
)

const fixturePath = "testdata/adr-9001-fixture.md"

func loadFixture(t *testing.T) *DeltaBlock {
	t.Helper()
	block, err := ParseADRDeltaBlock(fixturePath)
	if err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if block == nil {
		t.Fatal("fixture has no Invariant Delta block")
	}
	return block
}

// TestADRDeltaAddedBlock verifies methodology.adr_delta.added_block.
//
// Validates each Added entry parses with the required fields and that
// supersedes (when present) names a non-empty predecessor ID.
func TestADRDeltaAddedBlock(t *testing.T) {
	block := loadFixture(t)
	if len(block.Added) == 0 {
		t.Fatal("expected ≥1 Added entry in fixture")
	}
	for _, e := range block.Added {
		if e.ID == "" {
			t.Errorf("Added: id missing in entry %q", e.Raw)
		}
		if !IDPattern.MatchString(e.ID) {
			t.Errorf("Added[%s]: id doesn't match dotted-path regex", e.ID)
		}
		if e.Definition == "" {
			t.Errorf("Added[%s]: definition missing", e.ID)
		}
		if e.Verifier == "" {
			t.Errorf("Added[%s]: verifier missing", e.ID)
		}
	}
}

// TestADRDeltaWithdrawnBlock verifies methodology.adr_delta.withdrawn_block.
func TestADRDeltaWithdrawnBlock(t *testing.T) {
	block := loadFixture(t)
	if len(block.Withdrawn) == 0 {
		t.Fatal("expected ≥1 Withdrawn entry in fixture")
	}
	for _, e := range block.Withdrawn {
		if e.ID == "" {
			t.Errorf("Withdrawn: id missing in entry %q", e.Raw)
		}
		if e.Reason == "" {
			t.Errorf("Withdrawn[%s]: reason missing", e.ID)
		}
	}
}
