# ADR: Droid platform package — full implementation

**Status**: draft
**Status history**:
- 2026-04-25: accepted
- 2026-04-25: implemented — all scope CLEAN
- 2026-04-26: reverted to draft — dev-harness subagent does not work in Droid environment; blocking issues documented below

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

## Blocking Issues (as of 2026-04-26)

These issues were discovered when attempting to run the `/feature-change` → dev-harness loop inside a Droid session. The ADR is reverted to `draft` until they are resolved.

### ~~1. dev-harness subagent runs in a tool-restricted "exec mode"~~ (Fixed)

`Task`-spawned droids with `run_in_background: true` now retain full tool access. The `/feature-change` → dev-harness → evaluator loop is functional.

### 3. No `subagent_type` in PreToolUse hook input — source-guard blocks subagents

The source-guard hook (`droid/sdd/hooks/source-guard-hook.sh`) checks for a `subagent_type` or `agent_type` field in the hook stdin to identify subagent calls and let them through unconditionally. Empirically tested (2026-04-26): when the master session spawns a `worker` subagent via `Task` and the subagent attempts to `Create` a file under a `source_dirs` path, the full hook stdin is:

```json
{
  "session_id": "84ca6aa9-...",
  "cwd": "/Users/rsong/work/agent-plugins",
  "permission_mode": "auto-high",
  "hook_event_name": "PreToolUse",
  "tool_name": "Create",
  "tool_input": { "file_path": "...", "content": "..." }
}
```

No `subagent_type`, no `agent_type`. The bypass check never fires. The subagent is blocked by the source-guard with `"master session cannot edit ..."`, identical to how the master session itself would be blocked. This is the same gap as noted in ADR-0060 §3 for Devin.

**Impact:** dev-harness subagents (when tool-access issues in Issue #1 are resolved) will be blocked from writing any file under `source_dirs`. The guard that is supposed to protect source files from the *master session* ends up blocking the *subagents* that are the intended writers.

**Resolution needed:** Either:
- Droid injects a field (e.g. `subagent_type`, `agent_type`, or `is_subagent`) into PreToolUse stdin for subagent-spawned tool calls, allowing the hook to distinguish them; or
- The source-guard is replaced with a different enforcement mechanism (e.g. checking `permission_mode` or session ID against a known master-session ID written at SessionStart); or
- Source-guard enforcement is dropped for Droid entirely and enforced solely via AGENTS.md rules (weaker, relies on model compliance).

### 2. `/feature-change` skill assumes Claude Code tool names

The `/feature-change` SKILL.md and dev-harness agent reference Claude Code tool names (`Bash`, `Edit`, `Write`, `Read`) in their hook matchers and instructions. The Droid equivalents (`Execute`, `Edit`, `Create`) differ. The source-guard hook in this ADR already bridges this (translating `Edit|Create` → `Edit|Write`) but the agent instructions themselves have not been audited for tool-name drift.

**Impact:** Even if tool access is restored, the dev-harness agent may fail to use Droid-native tools correctly or may reference Claude-specific patterns that don't translate.

**Resolution needed:** Audit dev-harness agent instructions (`src/sdd/.agent/agents/dev-harness.md`) for Claude-specific tool name references and add Droid equivalents.
