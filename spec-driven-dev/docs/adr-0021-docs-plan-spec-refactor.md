# ADR: Separate ADRs from Specs in `docs/`

**Status**: implemented
**Status history**:
- 2026-04-19: accepted
- 2026-04-22: implemented — retroactive promotion, all scope verified

## Overview

Refactor `docs/` to distinguish two kinds of documents with different lifecycles:

- **ADRs** (architectural decision records): dated, immutable, one per feature or change. They capture *why* a change was made.
- **Specs** (cross-cutting references): living, present-tense descriptions of the current design. They capture *what is true now*.

The current layout conflates the two: `docs/plan-*.md` files contain a mix of feature proposals (ADR-shaped) and living references (`plan-state-schema.md`, `ui-spec.md`). This ADR establishes the new layout, renames existing files, and updates the `mclaude-docs-mcp` classifier plus all skill/agent workflows to match.

## Motivation

Every new feature request effectively is an ADR — a dated decision with a scope. But several "feature" decisions also have cross-cutting impact (data schema, NATS subjects, UI patterns) that every future feature must stay consistent with. Today, to understand current behavior, an agent re-reads every `docs/plan-*.md` and reconciles overlapping claims. This is token-hungry and error-prone.

The `mclaude-docs-mcp` server (ADR `adr-0015-docs-mcp.md`) was the first step: git co-modification becomes lineage, so "which ADRs shaped this spec section" is a `get_lineage` query, not a re-read. Lineage only pays off once the filesystem actually distinguishes ADRs from specs. This ADR does that.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ADR naming | `docs/adr-YYYY-MM-DD-<slug>.md` | Dated prefix makes chronology visible at a glance; no counter file required. |
| Spec naming | `docs/spec-<concern>.md` | No date — specs are living. Concern-level granularity (state-schema, ui, tailscale-dns) rather than per-component for v1. |
| Date source for existing files | First-commit date via `git log --reverse --format=%ad --date=short -- <path>` | Preserves actual chronology. Untracked files use today's date. |
| Content policy for renamed ADRs | Mechanical path updates OK (cross-references to renamed files). Semantic content stays as-written-then, even if later superseded. | ADRs are historical records. Later decisions supersede, not overwrite. |
| Content policy for renamed specs | Update freely — specs are living. Remove text that referenced the old `plan-*` glob. | Specs are present-tense. |
| Cross-cutting specs only, v1 | Per-concern, not per-component. No `spec-session-agent.md`, etc., until a clear cross-cutting concern emerges. | Avoid premature partitioning. The existing `spec-state-schema.md` style (span all components) is the model. |
| Workflow change | `/feature-change` writes a new ADR per request (even for bug fixes / refactors), updates impacted specs in the same commit | The co-commit IS the lineage edge that the docs MCP indexes. No ADR per request → no lineage. |
| Audit folder (`.agent/audits/`) | Untouched | It is the spec-evaluator's output log (audit artifact for posterity), not a source of truth. |
| Handling of superseded decisions inside old ADRs | Add a one-line "Superseded by …" note at the top of the affected ADR, pointing to the newer ADR. Do not rewrite history. | Readers see the original reasoning; the pointer tells them where to look for current behavior. |

## File Moves

### Specs (rename `plan-*` / `ui-spec` → `spec-*`)

| Old path | New path |
|----------|----------|
| `docs/plan-state-schema.md` | `docs/spec-state-schema.md` |
| `docs/ui-spec.md` | `docs/spec-ui.md` |
| `docs/spec-tailscale-dns.md` | *(unchanged — already correct)* |

### ADRs (rename `plan-*` / `*-proposal` / `*-plan` → `adr-YYYY-MM-DD-*`)

