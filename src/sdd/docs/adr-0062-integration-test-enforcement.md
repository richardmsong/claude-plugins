# ADR: Integration Test Enforcement in SDD Pipeline

**Status**: implemented
**Status history**:
- 2026-04-28: draft
- 2026-04-28: accepted — paired with spec-agents.md
- 2026-04-28: implemented — all scope CLEAN

## Overview

Add mandatory integration test case requirements to the SDD pipeline. Every ADR that touches runtime behavior must declare integration test cases in a new `## Integration Test Cases` section. The implementation-evaluator flags missing integration tests as gaps. The dev-harness implements the declared test cases against real infrastructure (deployed cluster, operator-mode NATS, real DB) — not mocked dependencies.

## Motivation

A critical bug shipped undetected: user JWTs were missing `$JS.API.>` permissions, preventing the SPA from accessing NATS KV buckets. The existing integration tests used testcontainers with a vanilla NATS server (no operator mode), so they couldn't catch JWT permission enforcement failures. The implementation-evaluator's Phase 3 (test coverage) didn't distinguish between "tests exist" and "tests exercise the real auth chain." The result: the `+` button in the SPA silently did nothing because `projects.length === 0`.

This gap exists because:
1. The ADR template has no place to declare integration test cases
2. The implementation-evaluator doesn't flag `UNIT_ONLY` as a gap for auth/data-flow code
3. The dev-harness doesn't know to look for ADR-declared test cases
4. There's no definition of what "integration test" means (real infra vs testcontainers)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to declare test cases | `## Integration Test Cases` section in every ADR | ADRs are the decision record; test cases are part of the decision. Implementation-evaluator can cross-reference. |
| What counts as an integration test | Tests against real deployed infrastructure (real cluster, operator-mode NATS, real DB) | Testcontainers with vanilla NATS can't catch JWT permission bugs — the whole class of failure that motivated this ADR. |
| Which ADR categories require test cases | Any ADR touching auth, data flow, API endpoints, KV/DB state, or cross-component communication | Cosmetic/docs-only changes don't need integration tests. |
| How evaluator enforces | Flag `UNIT_ONLY` as a gap for critical-path spec lines; cross-reference ADR test cases against actual test implementations | Catches both "no integration test exists" and "ADR says test X should exist but it doesn't" |
| How dev-harness implements | Read ADR `## Integration Test Cases` section, implement each as a real-infrastructure test | Keeps test cases traceable from decision to implementation |

## User Flow

1. Author writes ADR via `/plan-feature` — template now includes `## Integration Test Cases` table
2. Author fills in test cases: what each verifies, setup/teardown, components exercised
3. Dev-harness reads ADR, implements the declared test cases against real infrastructure
4. Implementation-evaluator verifies: (a) critical-path spec lines have integration tests, (b) ADR-declared test cases have matching implementations
5. Any missing test = gap, loop continues until CLEAN

## Component Changes

### plan-feature skill (SKILL.md)
- Add `## Integration Test Cases` section to ADR template, between `## Open questions` and `## Implementation Plan`
- Include table columns: Test case | What it verifies | Setup/teardown | Components exercised
- Add guidance: ADRs touching runtime behavior MUST list test cases; cosmetic/docs-only may skip with a note

### feature-change skill (SKILL.md)
- Add `## Integration Test Cases` to the shorter ADR template (minimum content) with columns: `Test case | What it verifies | Components exercised` (3 columns — the shorter template omits `Setup/teardown` for brevity)
- Add note that every ADR touching runtime behavior must include at least one integration test case

### implementation-evaluator agent
- Phase 3 strengthened: define "integration test bar" for critical paths (auth, data flow, cross-component, API, bootstrap)
- Flag `UNIT_ONLY` as a gap with direction `CODE→FIX` for critical-path spec lines. This changes the `CLEAN` condition: a component with `UNIT_ONLY` verdicts on critical-path lines is NOT clean.
- Define what counts: real infrastructure, not testcontainers with vanilla config
- Cross-reference ADR `## Integration Test Cases` against test implementations
- Phase 3 table schema changes: the existing `E2E test` column is replaced by `Integration test` (which covers both integration and e2e). A new `Notes` column is added after `Verdict`. The new columns are: `Spec (doc:line) | Spec text | Unit test | Integration test | Verdict | Notes`

### dev-harness agent
- Phase 2 (test coverage audit): check ADR `## Integration Test Cases` section for required tests
- Integration test definition clarified: real DB, real NATS with operator-mode JWT, real cluster
- Testcontainers with vanilla NATS explicitly called out as insufficient for auth-related tests

## Impact

Updates `docs/spec-agents.md` — the implementation-evaluator's Phase 3 behavior changes.

Components:
- `src/sdd/.agent/skills/plan-feature/SKILL.md`
- `src/sdd/.agent/skills/feature-change/SKILL.md`
- `src/sdd/.agent/agents/implementation-evaluator.md`
- `src/sdd/.agent/agents/dev-harness.md`

## Scope

**In v1:**
- ADR template additions (both plan-feature and feature-change)
- Implementation-evaluator Phase 3 strengthening
- Dev-harness awareness of ADR test cases
- spec-agents.md update

**Deferred:**
- Automated CI enforcement (run integration tests in pipeline) — project-specific, not SDD-generic
- Test harness scaffolding (port-forward helpers, test user lifecycle) — project-specific
- Backfilling integration test cases into existing ADRs — done per-project via `/feature-change`

## Integration Test Cases

No integration tests — change is process/docs-only (skill and agent instruction updates, no runtime code).

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| plan-feature SKILL.md | ~15 lines | N/A (manual edit) | Template addition |
| feature-change SKILL.md | ~10 lines | N/A (manual edit) | Template addition |
| implementation-evaluator.md | ~25 lines | N/A (manual edit) | Phase 3 strengthening |
| dev-harness.md | ~10 lines | N/A (manual edit) | Test case awareness |
| spec-agents.md | ~5 lines | N/A (manual edit) | Spec update |

**Total estimated tokens:** ~0 (all changes are to markdown skill/agent instructions, no code generation needed)
**Estimated wall-clock:** 15 minutes manual edits
