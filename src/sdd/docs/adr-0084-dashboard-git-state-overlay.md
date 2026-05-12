# ADR: Dashboard git-state overlay (uncommitted highlights + click-commit-to-diff)

**Status**: accepted
**Status history**:
- 2026-05-12: draft
- 2026-05-12: accepted — design audit CLEAN (Round 3); roundtrip CLEAN on all five verifiers

## Overview

Extend the docs-dashboard so that the rendered doc view can render two kinds of git diffs as an in-place line-highlight overlay: (1) the **working-tree diff** against HEAD — visualizing what the user has changed but not committed — and (2) a **historical commit diff** against its parent — surfaced when the user clicks a commit annotation in the blame gutter (ADR-0040). Both diffs are sourced through a single `git diff <left> <right> -- <file>` backend abstraction and rendered through the same overlay renderer in the frontend: added lines get a green background; removed lines are synthesized in place with a red strikethrough; modified lines get both. The working-tree overlay is always-on (it IS the uncommitted-highlights feature); the commit overlay is opt-in via a gutter click and exits via ESC or a second click on the same commit annotation.

## Motivation

ADR-0040 introduced a blame gutter (commit hash + author per line group) and a hover-popover with an expandable inline diff scoped to one block's lines. Two gaps remain:

1. **No visual signal for working-tree edits.** ADR-0040 says "uncommitted lines fall back to section-level lineage with `(working copy)` indicator" — the indicator is in the popover, not on the rendered content. A user editing the doc in their editor and previewing in the dashboard has no at-a-glance answer to "what have I changed but not committed?"
2. **No one-click 'show me this commit' interaction.** The gutter shows the commit hash, but the only way to see what the commit did is to hover the line, open the popover, click the ADR entry, and read a hunk scoped to one block. There's no "show me the whole file diff from this commit" affordance.

Both gaps are answered by the same primitive: a diff overlay rendered on top of the existing markdown view. Sharing the rendering pipeline keeps the surface tight and matches the user's intuition that "changes are changes" regardless of whether they're committed.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Diff display mode (commit-click) | Overlay: highlight changed lines in place (green for added/modified, red strikethrough for removed) | Preserves doc context; matches VS Code's diff-in-editor model. User selected this over panel + replacement modes. |
| Uncommitted detection mechanism | Shell to `git diff HEAD -- <file>` per `/api/blame` call | Accurate (no false positives from un-indexed recent commits). Replaces the current "lines not in `blame_lines`" heuristic in `findUncommittedLines`. |
| Diff source unification | Single backend abstraction `gitDiff(repoRoot, doc, left, right)` covers both working-tree (`left=HEAD, right=null` sentinel meaning working tree) and historical (`left=<commit>^, right=<commit>`). Same shell-out shape, same parser. | User said "this should be unified with how the historical git diffs are as well." One code path; one set of tests. |
| API shape | Extend `/api/diff`: `commit` and `line_start`/`line_end` become optional. When `commit` is absent and a new `working_tree=1` param is present, returns the working-tree diff vs HEAD for the whole file. When `commit` is present without `line_start`/`line_end`, returns the full-file diff of that commit vs parent. Existing range-scoped behavior preserved when both `commit` and `line_start`/`line_end` are set. | Backwards-compatible extension; one endpoint, three modes (range-scoped, full-commit, working-tree). Avoids endpoint sprawl. |
| Working-tree info in `/api/blame` | `/api/blame` response gains `uncommitted_lines: { line_start: number; line_end: number; kind: "added" \| "modified" }[]` derived from the same `git diff HEAD` call. The current `uncommitted_lines: number[]` (line numbers only) is REPLACED by the richer shape. | Frontend needs the kind to pick the highlight color; the backend already shells to git, so returning structured data is cheap. The replaced shape was the wrong abstraction (it conflated "no blame data" with "modified vs HEAD"). |
| Exit gesture (commit overlay) | ESC key OR clicking the same commit annotation again (toggle); clicking a different commit replaces the overlay | Standard modal-dismiss + toggle pattern. No dedicated close button — keeps the gutter the only diff control. |
| Always-on vs opt-in working-tree overlay | Always-on (when the file has any working-tree diff) | The feature IS visualizing uncommitted changes; making it opt-in defeats the purpose. The overlay is subtle (background color + WIP gutter marker) so it doesn't dominate when nothing is changed. |
| Stacking when both overlays active | They don't stack — they are mutually exclusive view modes. Working-tree overlay is the default whenever any WT edits exist. Clicking a commit annotation REPLACES the WT overlay with that commit's diff-vs-parent overlay (working-tree state ignored in commit-view). ESC or toggling the commit returns to the WT overlay (or to the plain rendered doc if no WT edits exist). | User clarified: "when I click on a commit, it should display THAT commit, diffed against its previous commit. Working tree should have nothing to do with it." Two independent modes; no layering. Removed-line synthesis becomes mechanical — the active diff is the only diff. |
| Removed-line rendering | Synthesize a strikethrough row (`<del>` with red background) injected in place between rendered blocks at the source line position | Faithful to a diff view; matches VS Code's in-editor diff behavior. The markdown→line-mapping attributes from ADR-0040 give us the insertion site. |
| Verifier strategy | Factor business logic into pure functions tested via Bun unit tests in `src/sdd/docs-dashboard/tests/`. Component code is a thin renderer; no fragile DOM tests needed. | User selected pure-function strategy over fixing the broken `ui/src/__tests__/` DOM environment. The DOM-env break is real but out of scope for this ADR. |
| Backend test placement | `tests/routes-diff.test.ts` (new) for the extended `/api/diff` modes; `tests/routes-blame.test.ts` (existing) extended for the new `uncommitted_lines` shape | Mirrors the existing test-per-route convention. |
| Frontend test placement | `tests/overlay-model.test.ts` (new) for `computeDiffOverlay`, `computeGutterModel`. Pure functions live next to UI code in `ui/src/lib/` but tests run under the dashboard's Bun test runner against the lib functions imported directly | Bun can import + test the lib functions without needing a DOM. The React components stay untested by this ADR. |
| Gutter marker for working-tree lines | A small colored bar (e.g. `▍` glyph or CSS pseudo-element) prepended to the gutter annotation, distinct from commit hashes | Distinguishes WIP rows at a glance without occupying a full annotation slot. |

