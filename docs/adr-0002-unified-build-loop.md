# ADR: Unified per-platform build loop for skills, agents/droids, guards, and context

**Status**: accepted
**Status history**:
- 2026-04-28: accepted

## Overview

Refactor `build.sh` to process skills, agents/droids, guard scripts, and `context.md` through a single loop over all platform output directories (`*/sdd`). Claude is no longer special-cased; every platform goes through the same copy logic under the same conventions.

## Motivation

After ADR-0001 added skills copy for non-Claude platforms, the build had three separate code paths doing structurally identical work: step 6 (Claude skills), step 8 (Claude agents), and step 8c (non-Claude skills). Steps 9–10 (guards + GUARD= rewriting) were Claude-only with no equivalent for other platforms. Adding a new platform would require touching multiple disconnected sections.

The unified loop closes this by making platform registration implicit: drop a `*/sdd` directory with the right config and the build picks it up automatically.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Loop scope | `"$REPO_ROOT"/*/sdd` — all top-level platform dirs | Same glob already used in step 8b; consistent |
| Skills | Verbatim copy of `src/sdd/.agent/skills/*/` to each platform's `skills/`; exclude `local-setup`; `rm -rf` target before copy | Same rule for all platforms; platform-specific skills (e.g. `setup/`) are not in src and are never targeted |
| Agent format detection | If `platform_dir/.agent-templates/` exists → output to `droids/` with frontmatter template substitution; otherwise → output to `agents/` verbatim | Encodes the existing implicit convention; adding a platform just requires placing `.agent-templates/` |
| Guards | Copy all `src/sdd/hooks/guards/*.sh` to each platform's `hooks/guards/`; skip platform if it has no `hooks/` dir | Guards are platform-neutral; whether a platform's hooks.json activates them is the platform's concern |
| Claude GUARD= path | Change Claude hook wrappers to use `${SCRIPT_DIR}/guards/<name>` (already computed in each wrapper) instead of `${CLAUDE_PLUGIN_ROOT}/hooks/guards/<name>` | `$SCRIPT_DIR` is already defined in each wrapper and produces the same path; removes the need for step 10 rewriting |
| Remove step 10 | Deleted entirely | No longer needed once Claude wrappers use `$SCRIPT_DIR` |
| context.md | `rm -f` then `cp` to each platform dir inside the loop | Replaces symlinks left by `local-setup`; was Claude-only before |
| Symlink cleanup | Replace step 1's `find "$OUT" -type l -delete` with targeted pre-copy cleanup inside the loop (`rm -rf "$target"` before each cp, `rm -f` before context.md) | Safer than broad find-delete; naturally scoped per operation |
| Claude-specific steps | Bundle (MCP server, dashboard), `docs-dashboard` copy, `.mcp.json` remain outside the loop | These have no cross-platform equivalent |

## Impact

- `src/sdd/build.sh` — remove steps 1, 6, 8, 8b, 8c, 9, 10; replace with unified loop
- `claude/sdd/hooks/blocked-commands-hook.sh` — change `GUARD=` to use `$SCRIPT_DIR`
- `claude/sdd/hooks/source-guard-hook.sh` — change `GUARD=` to use `$SCRIPT_DIR`
- `claude/sdd/hooks/workflow-reminder-hook.sh` — change `GUARD=` to use `$SCRIPT_DIR`
- No spec files impacted; ADR only

## Scope

All existing platforms (claude, factory). Context.md copy for factory is a side effect that closes the symlink-in-output issue noted in ADR-0001 scope.

## Integration Test Cases

| Test case | What it verifies | Components exercised |
|-----------|------------------|----------------------|
| After build, `claude/sdd/skills/design-audit` is a real directory | Skills loop covers Claude | build.sh |
| After build, `factory/sdd/skills/design-audit` is a real directory | Skills loop covers factory | build.sh |
| After build, `claude/sdd/agents/dev-harness.md` exists with Claude frontmatter | Agents: verbatim path for platforms without `.agent-templates/` | build.sh |
| After build, `factory/sdd/droids/dev-harness.md` exists with factory frontmatter | Agents: template path for platforms with `.agent-templates/` | build.sh |
| After build, `claude/sdd/hooks/guards/blocked-commands.sh` exists | Guards loop covers Claude | build.sh |
| After build, `factory/sdd/hooks/guards/workflow-reminder.sh` exists | Guards loop covers factory | build.sh |
| After build, `factory/sdd/context.md` is a real file, not a symlink | context.md copy covers all platforms | build.sh |
| After build, `claude/sdd/hooks/workflow-reminder-hook.sh` references `$SCRIPT_DIR` not `$CLAUDE_PLUGIN_ROOT` | Step 10 is gone; wrappers use SCRIPT_DIR | claude hook wrappers |
