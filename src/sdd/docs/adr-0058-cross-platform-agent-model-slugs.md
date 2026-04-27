# ADR: Cross-platform agent model slugs

**Status**: accepted
**Status history**:
- 2026-04-25: accepted

## Overview

Change all agent/droid definitions from the Claude Code shorthand `model: sonnet` to the full model identifier `model: claude-sonnet-4-6`, which is recognized by both Claude Code and Droid. Create a spec for agent definitions that documents the model configuration contract, cross-platform requirements, and the four agent roles.

## Motivation

The agent definitions in `src/sdd/.agent/agents/` use `model: sonnet` — a Claude Code alias that Droid does not recognize. When Droid tries to launch dev-harness, it fails with "Invalid model: sonnet". Claude Code accepts full model IDs (`claude-sonnet-4-6`), so using the full identifier is the cross-platform-compatible choice. This blocks all dev-harness and evaluator invocations from Droid sessions.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model slug format | Full identifier (`claude-sonnet-4-6`) in all agent definitions | Works on both Claude Code and Droid. Claude Code docs confirm full model IDs are accepted alongside aliases. |
| Not `inherit` | Agents must be pinned to Sonnet, not inherit from master | The master session runs Opus; subagents run Sonnet for cost efficiency. `inherit` would run them on Opus. |
| Spec creation | New `docs/spec-agents.md` for agent definitions | No spec currently covers the four agents (dev-harness, design-evaluator, implementation-evaluator, spec-evaluator), their roles, model requirements, or cross-platform constraints. |

## Impact

- New spec: `docs/spec-agents.md`
- Updates: all four agent definitions in `src/sdd/.agent/agents/` — `model: sonnet` → `model: claude-sonnet-4-6`

## Scope

### In v1
- Fix model slugs in all four agent definitions
- Create `docs/spec-agents.md` documenting agent roles, model config, tool access, and cross-platform requirements

### Deferred
- Per-platform agent overrides (if a platform ever needs different model identifiers)
- Agent definition validation hook (lint that checks model slugs are cross-platform-compatible)