| Old path | New path |
|----------|----------|
| `docs/telemetry-proposal.md` | `docs/adr-0001-telemetry.md` |
| `docs/plan-k8s-integration.md` | `docs/adr-0003-k8s-integration.md` |
| `docs/multi-laptop-plan.md` | `docs/adr-0004-multi-laptop.md` |
| `docs/pluggable-cli-plan.md` | `docs/adr-0005-pluggable-cli.md` |
| `docs/plan-core-containers.md` | `docs/adr-0002-core-containers.md` |
| `docs/plan-client-architecture.md` | `docs/adr-0006-client-architecture.md` |
| `docs/plan-github-oauth.md` | `docs/adr-0007-github-oauth.md` |
| `docs/plan-graceful-upgrades.md` | `docs/adr-0008-graceful-upgrades.md` |
| `docs/plan-quota-aware-scheduling.md` | `docs/adr-0009-quota-aware-scheduling.md` |
| `docs/plan-scratch-to-git.md` | `docs/adr-0010-scratch-to-git.md` |
| `docs/plan-multi-cluster.md` | `docs/adr-0011-multi-cluster.md` |
| `docs/plan-replay-user-messages.md` | `docs/adr-0012-replay-user-messages.md` |
| `docs/plan-reconciler-env-sync.md` | `docs/adr-0013-reconciler-env-sync.md` |
| `docs/plan-controller-separation.md` | `docs/adr-0014-controller-separation.md` |
| `docs/plan-docs-mcp.md` | `docs/adr-0015-docs-mcp.md` |
| `docs/plan-nats-security.md` | `docs/adr-0016-nats-security.md` |
| `docs/plan-token-insights.md` | `docs/adr-0017-token-insights.md` |
| `docs/plan-backgrounded-shells.md` | `docs/adr-0019-backgrounded-shells.md` |

### Unchanged

| Path | Reason |
|------|--------|
| `docs/feature-list.md` | Inventory, not an ADR or spec. |
| `docs/adr-0021-docs-plan-spec-refactor.md` | This file. |

## `mclaude-docs-mcp` Changes

The docs MCP classifier (`mclaude-docs-mcp/src/parser.ts`) and tool parameter enums must match the new layout.

### Classifier

```
Filename prefix    → Category
adr-*              → 'adr'
spec-*             → 'spec'
feature-list*      → 'spec'
everything else    → null
```

The `'design'` category name is removed. Migration is breaking — no external consumers exist yet.

### Tool parameter enums

`search_docs` and `list_docs` both accept `category: 'adr' | 'spec'` (was `'design' | 'spec'`).

### Tests

Tests that assert category names must update: `'design'` → `'adr'`, `plan-*` fixture filenames → `adr-*`.

## Workflow Change: `/feature-change`

The `/feature-change` loop is updated:

**Old loop** (single spec file, updated in place):
1. Read design doc for the affected area.
2. Classify change (A/B/C/D).
3. If C, update the design doc, commit spec separately.
4. `/dev-harness <component>` → `/spec-evaluator <component>` loop until CLEAN.

**New loop** (ADR per request, specs updated in parallel):
1. Read the relevant spec(s) and any related ADRs (via `docs` MCP `search_docs` / `get_lineage`).
2. Classify change (A/B/C/D).
3. **Always author a new ADR** at `docs/adr-YYYY-MM-DD-<slug>.md` describing the request and its rationale. Even bug fixes and refactors get an ADR — that is the lineage edge.
4. If the change has cross-cutting impact (state schema, UI contract, DNS, etc.), update the relevant `spec-*.md` **in the same commit** as the ADR. Co-committing is what the docs MCP reads as the lineage relationship.
5. `/dev-harness <component>` → `/spec-evaluator <component>` loop until CLEAN.

The single-commit rule for ADR + impacted specs is load-bearing — without it, `get_lineage` cannot surface the ADRs that shaped a given spec section.

### Classification under the new model

| Class | Meaning | ADR needed? | Spec update? |
|-------|---------|-------------|--------------|
| A — bug | Spec correct, code wrong | Yes — records the bug and fix rationale | No |
| B — new feature | No spec/ADR covers it | Yes — authored via `/plan-feature` | Yes, if cross-cutting |
| C — behavior change / spec gap | Spec needs update | Yes | Yes |
| D — refactor | Behavior unchanged | Yes — records why | Usually no |

