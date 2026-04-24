# ADR: Setup skill writes plugin-scoped MCP allow pattern

**Status**: implemented
**Status history**:
- 2026-04-24: accepted
- 2026-04-24: implemented — all scope CLEAN

## Overview

Fix the allow-list entry written by the plugin-install setup skill (`claude/sdd/skills/setup/SKILL.md` Step 4) from `mcp__docs__*` to `mcp__plugin_spec-driven-dev_docs__*`. Without the fix the four docs MCP tools prompt for permission on every call after `/setup`, because Claude Code namespaces plugin-installed MCP tools under `mcp__plugin_<plugin-name>_<server>__*` and the wrong pattern does not match.

## Motivation

Reported as [GitHub issue #1](https://github.com/richardmsong/agent-plugins/issues/1). ADR-0043 §"Known limitation: plugin MCP permissions" already documents the two permission namespaces — `mcp__docs__*` for the symlink install route, `mcp__plugin_spec-driven-dev_docs__*` for the plugin install route — and states explicitly: *"The setup skill / `install.sh` configures the correct one based on the installation method."* The plugin-install setup skill was not updated to match, so it writes the wrong one and users hit a permission prompt on every docs-MCP call.

The local-dev counterpart (`src/sdd/.agent/skills/local-setup/SKILL.md` line 156) already writes `mcp__docs__*` correctly and is not affected.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Allow pattern in `claude/sdd/skills/setup/SKILL.md` Step 4 | `mcp__plugin_spec-driven-dev_docs__*` | Matches how Claude Code scopes plugin-installed MCP tools; `spec-driven-dev` is the plugin name declared in `claude/sdd/.claude-plugin/plugin.json` |
| `local-setup` SKILL | Unchanged (`mcp__docs__*`) | Symlink/local route registers the MCP server per-project in `.mcp.json` with the un-namespaced prefix; ADR-0043 §118 documents this |
| Back-compat shim for already-setup projects | None | `/setup` is idempotent. Users re-run `/setup` after the fix and the merge logic adds the correct entry alongside any pre-existing wrong one — which is harmless. Users who want to drop the stale `mcp__docs__*` entry can edit `.claude/settings.json` manually. |

## Impact

No `docs/**/spec-*.md` files are touched — this is a class-A bug fix. The only change is to `claude/sdd/skills/setup/SKILL.md` Step 4's default allow array.

## Scope

**In v1:** swap the one allow-list entry. **Deferred:** nothing.

## References

- ADR-0043 §"Known limitation: plugin MCP permissions" — names both namespaces and states that the setup skill is responsible for writing the right one.
- GitHub issue #1.
