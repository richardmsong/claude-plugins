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
		if !ValidMechanism(Mechanism(e.Mechanism)) {
			t.Errorf("Added[%s]: mechanism %q not in taxonomy", e.ID, e.Mechanism)
		}
		if e.Verifier == "" {
			t.Errorf("Added[%s]: verifier missing", e.ID)
		}
		if !ValidTier(Tier(e.Tier)) {
			t.Errorf("Added[%s]: tier %q not in {draft, active}", e.ID, e.Tier)
		}
	}
}

// TestADRDeltaModifiedBlock verifies methodology.adr_delta.modified_block.
func TestADRDeltaModifiedBlock(t *testing.T) {
	block := loadFixture(t)
	if len(block.Modified) == 0 {
		t.Fatal("expected ≥1 Modified entry in fixture")
	}
	for _, e := range block.Modified {
		if e.ID == "" {
			t.Errorf("Modified: id missing in entry %q", e.Raw)
		}
		switch e.RationaleClass {
		case "mechanical", "sharpening":
			// ok
		default:
			t.Errorf("Modified[%s]: rationale_class %q not in {mechanical, sharpening}", e.ID, e.RationaleClass)
		}
	}
}

// TestADRDeltaPromotedBlock verifies methodology.adr_delta.promoted_block.
func TestADRDeltaPromotedBlock(t *testing.T) {
	block := loadFixture(t)
	if len(block.Promoted) == 0 {
		t.Fatal("expected ≥1 Promoted entry in fixture")
	}
	for _, e := range block.Promoted {
		if e.ID == "" {
			t.Errorf("Promoted: id missing in entry %q", e.Raw)
		}
		if !ValidTier(Tier(e.FromTier)) {
			t.Errorf("Promoted[%s]: from_tier %q invalid", e.ID, e.FromTier)
		}
		if !ValidTier(Tier(e.ToTier)) {
			t.Errorf("Promoted[%s]: to_tier %q invalid", e.ID, e.ToTier)
		}
	}
}

// TestADRDeltaDeprecatedBlock verifies methodology.adr_delta.deprecated_block.
func TestADRDeltaDeprecatedBlock(t *testing.T) {
	block := loadFixture(t)
	if len(block.Deprecated) == 0 {
		t.Fatal("expected ≥1 Deprecated entry in fixture")
	}
	for _, e := range block.Deprecated {
		if e.ID == "" {
			t.Errorf("Deprecated: id missing in entry %q", e.Raw)
		}
		if e.Reason == "" {
			t.Errorf("Deprecated[%s]: reason missing", e.ID)
		}
	}
}

// TestADRDeltaSupersededBlock verifies methodology.adr_delta.superseded_block.
func TestADRDeltaSupersededBlock(t *testing.T) {
	block := loadFixture(t)
	if len(block.Superseded) == 0 {
		t.Fatal("expected ≥1 Superseded entry in fixture")
	}
	for _, e := range block.Superseded {
		if e.OldID == "" {
			t.Errorf("Superseded: old_id missing in entry %q", e.Raw)
		}
		if e.NewID == "" {
			t.Errorf("Superseded: new_id missing in entry %q", e.Raw)
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
