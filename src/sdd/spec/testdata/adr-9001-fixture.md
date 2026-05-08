# ADR: Fixture for delta block parsing tests

**Status**: draft

## Overview

Test fixture exercising the two sub-block kinds of the Invariant Delta block
under the post-collapse model: Added (with optional supersedes) and Withdrawn.

## Invariant Delta

### Added
- methodology.test.fixture_added
  Definition: A simple fixture invariant.
  Verifier: fixture_test.go::TestFixture
  Requires: []

- methodology.test.fixture_supersession
  Definition: Replacement for the old fixture.
  Verifier: fixture_test.go::TestFixture
  Requires: []
  Supersedes: methodology.test.fixture_legacy

### Withdrawn
- methodology.test.fixture_withdrawn
  Reason: experiment did not pan out