## User Flow

### Working-tree overlay (always-on)

1. User opens any doc page in the dashboard.
2. Backend's `/api/blame` response includes `uncommitted_lines` (structured: `{line_start, line_end, kind}[]`).
3. Frontend ALSO calls `/api/diff?doc=<p>&working_tree=1` to fetch the unified diff text and feeds it through `parseUnifiedDiff` + `computeOverlay` (the same pipeline used for commit overlays — see "Diff source unification"). The merged `OverlayLine[]` drives the rendered view: `kind: "added"` rows get a green background; `kind: "removed"` rows get a synthesized strikethrough row inserted in place; `kind: "kept"` rows render as-is. The `uncommitted_lines` field is used by the gutter (not the body) — to identify which source lines deserve a `WIP` marker.
4. The gutter shows a `WIP` marker (a colored bar) on every line covered by an `uncommitted_lines` range — regardless of whether the line is `added` or `modified` in `kind` — instead of a commit hash.
5. When the user saves another edit (and the watcher fires SSE `reindex`), the overlay refreshes.

### Commit overlay (click-triggered)

6. User clicks a commit annotation in the blame gutter.
7. Frontend calls `/api/diff?doc=<p>&commit=<hash>` (no `line_start`/`line_end` → full-file mode).
8. Response is the unified diff for that commit vs its parent.
9. Frontend computes the overlay: for each `+` line in the diff, paint the corresponding source line green; for each `-` line, synthesize a red strikethrough line in place at the original position; for context lines, render normally.
10. Clicking the same commit annotation again removes the overlay. Pressing ESC removes it. Clicking a different commit replaces it.

### Mode switching (no stacking)

11. The two overlays are mutually exclusive view modes. The default is the working-tree overlay (always on when there are WT edits; otherwise no overlay). Clicking a commit annotation enters commit-view: the WT overlay is suppressed and replaced with the commit's diff-vs-parent overlay across the entire file. ESC or clicking the same commit again exits to the default. Clicking a different commit replaces the current commit overlay.

