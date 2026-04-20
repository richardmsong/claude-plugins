# ADR: Component-Local Living Specs for Backend Components

**Status**: accepted
**Status history**:
- 2026-04-20: draft
- 2026-04-20: accepted — no existing specs to update; 9 new component specs authored during implementation

## Overview

Author component-local living specs (`docs/<component>/spec-<topic>.md`) for every backend component that currently lacks one. ADR-0020 established per-component subfolder structure and ADR-0021 established the ADR/spec distinction, but no component-local specs were ever written. The spec-evaluator currently evaluates backend components against scattered ADR text — effectively doing ADR compliance checks rather than spec compliance checks. This ADR creates the specs so that "what does component X do today?" is a single-file read, not a multi-ADR reconciliation.

## Motivation

Three concrete problems:

1. **Agent token waste.** To understand what `mclaude-session-agent` does, an agent must read ADR-0002, 0003, 0007, 0008, 0009, 0012, 0014, 0019, 0024 — and reconcile overlapping/superseded claims. That's ~30k tokens of ADR text where a ~3k living spec would suffice.

2. **Spec-evaluator drift.** The spec-evaluator's Phase 1 (spec → code) walks "every line of the spec that describes behavior." For backend components, it walks ADR text instead — frozen decision records that may describe intended behavior that was never implemented, or behavior that was later superseded. The evaluator cannot distinguish "spec says X but code doesn't do X" from "ADR proposed X but a later ADR changed the plan." This produces false GAPs and masks real ones.

3. **Onboarding friction.** A new contributor (human or agent) asking "what does the control-plane do?" gets pointed at 24 ADR files. The UI has 17 spec files; the backend has zero. The asymmetry is not justified by complexity — the backend is more complex, not less.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Which components get specs | 9 backend components: session-agent, control-plane, server, cli, connector, relay, mcp, common, charts/mclaude. mclaude-docs-mcp excluded — handled in a separate session. | Complete coverage for app components eliminates the "check the ADRs" fallback. Small components (cli, mcp, common) get small specs — the overhead is minimal. |
| One spec per component vs multiple | One broad spec per component initially (`spec-<component>.md`). Split into topic files when any single spec exceeds ~500 lines. | Matches ADR-0020 guidance: "topic usually starts broad and splits as content grows." Starting broad avoids premature partitioning. |
| Content source | Read from **code** (current truth), cross-reference with ADRs for intent. The spec describes what the code does now, not what ADRs proposed. | Specs are living present-tense documents. If code diverges from an ADR, the spec records the code's behavior — the ADR records the decision history. |
| What belongs in component spec vs cross-cutting spec | Component spec covers: responsibilities, internal state machine, configuration, error handling, deployment topology. Cross-cutting state (NATS subjects, KV keys, DB schema) stays in `spec-state-schema.md` with a back-reference. | Avoids duplicating the state schema. Component spec says "publishes lifecycle events" and points to `spec-state-schema.md § NATS Subjects` for the subject format. |
| Authoring method | Agent draft + human review. Subagents read all code + ADRs per component, draft each spec. Human reviews and corrects. Imperfections get caught by spec-evaluator on subsequent dev-harness runs. | Fastest path to usable specs. The plan-feature loop should also be updated so that when it touches a component with no spec, it creates one as part of the flow (see Workflow Change). |
| Ordering | All 9 in parallel — one batch, single commit. Subagents run concurrently. | Wall-clock time similar to doing 1-2 components. Fills the gap completely in one shot. |
| Interface detail in component specs | Reference only. Component spec names the interface direction ("publishes lifecycle events") and points to `spec-state-schema.md` for subject format and payload schema. No duplication. | Top-level cross-cutting specs apply to all nested components. Component specs describe component-local behavior; cross-cutting contracts live in cross-cutting specs. |
| Draft ADR behavior | Code is truth. If the code implements behavior from a draft ADR, the spec documents it. | Specs describe what IS, not what's formally accepted. Draft ADR status is a doc-process artifact, not a code-process one. |
| Spec-evaluator table update | Update `.agent/agents/spec-evaluator/AGENT.md` component table to reference the new component-local specs. | The evaluator currently lists ADRs per component; it should list the component spec instead (and still read ADRs for status-filter compliance). |

## Component Inventory

### Components needing specs

| Component | Folder | Complexity | Key ADRs | Est. spec size |
|-----------|--------|------------|----------|----------------|
| `mclaude-session-agent` | `mclaude-session-agent/` | High | 0002, 0003, 0007, 0008, 0009, 0010, 0012, 0014, 0019, 0024 | ~400 lines |
| `mclaude-control-plane` | `mclaude-control-plane/` | High | 0002, 0003, 0004, 0007, 0009, 0011, 0013, 0014, 0024 | ~350 lines |
| `mclaude-server` | `mclaude-server/` | Medium | 0002, 0006 | ~200 lines |
| `mclaude-cli` | `mclaude-cli/` | Low | 0005, 0024 | ~80 lines |
| `mclaude-connector` | `mclaude-connector/` | Medium | 0004 | ~150 lines |
| `mclaude-relay` | `mclaude-relay/` | Medium | 0004 | ~150 lines |
| `mclaude-mcp` | `mclaude-mcp/` | Low | — | ~60 lines |
| `mclaude-common` | `mclaude-common/` | Low | 0024 | ~80 lines |
| `charts/mclaude` | `charts/mclaude/` | Medium | 0003, 0011, 0016 | ~250 lines |

