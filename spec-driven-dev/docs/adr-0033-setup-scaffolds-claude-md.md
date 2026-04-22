# ADR: Setup skill scaffolds CLAUDE.md and readRawDoc drops docs/ check

**Status**: accepted
**Status history**:
- 2026-04-22: accepted

## Overview

Two changes to close gaps exposed by the plugin extraction:

1. The `/spec-driven-dev:setup` skill gains a Step 3b that scaffolds a `CLAUDE.md` at the project root if one doesn't exist. The scaffold contains the core SDD workflow rules so any Claude session in the project uses `/feature-change` and `/plan-feature` by default. Setup also bootstraps `.claude/settings.json` with sensible default permissions — docs MCP tools, Edit, Write, Bash for common dev commands (bun, git, etc.) — so the workflow runs without constant permission prompts.
2. `readRawDoc` in `docs-mcp/src/tools.ts` drops the hardcoded `<repoRoot>/docs/` path check. It now validates only that the resolved path is inside `repoRoot`. This is required because ADR-0032 made the docs directory configurable — docs may live at any subdirectory, not just `<repoRoot>/docs/`.

## Motivation

**CLAUDE.md gap:** ADR-0026 explicitly says "Project-specific context (component lists, doc index) goes in CLAUDE.md" and "mclaude after extraction: CLAUDE.md only." But the setup skill never creates one. Without a CLAUDE.md carrying the SDD rules, a regular Claude session in the project has no instructions to route changes through `/feature-change` — the user discovered this when a direct code edit bypassed the workflow.

**readRawDoc gap:** After extracting the plugin to its own repo, docs live at `spec-driven-dev/docs/` relative to the git root. The dashboard's `/api/doc` endpoint calls `readRawDoc(repoRoot, docPath)` where `docPath` is `spec-driven-dev/docs/...`. The function rejects this because the resolved path isn't under `<repoRoot>/docs/`. The `repoRoot` containment check is sufficient security — the `docs/` check is now wrong given configurable docs dirs.

**MCP permissions:** The docs MCP tools should be allowed by default in project settings so users don't get permission prompts for read-only doc operations.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLAUDE.md creation | Scaffold with SDD workflow rules if absent; skip if present | Same idempotent pattern as other setup files. Preserves user customizations. |
| CLAUDE.md content | Core SDD rules only: /feature-change for all changes, /plan-feature for new features, never write code directly, use subagents | These are the load-bearing rules from mclaude's CLAUDE.md. Project-specific details (component lists, deploy rules) are added by the user. |
| readRawDoc security | Remove `<repoRoot>/docs/` check; keep `repoRoot` containment check | The repoRoot check prevents path traversal. The docs/ check was an over-restriction that breaks configurable docs dirs (ADR-0032). Doc paths in the DB are trusted — they came from `indexAllDocs`. |
| Default permissions | Setup bootstraps `.claude/settings.json` with an allowlist: docs MCP tools, Edit, Write, Bash patterns for bun/git/common dev commands | The SDD workflow involves frequent tool calls (edits, tests, git). Dev-harness and spec-evaluator subagents are designed to run without supervision — they can't prompt for permission. Without pre-configured allows, subagents stall on every Edit/Bash call. Setup configures sensible defaults; users can tighten later. |

## Impact

- `skills/setup/SKILL.md` — new Step 3b (CLAUDE.md scaffold) and Step 3c (MCP permissions)
- `docs/mclaude-docs-mcp/spec-docs-mcp.md` — update `readRawDoc` spec to remove docs/ path check
- `docs-mcp/src/tools.ts` — remove docs/ check in `readRawDoc`
- `docs-mcp/tests/` — update test that asserts the docs/ rejection

## Scope

**In:** CLAUDE.md scaffolding in setup, readRawDoc fix, MCP permission setup.

**Deferred:** Interactive CLAUDE.md customization wizard, auto-detecting project components for CLAUDE.md.