Under the new model there is no "skip the spec step" — every request produces at minimum an ADR.

## Audit Folder

`.agent/audits/*.md` files are the output of the `spec-evaluator` and `design-evaluator` agents. They are append-only audit artifacts (evidence that evaluations happened). This refactor does **not** touch them. Their internal references to old `docs/plan-*.md` paths stay as-written — rewriting them would falsify the historical record.

The evaluators (`spec-evaluator`, `design-evaluator`) are updated to read from the new paths going forward; past audit entries remain frozen.

## Skills and Agents Updated

| File | Change |
|------|--------|
| `.agent/skills/feature-change/SKILL.md` | New loop; new file/path table; master-session write-list updated to `adr-*`, `spec-*`. |
| `.agent/skills/plan-feature/SKILL.md` | "Design doc" → "ADR". New file path `adr-YYYY-MM-DD-<slug>.md`. Step 4 "choose the right home" table updated. |
| `.agent/skills/design-audit/SKILL.md` | Default target is most recent `adr-*.md`; examples updated. |
| `.agent/skills/spec-evaluator/SKILL.md` | Component → docs table references new ADR and spec paths. |
| `.agent/skills/file-bug/SKILL.md` | Area-to-spec table updated to new paths. |
| `.agent/skills/schedule-feature/SKILL.md` | Example `spec-path` arguments use new paths. |
| `.agent/skills/job-queue/SKILL.md` | Example output references updated. |
| `.agent/agents/dev-harness/AGENT.md` | Discovery: `Glob("docs/adr-*.md")` + `docs/spec-*.md`; reference table updated. |
| `.agent/agents/spec-evaluator/AGENT.md` | Discovery + component→docs table updated. State-schema reference → `docs/spec-state-schema.md`. |
| `.agent/agents/design-evaluator/AGENT.md` | `docs/plan-*.md` cross-reference glob → `docs/adr-*.md`. State-schema reference updated. |

## Cross-Reference Updates

ADRs and specs that reference other docs by their old path (`docs/plan-k8s-integration.md`, `docs/ui-spec.md`, `docs/plan-state-schema.md`, etc.) are updated to the new paths. This is mechanical — no semantic change.

Internal cross-references in old ADRs (e.g. "see plan-graceful-upgrades.md") are updated to the renamed path. The ADR's content is otherwise preserved.

## Lineage Bootstrap

This ADR is committed in a single commit together with:
- All 21 file renames
- All content updates (spec text, skills, agents, cross-references)

Every spec file (`spec-state-schema.md`, `spec-ui.md`, `spec-tailscale-dns.md`) co-commits with this ADR. That means — once the docs MCP re-indexes and the lineage scanner runs — `get_lineage` on any spec section returns this ADR as its first lineage edge. Every future ADR that touches these specs extends the lineage.

## Scope

**v1 (this ADR):**
- Rename the 20 files listed.
- Update cross-references mechanically.
- Update skills and agents.
- Update `mclaude-docs-mcp` classifier + tool enums + tests.
- Commit as one atomic change so lineage edges form consistently.

**Deferred:**
- Per-component specs (`spec-session-agent.md`, etc.) — introduce only when a cross-component concern clearly exists.
- Extracting spec-shaped content from within old ADRs (e.g. the docs MCP category classifier currently lives inside `adr-0015-docs-mcp.md` as well as this one) — leave as dual-recorded for now; extract if/when `adr-0015-docs-mcp.md` needs further supersession.
- Recursive subdirectory organisation (`docs/adr/`, `docs/spec/`) — flat layout is fine for current volume.

## References

- `adr-0015-docs-mcp.md` — the docs MCP that makes lineage queryable (prior art)
- `spec-state-schema.md` — first spec under the new naming
- `.agent/skills/feature-change/SKILL.md` — the workflow that enforces ADR-per-request
