# ADR: Droid platform package — full implementation

**Status**: implemented
**Status history**:
- 2026-04-25: accepted
- 2026-04-25: implemented — all scope CLEAN

## Overview

Promote the Droid platform package (`droid/sdd/`) from a stub to a full implementation: setup skill, PreToolUse hooks (blocked-commands + source-guard), plugin manifest, local-setup support, and project-level AGENTS.md injection. Also add AGENTS.md to the repo root so Droid sessions load the SDD workflow rules — without this, Droid sessions have no context about the spec-driven workflow and the master session freely edits source files.

## Motivation

ADR-0047 created the Droid platform package as a stub with symlinks and a README, deferring setup, hooks, and metadata until Droid's plugin format was documented. Droid's plugin format is now documented (`docs.factory.ai`):

- Plugins use `.factory-plugin/plugin.json` manifests
- Skills live in `skills/<name>/SKILL.md`
- Droids (subagents) live in `droids/<name>.md`
- Hooks use `hooks/hooks.json` with `${DROID_PLUGIN_ROOT}` for plugin-relative paths
- Project hooks go in `.factory/settings.json`
- Context injection uses `AGENTS.md` (not `CLAUDE.md`)
- Project dir env var is `$FACTORY_PROJECT_DIR` (not `$CLAUDE_PROJECT_DIR`)

The stub was insufficient: Droid sessions in this repo had no SDD workflow rules loaded, no hooks enforcing source protection, and no setup skill for target projects.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Setup skill | Real file at `droid/sdd/skills/setup/SKILL.md` (not symlinked) | Platform-specific: writes AGENTS.md not CLAUDE.md, uses `$FACTORY_PROJECT_DIR` not `$CLAUDE_PROJECT_DIR`, configures `.factory/settings.json` not `.claude/settings.json` |
| Context injection target | `AGENTS.md` with same `<!-- sdd:begin -->` / `<!-- sdd:end -->` markers | AGENTS.md is the Droid equivalent of CLAUDE.md. Same marker convention enables the same upsert logic from ADR-0045. |
| Hook wrappers | `droid/sdd/hooks/` with Droid-specific I/O wrappers delegating to shared guards | Same pattern as Claude wrappers. Bridge `$FACTORY_PROJECT_DIR` → `$CLAUDE_PROJECT_DIR` so shared guards work unmodified. Resolve guard path via `SCRIPT_DIR` (not `DROID_PLUGIN_ROOT`) so wrappers work in both plugin-installed and local-dev contexts. |
| Hook tool matchers | `Execute` (not `Bash`), `Edit\|Create` (not `Edit\|Write`) | Droid tool names differ from Claude Code tool names. |
| Plugin manifest | `.factory-plugin/plugin.json` at `droid/sdd/` | Required by Droid plugin format. Matches the `.claude-plugin/plugin.json` pattern. |
| Marketplace descriptor | Remove `"status": "stub"`, add owner/metadata/description | Aligns with Claude marketplace descriptor format. |
| Settings bootstrap | `commandAllowlist` in `.factory/settings.json` | Droid equivalent of Claude's `permissions.allow`. Allows git commands dev-harness needs without interruption. |
| Local-setup support | `.factory/skills/` → `droid/sdd/skills/`, `.factory/droids/` → `src/sdd/.agent/agents/` | Droid discovers skills at `.factory/skills/` and droids at `.factory/droids/`. Symlinks make working-tree edits immediately visible. |
| AGENTS.md at repo root | Add with SDD marker block from `src/sdd/context.md` | Without this, Droid sessions in this repo have zero SDD workflow context. CLAUDE.md only loads for Claude Code sessions. |
| Missing skill symlink | Add `implementation-evaluator` to `droid/sdd/skills/` | Was present in Claude package but missing from Droid. |
| context.md | Symlink `droid/sdd/context.md` → `../../src/sdd/context.md` | Same canonical source as Claude, no duplication. |

## Impact

- Implements the deferred scope from ADR-0047 ("Droid platform package")
- Updates `src/sdd/.agent/skills/local-setup/SKILL.md` — adds Steps 3, 9 for Droid discovery paths and command allowlist
- Updates `.droid-plugin/marketplace.json` — removes stub status
- Adds `AGENTS.md` at repo root — Droid sessions now load SDD workflow rules

## Scope

### In v1
- `droid/sdd/skills/setup/SKILL.md` — full Droid setup skill
- `droid/sdd/hooks/` — hooks.json + blocked-commands + source-guard wrappers + guard symlinks
- `droid/ssd/.factory-plugin/plugin.json` — Droid plugin manifest
- `droid/sdd/context.md` — symlink to canonical source
- `droid/sdd/skills/implementation-evaluator` — missing symlink added
- `.factory/settings.json` — project hooks + command allowlist for local dev
- `.factory/skills/` + `.factory/droids/` — symlinks for Droid local dev
- `AGENTS.md` — SDD workflow rules for Droid sessions
- Updated `local-setup` skill with Droid steps
- Updated `.droid-plugin/marketplace.json`

### Deferred
- Droid plugin MCP config (`mcp.json` at plugin root) — docs-mcp binary needs testing with Droid's MCP discovery
- Droid-specific tutorial content in setup (currently mirrors Claude's tutorial structure)
- Hook for enforcing ADR-before-edit workflow (PreToolUse gate that blocks Edit|Create if no ADR exists in session)
