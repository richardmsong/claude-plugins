# Spec: Agent Definitions

Living reference for the subagent/droid definitions in `src/sdd/.agent/agents/`. These agents are invoked by the master session during the `/feature-change` workflow.

## Agent Inventory

| Agent | Purpose | Model | Tools | Background |
|-------|---------|-------|-------|------------|
| `dev-harness` | Implements and tests a component against its spec. Invoked repeatedly until all gaps are closed. | `claude-sonnet-4-6` | `*` (all) | yes |
| `implementation-evaluator` | Fresh-context compliance audit. Reads specs + code, reports every gap where spec says X but code doesn't implement X. | `claude-sonnet-4-6` | `Read, Glob, Grep, Write, Bash, Agent` | yes |
| `spec-evaluator` | Fresh-context spec alignment audit. Reads an ADR and all referenced specs, reports gaps where the ADR decides X but the spec doesn't reflect X. | `claude-sonnet-4-6` | `Read, Glob, Grep, Write, Bash` | yes |
| `design-evaluator` | Fresh-context design document evaluator. Reports ambiguities and blocking gaps in a design doc. | `claude-sonnet-4-6` | `Read, Glob, Grep, Write, Bash, Agent` | yes |

## Model Configuration

All agents are pinned to `claude-sonnet-4-6`. This is a deliberate cost decision: the master session runs Opus for orchestration, while subagents run Sonnet for implementation and evaluation work.

### Cross-platform requirement

Agent definitions are shared between Claude Code and Droid via symlinks (`droid/sdd/agents/ → src/sdd/.agent/agents/`, `.factory/droids/ → src/sdd/.agent/agents/`). The `model` field must use the **full model identifier** (e.g. `claude-sonnet-4-6`), not platform-specific shorthands:

- `claude-sonnet-4-6` -- works on both Claude Code and Droid
- `sonnet` -- works on Claude Code only, fails on Droid
- `inherit` -- works on both, but inherits the master session model (Opus), which is not desired

When updating the model version (e.g. to a future `claude-sonnet-4-7`), update all four definitions in a single commit.

## File Location

Agent definitions live at `src/sdd/.agent/agents/<name>.md`. They are shared via:

- `.agent/agents/` symlink (vendor-neutral local dev path)
- `claude/sdd/agents/` symlink (Claude Code plugin)
- `droid/sdd/agents/` symlink (Droid plugin)
- `.factory/droids/` symlink (Droid local dev)

All paths resolve to the same canonical files. Edits to any symlinked path affect all platforms.

## Frontmatter Contract

Each agent definition uses YAML frontmatter:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Identifier used in `Agent(subagent_type="<name>")` invocations |
| `description` | yes | When the master session should delegate to this agent |
| `model` | yes | Full model identifier (see Cross-platform requirement above) |
| `tools` | yes | Tool access: `"*"` for all, or comma-separated list |
| `run_in_background` | yes | Must be `true` for all SDD agents -- master session waits for completion notification |
| `maxTurns` | no | Maximum agentic turns. Set on dev-harness (500) to allow long implementation runs |

## Invocation

Agents are invoked by the master session's `/feature-change` skill:

1. **dev-harness** -- Step 6: implementation loop. Re-invoked until all gaps closed.
2. **implementation-evaluator** -- Step 6: verification after each dev-harness pass.
3. **spec-evaluator** -- Step 4b: spec-edit verification loop before committing.
4. **design-evaluator** -- `/design-audit` skill: multi-round ambiguity audit.

All agents run in fresh context (no conversation history inherited). They read specs and ADRs from disk.