## Component Changes

### docs-dashboard (`src/routes.ts`)

- `handleBlame`: replace `findUncommittedLines` (which counted `wc -l`-vs-`blame_lines` negative space) with a new helper that shells `git diff HEAD -- <file>` and emits `{line_start, line_end, kind}` ranges. Response shape's `uncommitted_lines` field changes from `number[]` to `{line_start: number; line_end: number; kind: "added" | "modified"}[]`.
- `handleDiff`: make `line_start` and `line_end` optional. Add a new `working_tree=1` query param. Three modes:
  - `commit=<h>&line_start=<n>&line_end=<n>` → existing range-scoped commit diff.
  - `commit=<h>` (no range) → full-file commit-vs-parent diff.
  - `working_tree=1` → working-tree-vs-HEAD diff for the doc.
- New shared helper `gitDiff(repoRoot, docPath, left, right): string` that all three modes route through.

### docs-dashboard (`tests/routes-blame.test.ts` and new `tests/routes-diff.test.ts`)

- `routes-blame.test.ts` extended: `uncommitted_lines` shape now structured; tests assert kind detection (added vs modified).
- `routes-diff.test.ts` new: tests the three modes including `working_tree=1`.

### docs-dashboard frontend (`ui/src/lib/overlay-model.ts`, new)

Pure functions, no React imports:
- `parseUnifiedDiff(diffText: string): DiffLine[]` — input git diff text, output per-line records: `{kind: "added" | "removed" | "context", lineNo: number, content: string}`. `lineNo` carries the right-hand-side (new-file) line number for added and context records, the left-hand-side (old-file) line number for removed records — both sourced from the diff's `@@` hunk header.
- `computeOverlay(diff: DiffLine[], baseLines: string[]): OverlayLine[]` — merges base doc with diff into a renderable sequence: `{kind: "kept" | "added" | "removed", content: string, baseLineNo: number | null}`. ("modified" is not a separate output kind — modifications in a unified diff are represented as adjacent `removed` + `added` pairs, which the renderer styles together.)
- `computeGutterModel(blocks: BlameBlock[], uncommitted: UncommittedRange[]): GutterRow[]` — produces per-line gutter annotations with `WIP` markers taking precedence over commit hashes.

### docs-dashboard frontend (`ui/src/components/MarkdownView.tsx`, `BlameGutter.tsx`)

- `MarkdownView`: render `OverlayLine`s when an overlay is active. When inactive, render the plain markdown HTML. Overlay state is held at this component's level.
- `BlameGutter`: render `GutterRow`s. Gutter rows with `kind: "wip"` show a colored bar + `WIP` label; rows with a commit show the existing abbreviated hash + author. Click handler on commit rows toggles the overlay.

### docs-dashboard frontend (`tests/overlay-model.test.ts`, new — under tests/, not ui/)

Pure-function tests of `parseUnifiedDiff`, `computeOverlay`, `computeGutterModel`. No DOM needed.

## Data Model

No SQLite schema changes. `blame_lines` remains as-is; `uncommitted_lines` is computed live per blame request.

### API response shape changes

```ts
// BEFORE (ADR-0040):
interface BlameResponse {
  blocks: BlameBlock[];
  uncommitted_lines: number[];   // line numbers
}

// AFTER (this ADR):
interface UncommittedRange {
  line_start: number;
  line_end: number;
  kind: "added" | "modified";
}
interface BlameResponse {
  blocks: BlameBlock[];
  uncommitted_lines: UncommittedRange[];   // structured
}

// /api/diff response unchanged: { diff: string }
// New query modes documented above.
```

## Error Handling

| Failure | Behavior |
|---------|----------|
| `git diff HEAD` fails (e.g. `repoRoot` is not a real git repo) | `uncommitted_lines: []` — same fail-open behavior as today. No overlay. |
| `/api/diff?commit=<h>` (full-file mode) but the commit doesn't exist | Return `{ diff: "" }` (existing behavior). Frontend silently shows no overlay. |
| `/api/diff?working_tree=1` but `repoRoot` is unavailable | Return `{ diff: "" }`. Frontend shows no overlay. |
| Working-tree diff contains binary/no-newline markers | `parseUnifiedDiff` skips them (treats as context). Defensive against unusual git output. |