### Components excluded (separate session)

| Component | Reason |
|-----------|--------|
| `mclaude-docs-mcp` | Being separated into a plugin system — spec authored in that session |

### Components already covered

| Component | Existing specs |
|-----------|----------------|
| `mclaude-web` | 17 UI specs under `docs/ui/` and `docs/ui/mclaude-web/` |

## Spec Template

Each component spec follows this structure:

```markdown
# Spec: <Component Display Name>

## Role
One paragraph: what this component is and what it does.

## Deployment
How it runs: K8s pod, laptop daemon, CLI binary, library, Helm chart.
Config knobs (env vars, flags, config files).

## Interfaces
External-facing contracts: HTTP endpoints, NATS subjects (pub/sub),
KV buckets (read/write), K8s resources (create/read/watch), Unix sockets,
CLI commands. For NATS/KV, reference `spec-state-schema.md` sections
rather than duplicating schemas.

## Internal Behavior
State machine (if any), lifecycle, key algorithms, retry/reconnect logic.

## Error Handling
What can go wrong and how each failure is surfaced to the user or operator.

## Dependencies
What this component needs at runtime (other components, external systems).
```

Sections are dropped if empty (e.g. `mclaude-common` has no Deployment or Error Handling).

## Spec-Evaluator Update

### AGENT.md — "ADRs and specs per component" table

The component table in `.agent/agents/spec-evaluator/AGENT.md` is updated to reference the new specs:

| Component | Read these |
|-----------|-----------|
| `control-plane` | `docs/mclaude-control-plane/spec-control-plane.md`, `docs/spec-state-schema.md`, relevant `docs/adr-*.md` |
| `session-agent` | `docs/mclaude-session-agent/spec-session-agent.md`, `docs/spec-state-schema.md`, relevant `docs/adr-*.md` |
| `server` | `docs/mclaude-server/spec-server.md`, relevant `docs/adr-*.md` |
| `cli` | `docs/mclaude-cli/spec-cli.md`, relevant `docs/adr-*.md` |
| `connector` | `docs/mclaude-connector/spec-connector.md`, relevant `docs/adr-*.md` |
| `relay` | `docs/mclaude-relay/spec-relay.md`, relevant `docs/adr-*.md` |
| `mcp` | `docs/mclaude-mcp/spec-mcp.md`, relevant `docs/adr-*.md` |
| `common` | `docs/mclaude-common/spec-common.md`, relevant `docs/adr-*.md` |
| `helm` | `docs/charts-mclaude/spec-helm.md`, `docs/spec-state-schema.md`, relevant `docs/adr-*.md` |
| `spa` | (unchanged — `docs/ui/spec-*.md`, `docs/ui/mclaude-web/spec-*.md`) |
| `mclaude-docs-mcp` | (excluded — separate session) |

### AGENT.md — "Component roots" table

The existing Component roots table (currently 5 entries) is extended with the new components:

| Component | Root |
|-----------|------|
| `control-plane` | `mclaude-control-plane/` |
| `session-agent` | `mclaude-session-agent/` |
| `spa` | `mclaude-web/` |
| `cli` | `mclaude-cli/` |
| `helm` | `charts/mclaude/` |
| `server` | `mclaude-server/` |
| `connector` | `mclaude-connector/` |
| `relay` | `mclaude-relay/` |
| `mcp` | `mclaude-mcp/` |
| `common` | `mclaude-common/` |

### SKILL.md — component enum and parallel block

The component enum at `.agent/skills/spec-evaluator/SKILL.md` line 30 is updated:

```
**component**: control-plane | session-agent | spa | cli | helm | server | connector | relay | mcp | common
```

The parallel spawn block (lines 54-59) adds 5 new agents:

```
Agent({ subagent_type: "spec-evaluator", prompt: "Evaluate server...", run_in_background: true })
Agent({ subagent_type: "spec-evaluator", prompt: "Evaluate connector...", run_in_background: true })
Agent({ subagent_type: "spec-evaluator", prompt: "Evaluate relay...", run_in_background: true })
Agent({ subagent_type: "spec-evaluator", prompt: "Evaluate mcp...", run_in_background: true })
Agent({ subagent_type: "spec-evaluator", prompt: "Evaluate common...", run_in_background: true })
```

The summary block adds matching lines.

### SKILL.md — doc discovery table

Add rows for the 5 new evaluable components:

