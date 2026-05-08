# ADR: Fixture for delta block parsing tests

**Status**: draft

## Overview

Test fixture exercising every sub-block kind of the Invariant Delta block.

## Invariant Delta

### Added
- methodology.test.fixture_added
  Definition: Every fixture entry parses cleanly.
  Mechanism: schema
  Verifier: fixture_test.go::TestFixture
  Tier: draft
  Requires: []

### Modified
- methodology.test.fixture_modified
  Class: sharpening

### Promoted
- methodology.test.fixture_promoted
  From_tier: draft
  To_tier: active

### Deprecated
- methodology.test.fixture_deprecated
  Reason: superseded by a newer invariant

### Superseded
- methodology.test.fixture_old → methodology.test.fixture_new
  Rationale: contract changed substantively

### Withdrawn
- methodology.test.fixture_withdrawn
  Reason: experiment did not pan out