## Security

No new surfaces. Same local-only dashboard. Diffs are read-only from the local git repo.

## Impact

- `src/sdd/docs-dashboard/src/routes.ts` — `findUncommittedLines` rewritten; `handleDiff` extended; new `gitDiff` helper.
- `src/sdd/docs-dashboard/tests/routes-blame.test.ts` — extended for new shape.
- `src/sdd/docs-dashboard/tests/routes-diff.test.ts` — new.
- `src/sdd/docs-dashboard/ui/src/lib/overlay-model.ts` — new pure-function module.
- `src/sdd/docs-dashboard/ui/src/components/MarkdownView.tsx` — overlay rendering wired in.
- `src/sdd/docs-dashboard/ui/src/components/BlameGutter.tsx` — click handler + WIP marker.
- `src/sdd/docs-dashboard/tests/overlay-model.test.ts` — new pure-function verifier.
- `src/sdd/spec/registry.yaml` — new invariants.

## Scope

**In:**
- Working-tree overlay (always-on, always rendered when there's a `git diff HEAD` for the file).
- Commit overlay (click-triggered, ESC/toggle to exit).
- `git diff HEAD` and `git show <commit>` as unified diff source via one helper.
- Pure-function frontend logic with Bun unit tests.

**Out (deferred or never):**
- Side-by-side diff view (overlay is in-place only).
- Diff for changes across multiple commits (range-blame already covers "since X" / "on branch Y" in ADR-0040).
- Persistent overlay state across page reloads.
- Editing the doc from the dashboard.
- Fixing the broken `ui/src/__tests__/` DOM environment.
- **Overlay refresh on SSE reindex.** When the watcher fires `reindex` for the open doc, the working-tree overlay is not auto-refreshed. The user reloads to pick up the new state. Reason: SSE-driven refetch is a separate UX concern; this ADR lands the overlay primitive.
- **Mode state machine as a registered contract.** The ESC/toggle/click-different-commit transitions for the commit overlay are documented in User Flow and Decision history but not registered as an invariant. The state machine is small and verifying it requires React/DOM testing which is out of scope per the verifier-strategy decision. The pure-function tests cover what the components consume, not what the components do.
- **`gitDiff` helper unification as a registered contract.** The unification ("one shell-out path for working-tree and historical diffs") is rationale-only in Decision history; the contract that matters externally is the `/api/diff` mode set, which IS registered. The helper itself is an implementation detail of the backend that dev-harness can refactor freely so long as the three modes hold.

## Invariant Delta

### Added

```yaml
- id: methodology.dashboard.blame_uncommitted_lines_structured
  definition: The `/api/blame` response's `uncommitted_lines` field is an array of objects each with `line_start` (positive integer), `line_end` (positive integer ≥ line_start), and `kind` (`"added"` or `"modified"`), computed from `git diff HEAD -- <file>` when `repoRoot` is available, or `[]` when it is not.
  verifier: src/sdd/docs-dashboard/tests/routes-blame.test.ts
  requires:
    - methodology.dashboard.respects_configured_paths

- id: methodology.dashboard.diff_endpoint_three_modes
  definition: `/api/diff` returns the working-tree-vs-HEAD diff for the doc when invoked with `working_tree=1` and no `commit`; returns the full-file commit-vs-parent diff when invoked with `commit=<hash>` and both `line_start` and `line_end` absent; returns the range-scoped commit diff (existing ADR-0040 behavior) when invoked with `commit=<hash>` plus both `line_start` and `line_end` present; returns HTTP 400 for any other parameter combination including partial-range (exactly one of `line_start`/`line_end` present), missing `doc`, or invalid commit hash.
  verifier: src/sdd/docs-dashboard/tests/routes-diff.test.ts
  requires:
    - methodology.dashboard.respects_configured_paths

- id: methodology.dashboard.overlay_parser_classifies_lines
  definition: '`parseUnifiedDiff(diffText)` returns an array of `DiffLine` records where every `+` line in the input produces a record with `kind: "added"`, every `-` line produces a record with `kind: "removed"`, every context line (single-space prefix) produces a record with `kind: "context"`, with `lineNo` on each record matching the right-hand-side line number from the diff''s `@@` hunk header for added records, the right-hand-side line number for context records, the left-hand-side line number for removed records.'
  verifier: src/sdd/docs-dashboard/tests/overlay-model.test.ts::parseUnifiedDiff
  requires: []

- id: methodology.dashboard.overlay_merger_synthesizes_removals
  definition: '`computeOverlay(diff, baseLines)` returns an `OverlayLine[]` where added lines from the diff render with `kind: "added"` carrying the new-file line number as `baseLineNo`, context lines render with `kind: "kept"` carrying the new-file line number as `baseLineNo`, removed lines from the diff are inserted into the sequence with `kind: "removed"` plus `baseLineNo: null` at the position immediately following the preceding kept-or-added neighbor in the diff''s old-file ordering.'
  verifier: src/sdd/docs-dashboard/tests/overlay-model.test.ts::computeOverlay
  requires:
    - methodology.dashboard.overlay_parser_classifies_lines

- id: methodology.dashboard.gutter_wip_precedence
  definition: '`computeGutterModel(blocks, uncommitted)` returns a `GutterRow[]` where every line covered by an `uncommitted` range produces a row with `kind: "wip"` regardless of whether that line is also covered by a `blocks` entry, with every line covered only by a `blocks` entry producing a row with `kind: "commit"` carrying that block''s commit hash.'
  verifier: src/sdd/docs-dashboard/tests/overlay-model.test.ts::computeGutterModel
  requires:
    - methodology.dashboard.blame_uncommitted_lines_structured
```

### Withdrawn

(none)

## Decision history (rationale notes)

**Why one overlay renderer for both working-tree and commit.** The user explicitly said "this should be unified with how the historical git diffs are as well." Operationally they have the same shape: `git diff <left> <right> -- <file>` returns unified diff text; the frontend parser is mechanism-agnostic. Splitting them would duplicate the parser, the overlay-merge logic, and the gutter styling for no semantic gain — uncommitted edits ARE just a special case of "diff between two refs" where one ref is the working tree.

**Why replace `uncommitted_lines: number[]` with structured ranges.** ADR-0040's flat number list was just enough to power a "(working copy)" indicator in the popover, but it can't drive a visual overlay: the frontend needs to know which lines are *added* (synthesize green) vs *modified* (overlay amber on the existing render) vs *deleted* (synthesize a strikethrough at the original position). The structured shape carries exactly that and is backwards-incompatible-by-intent — the old shape was the wrong abstraction.

**Why always-on working-tree overlay (not opt-in).** Making it opt-in would defeat the feature's purpose: the user shouldn't have to remember to ask "what have I changed?" The overlay is the answer to a question that's implicit every time the user opens the dashboard mid-edit. Subtlety is the constraint — quiet background colors + WIP marker — not opt-in.

**Why ESC + same-click-toggle (not a close button).** A dedicated close button consumes UI real estate and creates ambiguity ("does clicking the commit again do something different than clicking close?"). ESC + toggle keeps the gutter the only diff control surface; users already trained on modal-ESC won't need to learn anything.

**Why pure-function verifier strategy.** The existing `ui/src/__tests__/` suite is broken (`ReferenceError: document is not defined`, ~125 failures) — fixing it is a non-trivial setup undertaking that would dwarf this ADR's actual content. Pure-function tests of `parseUnifiedDiff`, `computeOverlay`, `computeGutterModel` cover the logic that can actually go wrong (diff parsing, line-mapping, marker precedence); the React components become thin renderers whose correctness is testable by inspection. The DOM-env break is a separate concern, worth its own ADR.

**Why two view modes (no stacking) instead of layered overlays.** Initial draft proposed precedence rules where the working-tree overlay would "win" over the commit overlay on overlapping lines. User pushed back: "when I click on a commit, it should display THAT commit, diffed against its previous commit. Working tree should have nothing to do with it." Two-mode design is simpler, less ambiguous ("what am I looking at right now?"), and reflects the user's mental model: clicking a commit is a navigation action ("show me history"), not a layering action ("show me history on top of present").

**Why synthesize removed lines in place.** A gutter-only marker like `−3 lines deleted here` would be lower-fidelity but cleaner — no DOM injection mid-render. User chose synthesis for fidelity. Tradeoff accepted: the markdown→line-mapping attributes from ADR-0040 give us the insertion site; the synthesized rows are styled distinctly (`<del>` with red background) so they don't visually merge with the rendered content.

**Why five invariants instead of three.** A coarser split (e.g., one invariant per file: routes.ts, overlay-model.ts, gutter logic) would force compound definitions that combine multiple shape rules and would trip `methodology.registry.no_and_in_definition`. The five-invariant split puts one contract per behavior: API shape for blame, API modes for diff, parser classification, merger synthesis, gutter precedence. Each definition is a single-claim sentence; each verifier maps to a tight test surface.

**Why `OverlayLine` has no `"modified"` kind.** The Layer-1 design audit flagged a contradiction: User Flow step 3 said `kind: "modified"` rows would get amber background, but unified-diff semantics has no native "modified" — modifications are represented as adjacent `-`/`+` pairs. Either we collapse pairs into a synthetic "modified" kind (extra parser logic, ambiguous against non-adjacent changes) or we keep the diff's native representation and let CSS style adjacent `removed`/`added` rows as needed. Chose the latter: simpler parser, faithful to git's mental model, no fuzzy heuristics for "is this a modification or a delete-then-add?" The `"modified"` kind survives on `UncommittedRange` (the blame gutter) because the gutter does need to distinguish "newly-added line" from "edited existing line" for the WIP marker — a working-tree-only concern unrelated to the overlay merge.

**Why partial-range requests are 400 rather than treated as full-file.** The audit caught that pre-existing tests in `routes-blame.test.ts` already asserted 400 for `commit + only one of line_start/line_end`. Treating partial-range as "no range" (full-file mode) would silently change that contract and require the existing tests to be rewritten. The 400 response is the user-friendly fail-fast: telling the caller their request shape is malformed is more useful than guessing intent. The diff invariant's definition now spells out the 400 contract explicitly.

## Open questions

(none — all resolved)

## Integration Test Cases

| Test case | What it verifies | Setup/teardown | Components exercised |
|-----------|------------------|----------------|----------------------|
| `/api/blame` response includes `uncommitted_lines` with `kind` field | Backend shape | Temp git repo with a committed doc + working-tree edits | `routes.ts::handleBlame`, `gitDiff` helper |
| `/api/diff?commit=<h>` (no range) returns full-file commit diff | Backend mode | Temp git repo with a 2-commit history | `routes.ts::handleDiff` |
| `/api/diff?working_tree=1` returns working-tree-vs-HEAD diff | Backend mode | Temp git repo with working-tree edits | `routes.ts::handleDiff` |
| `parseUnifiedDiff` produces correct line records for added/removed/context | Frontend parser | None — pure function | `overlay-model.ts::parseUnifiedDiff` |
| `computeOverlay` synthesizes removed-line nodes at correct positions | Frontend merger | None — pure function | `overlay-model.ts::computeOverlay` |
| `computeGutterModel` prefers WIP marker over commit hash on overlapping lines | Frontend precedence | None — pure function | `overlay-model.ts::computeGutterModel` |

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `routes.ts` (gitDiff helper + handleDiff modes + handleBlame uncommitted) | ~100 | ~60k | Backend refactor + new modes |
| `routes-blame.test.ts` + `routes-diff.test.ts` | ~200 | ~70k | Backend test coverage |
| `overlay-model.ts` | ~120 | ~50k | Pure parser + merger + gutter model |
| `overlay-model.test.ts` | ~180 | ~60k | Pure-function verifier |
| `MarkdownView.tsx` + `BlameGutter.tsx` | ~120 | ~80k | Wire pure functions into components; click handler |

**Total estimated tokens:** ~320k
**Estimated wall-clock:** ~90 min