| Component | Docs |
|-----------|------|
| `server` | `docs/mclaude-server/spec-server.md` + relevant `docs/adr-*.md` |
| `connector` | `docs/mclaude-connector/spec-connector.md` + relevant `docs/adr-*.md` |
| `relay` | `docs/mclaude-relay/spec-relay.md` + relevant `docs/adr-*.md` |
| `mcp` | `docs/mclaude-mcp/spec-mcp.md` + relevant `docs/adr-*.md` |
| `common` | `docs/mclaude-common/spec-common.md` + relevant `docs/adr-*.md` |

## Dev-Harness Update

The dev-harness AGENT.md component enum is updated to include the new components:

```
**component**: control-plane | session-agent | spa | cli | helm | server | connector | relay | mcp | common | all
```

The Component roots table gets the same additions as the spec-evaluator.

**Category tables are deferred.** The dev-harness has per-component category tables (build, unit, integration, etc.) only for the original 5 components. Adding category tables for the 5 new components happens when the first `/feature-change` touches each one — at that point, the dev-harness agent reading the component spec can derive the appropriate categories from its structure. This ADR does not add category tables because the specs don't exist yet at authoring time (they're created in the implementation step).

## Helm Spec Folder Path

The Helm chart lives at `charts/mclaude/` in the repo (not `mclaude-charts/`). The `spec-doc-layout.md` naming rule (`docs/mclaude-<component>/`) doesn't apply because `charts/` is not a `mclaude-*` directory. The canonical spec path is:

```
docs/charts-mclaude/spec-helm.md
```

This follows ADR-0020's convention at line 108 (`docs/charts/`) but uses `charts-mclaude` to stay closer to the component identity. The folder is created lazily when the spec is written.

## Impact

**Specs co-committed with this ADR:**
- `docs/spec-doc-layout.md` — no changes needed (already describes component-local spec placement).
- All 9 new `docs/<component>/spec-*.md` files — authored as part of implementation.

**Components implementing the change:**
- `.agent/agents/spec-evaluator/AGENT.md` — component table update.
- `.agent/agents/dev-harness/AGENT.md` — discovery table update (if needed).
- `.agent/skills/spec-evaluator/SKILL.md` — component table update.
- `.agent/skills/plan-feature/SKILL.md` — add spec-gap detection to Step 4b (create component spec if none exists).
- `.agent/skills/feature-change/SKILL.md` — spec location table update (if needed).

## Scope

**v1 (this ADR):**
- Author 9 component-local specs from code + ADR cross-reference, all in parallel.
- Update spec-evaluator and dev-harness agent/skill tables.
- Update plan-feature skill with spec-gap detection (create component spec if none exists).
- Each spec describes current code behavior in present tense.

**Deferred:**
- Splitting any spec into multiple topic files (do when a spec exceeds ~500 lines).
- Backfilling lineage edges for historical ADRs (the new specs co-commit with this ADR, forming the initial lineage edge; older ADRs don't retroactively link).
- Running spec-evaluator against all 9 new specs to find code/spec gaps (follow-up after authoring).
- Extracting the ADR/spec system into a reusable plugin (separate session/ADR).

## Workflow Change: plan-feature spec gap detection

The `/plan-feature` skill (`.agent/skills/plan-feature/SKILL.md`) is updated so that Step 4b "Update impacted specs" also checks whether each impacted component has a spec file. If a component has no `docs/<component>/spec-*.md`, the plan-feature flow creates one as part of the same commit — using the template from this ADR and reading the component's code to populate it. This prevents the spec gap from reopening as new components are added.

The check is:
1. For each component in the ADR's "Component Changes" section, glob `docs/<component>/spec-*.md`.
2. If no spec exists, draft one from code (same agent-draft approach as the initial batch).
3. Include the new spec in the co-commit with the ADR + other spec edits.

**Scope of the check:** This detects only the absence of a spec file — it does NOT verify that the new feature's behavior is described in the spec. Adding the new behavior to an existing spec is already handled by Step 4b's "Update impacted specs" logic. The two concerns are separate:
- Spec-gap detection: "does this component have any spec at all?" → create if missing.
- Spec update: "does the spec describe this ADR's changes?" → edit the spec (existing Step 4b).

This is the "implemented into the plan-feature loop" requirement — spec authoring becomes a standard part of feature planning, not a separate cleanup task.

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| 9 component specs | ~1,700 total | ~300k (9 × ~33k per spec) | Agent reads code + ADRs, drafts spec. Human reviews. All 9 in parallel. |
| Spec-evaluator agent update | ~40 | ~10k | Table update in AGENT.md |
| Dev-harness agent update | ~20 | ~10k | Discovery table if needed |
| Spec-evaluator skill update | ~20 | ~10k | Table update in SKILL.md |
| Plan-feature skill update | ~30 | ~10k | Add spec-gap detection to Step 4b |

**Total estimated tokens:** ~340k
**Estimated wall-clock:** ~1.5h of 5h budget (~30%)
