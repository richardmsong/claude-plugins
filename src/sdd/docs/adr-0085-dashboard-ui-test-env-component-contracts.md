# ADR: Dashboard UI test gate + component-rendering contracts

**Status**: draft
**Status history**:
- 2026-05-12: draft

## Overview

ADR-0084 introduced a new backend response shape (`uncommitted_lines: UncommittedRange[]`) and a new pure-function module (`ui/src/lib/overlay-model.ts`), but did not register any contract requiring `MarkdownView` / `BlameGutter` to consume them. Dev-harness consequently shipped a working backend + pure-function library with the React components still consuming the old shape — a real regression that would silently break the "(working copy)" indicator on dashboard restart.

The root cause is a verifier-strategy hole: ADR-0084 deliberately punted on component testing because the UI test suite under `ui/src/__tests__/` was assumed to be broken. Investigation reveals the suite is actually mostly healthy when run from the `ui/` directory (happy-dom is wired via `ui/bunfig.toml`'s preload of `bun-test-setup.ts`); 85 of 137 tests pass. The methodology's `verify[]` chain just doesn't invoke it. This ADR closes both gaps in one pass: (1) bring the UI test suite under the methodology's verify gate, (2) register the missing component contracts that bound the ADR-0084 wiring, (3) triage the 52 stale failures so the gate can actually go green.

## Motivation

Two concrete failures motivate this ADR:

1. **Silent component drift.** ADR-0084's pure-function unit tests passed; the components silently kept reading the old `uncommitted_lines: number[]` shape. Restart-then-discover is the failure mode.
2. **`verify[]` blind spot.** `cd src/sdd/docs-dashboard && bun test tests/` passes 134/134 — but only because `tests/` excludes `ui/src/__tests__/`. There's no methodology-enforced gate that exercises the React layer. Any breaking change to a component goes undetected.

A third concern, surfaced during this draft: the existing 52 failures in `ui/src/__tests__/` are not from a missing DOM environment (that's already wired). They're real test-vs-component drift accumulated since ADR-0040/0041. They have to be triaged before the suite can serve as a gate.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DOM environment | Keep the existing happy-dom via `@happy-dom/global-registrator` preloaded by `ui/bunfig.toml` | Already in place; was working when run from `ui/`. No replacement needed. |
| Verify chain inclusion | Append `cd src/sdd/docs-dashboard/ui && bun test src/__tests__/` to `spec-driven-config.json`'s `verify[]` | Brings UI tests under the methodology gate. The `cd` is required so `ui/bunfig.toml`'s `preload` fires correctly. |
| Treatment of existing 52 failures | Per-test triage applying ADR-0078's contract-surface rule: each failing test either gets bound to a newly-registered invariant (because the test asserts a real contract worth tracking) or gets deleted (because it tests an implementation detail or describes superseded behavior). Zero of the 52 are currently bound to registered invariants — they are orphan test prose under ADR-0078. | The user's framing: "govern them through the same process." Orphan tests in the verify chain are noise; the registry is the contract surface. The triage answers per-test "is this a real contract?" |
| Component contracts to register | 4 invariants as drafted: UI verify-chain inclusion, MarkdownView consumes structured uncommitted, BlameGutter renders WIP marker, BlameGutter commit click dispatches overlay state. | The click-state-machine spans three transitions (enter/exit/replace) but they share one callback + state-machine surface — splitting into three invariants would fragment failures without adding signal. |
| Extending tests_bound_to_registry to UI dir | Out of scope for this ADR — noted as follow-up. The 85 currently-passing UI tests remain orphan under the current `tests_bound_to_registry` rule (scoped to `<project>/spec/`). | The full sweep would force registering or deleting 85+ tests in one pass, which exceeds this ADR's scope. The triage of the 52 *failing* tests is the wedge; the broader sweep can land afterward when the cost/benefit is clearer. |
| Verifier file location | Component tests live next to the components in `ui/src/__tests__/<Component>.test.tsx` (existing convention) | Established pattern; tooling already supports it. |
| Wire-verification style | Behavioral tests against rendered DOM (existing pattern with React Testing Library) | Higher fidelity than static grep checks. The DOM env is there; use it. |

## User Flow

This ADR has no user-visible flow of its own — it registers contracts and adds tests. The user-visible flow it *enables* is the ADR-0084 flow (working-tree overlay + click-commit-to-diff), which becomes wired in the dev-harness pass that follows this ADR.

## Component Changes

### `spec-driven-config.json`
- Append one entry to `verify[]`: `"cd src/sdd/docs-dashboard/ui && bun test src/__tests__/"`.

### `src/sdd/docs-dashboard/ui/src/__tests__/MarkdownView.test.tsx` (extend)
- New describe block asserting MarkdownView consumes `uncommitted_lines: UncommittedRange[]` and renders overlay rows with CSS classes matching `OverlayLine.kind`.

### `src/sdd/docs-dashboard/ui/src/__tests__/BlameGutter.test.tsx` (extend)
- New describe block asserting BlameGutter renders WIP markers from `uncommitted_lines` ranges (regardless of whether the same line has a commit block) and fires the right callback when a commit row is clicked (toggle/replace/exit).

### Existing `ui/src/__tests__/*.test.tsx` (triage)
- Fix or remove the 52 currently-failing tests. Triage details depend on the answer to the second open question.

## Data Model

No schema changes.

## Error Handling

When `cd ui && bun test src/__tests__/` fails, `sdd verify && verify[]` returns non-zero. The methodology's existing fail-fast contract applies.

## Security

None.

## Impact

- `spec-driven-config.json` — one new `verify[]` entry.
- `src/sdd/docs-dashboard/ui/src/__tests__/MarkdownView.test.tsx` — new test cases.
- `src/sdd/docs-dashboard/ui/src/__tests__/BlameGutter.test.tsx` — new test cases.
- Existing UI test files — fixes/deletions for the 52 stale failures (scope depends on triage decision).
- `src/sdd/spec/registry.yaml` — new invariants for the UI gate + component contracts.

## Scope

**In:**
- UI test suite enters the methodology's verify gate.
- Component-rendering contracts cover ADR-0084's `MarkdownView` / `BlameGutter` wiring.
- Triage of the 52 currently-failing UI tests (path depends on Q&A).

**Out:**
- Re-architecting how components fetch data (component contracts assert on rendered output, not on fetch internals).
- Replacing happy-dom with a different DOM env (current setup works).
- Wiring the components themselves — that's the post-ADR dev-harness pass.

## Invariant Delta

### Added

```yaml
- id: methodology.dashboard.ui_tests_in_verify_chain
  definition: '`spec-driven-config.json`''s `verify[]` includes a command that runs the UI Bun test suite (`cd src/sdd/docs-dashboard/ui && bun test src/__tests__/`) so component regressions fail the methodology gate.'
  verifier: src/sdd/spec/checks_config_test.go::TestVerifyArrayIncludesUITests
  requires:
    - methodology.config.verify_array_well_formed

- id: methodology.dashboard.markdown_view_consumes_structured_uncommitted
  definition: '`MarkdownView` renders working-tree lines from the `uncommitted_lines: UncommittedRange[]` prop, applying a CSS class corresponding to `OverlayLine.kind` (`added` or `removed`) computed via `parseUnifiedDiff` + `computeOverlay` from `ui/src/lib/overlay-model.ts`.'
  verifier: src/sdd/docs-dashboard/ui/src/__tests__/MarkdownView.test.tsx::renders working-tree overlay
  requires:
    - methodology.dashboard.blame_uncommitted_lines_structured
    - methodology.dashboard.overlay_merger_synthesizes_removals

- id: methodology.dashboard.blame_gutter_renders_wip_marker
  definition: When `BlameGutter` receives an `uncommitted_lines` range covering line N, the rendered gutter row for line N carries a `wip`-themed CSS class regardless of whether a `blocks` entry also covers line N, computed via `computeGutterModel` from `ui/src/lib/overlay-model.ts`.
  verifier: src/sdd/docs-dashboard/ui/src/__tests__/BlameGutter.test.tsx::renders WIP marker
  requires:
    - methodology.dashboard.gutter_wip_precedence

- id: methodology.dashboard.blame_gutter_commit_click_dispatches_overlay_state
  definition: '`BlameGutter` fires the `onCommitClick` callback with the clicked block''s commit hash; the consuming `MarkdownView` enters commit-overlay mode for that hash on first click, exits on a second click of the same hash, replaces with the new hash when a different commit is clicked.'
  verifier: src/sdd/docs-dashboard/ui/src/__tests__/BlameGutter.test.tsx::commit click dispatches overlay state
  requires: []
```

### Withdrawn

(none)

## Decision history (rationale notes)

**Why this ADR exists at all.** ADR-0084 chose a pure-function verifier strategy to avoid the (then-believed-broken) `ui/src/__tests__/` suite. The actual breakage was a CWD bug: `ui/bunfig.toml`'s preload only fires when run from `ui/`. Investigation showed 85/137 tests pass cleanly; the DOM env was never the problem. The pure-function strategy still has merit for the parser/merger/gutter logic — those are correctly tested at that level — but it left the component wiring uncovered, which is exactly where the regression landed.

**Why bring the UI test command into `verify[]` rather than a separate gate.** The methodology's verify chain is the single source of truth for "what does `/feature-change` check before declaring victory." Splitting into multiple gates (Go for invariants, dashboard server-side, UI components) and discovering after the fact that one was skipped is precisely the failure mode this ADR exists to prevent.

**Why triage the 52 failing tests as bind-or-delete instead of fix-all.** The user's instinct — "how many are pinned by invariants? govern them through the same process" — is the right methodological framing. Under ADR-0078, tests that aren't bound to registered invariants are orphan prose; they're not part of the contract surface. Spending effort "fixing" a stale orphan test would reify a contract we never registered. The right move per test is: if its assertion expresses a contract worth tracking, register a new invariant and let the existing test be its verifier; if it doesn't, delete it. The dev-harness pass that follows this ADR will execute that per-test decision.

**Why not extend `tests_bound_to_registry` to the UI dir in this ADR.** The 85 currently-passing UI tests are also orphan under ADR-0078 (none are bound to registered invariants). Extending the rule would force a bind-or-delete decision on all 137 tests in this single workstream, which is more cleanup than the immediate need warrants. The triage of the *failing* 52 is the wedge: it brings the most-broken tests under the methodology while leaving the passing-but-orphan tests in their current state. A follow-up ADR can extend the rule later when the bind-or-delete cost is better understood.

## Open questions

(none — all resolved)

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| `cd ui && bun test src/__tests__/` returns 0 | UI gate runs | None | full UI test suite |
| MarkdownView mounted with `uncommitted_lines: [{line_start:5,line_end:5,kind:"added"}]` renders line 5 with the `overlay-added` class | Component contract | RTL render with mocked fetch | MarkdownView, overlay-model |
| BlameGutter mounted with `uncommitted_lines: [{line_start:3,line_end:3,kind:"modified"}]` and `blocks: [{line_start:1,line_end:5,commit:"abc",...}]` renders line 3 with the `gutter-wip` class | Component contract | RTL render | BlameGutter, overlay-model |
| Clicking a commit row in BlameGutter calls `onCommitClick("abc1234")` | Component contract | RTL render + userEvent | BlameGutter |
| Clicking the same commit twice fires enter then exit | Component contract | RTL render + userEvent | BlameGutter |
| Clicking a different commit fires replace | Component contract | RTL render + userEvent | BlameGutter |

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `spec-driven-config.json` verify[] | 1 | ~5k | One new entry. |
| MarkdownView.test.tsx new describe block | ~80 | ~40k | Working-tree overlay rendering. |
| BlameGutter.test.tsx new describe block | ~120 | ~50k | WIP marker + click state machine. |
| Triage existing 52 failures | scope depends on Q&A | ~50–200k | Could be small or large. |
| `MarkdownView.tsx` wiring (dev-harness, after ADR accepted) | ~80 | ~80k | Consume new shape, call computeOverlay. |
| `BlameGutter.tsx` wiring (dev-harness, after ADR accepted) | ~80 | ~60k | WIP markers + click handler + state machine. |
| `src/sdd/spec/checks_config_test.go` extension | ~30 | ~20k | New invariant verifier. |

**Total estimated tokens:** ~255–405k depending on triage scope
**Estimated wall-clock:** 60–120 min
