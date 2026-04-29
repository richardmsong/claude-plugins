# ADR: Platform feature parity — dist, docs-dashboard, and MCP registration for all platforms

**Status**: accepted
**Status history**:
- 2026-04-28: accepted

## Overview

The build must produce identical functional output for every platform: bundled MCP server (`dist/`), docs-dashboard UI and server (`docs-dashboard/`), and a platform-native MCP registration config. Currently these are written only to `claude/sdd/`. Factory users of the plugin have no docs MCP, no dashboard, and no way for skills like `/plan-feature` or `/feature-change` to call `search_docs` or `get_lineage`.

Hooks are explicitly out of scope: Factory/Droid PreToolUse hooks are disabled pending platform-side fixes (ADR-0062).

## Motivation

The docs MCP server is the backbone of the SDD skill loop. Every skill that does research (`/plan-feature`, `/feature-change`, `/spec-evaluator`) calls `search_docs`, `list_docs`, and `get_lineage`. Those calls silently fail for any platform that doesn't have the MCP server registered. The dashboard is a first-class developer tool that should be available regardless of which agent platform the user is on.

The root cause is that the build scripts that write `dist/` (steps 3–4) and `docs-dashboard/` (step 6b) hardcode `$OUT` (= `claude/sdd/`), and the MCP config (step 7b) writes a Claude-format `.mcp.json` to `$OUT` only.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `dist/` distribution | Build once into `$OUT/dist/` (unchanged); copy into every other platform dir in the unified loop | Avoids rebuilding; bundled JS is platform-neutral |
| `docs-dashboard/` distribution | Copy UI source + `dashboard.sh` to every platform dir in the unified loop | Same rsync + cp logic, just applied to all platforms |
| MCP registration config | Write per-platform in the unified loop, detected by plugin dir type | Each platform has a different filename and JSON structure |
| Claude MCP format | `.mcp.json` at plugin root, flat `{ "docs": { ... } }`, variable `${CLAUDE_PLUGIN_ROOT}` | Existing Claude Code plugin spec |
| Factory MCP format | `mcp.json` at plugin root (no dot), `{ "mcpServers": { "docs": { "type": "stdio", ... } } }`, variable `${DROID_PLUGIN_ROOT}` | Factory plugin spec; `${CLAUDE_PLUGIN_ROOT}` is a documented alias but `${DROID_PLUGIN_ROOT}` is canonical |
| Platform detection | Presence of `.claude-plugin/` → Claude format; `.factory-plugin/` → Factory format | Reuses existing plugin-type markers; no new config needed |
| Step 7b removal | Deleted; MCP config writing moves into the unified loop | Eliminates the last Claude-only output step outside the loop |
| Hooks | Excluded from parity scope | Factory PreToolUse hooks disabled per ADR-0062; UserPromptSubmit not yet implemented on Factory |
| Validate step | Extend to assert `factory/sdd/dist/docs-mcp.js`, `factory/sdd/mcp.json`, and `factory/sdd/docs-dashboard/dashboard.sh` exist | Prevents silent regressions |

## Impact

- `src/sdd/build.sh` — remove step 7b; add dist copy, docs-dashboard copy, and per-platform MCP config write to unified loop
- `factory/sdd/mcp.json` — new file, written by build
- `factory/sdd/dist/` — new directory, written by build
- `factory/sdd/docs-dashboard/` — new directory, written by build
- No spec files require updates; ADR only

## Scope

All current platforms (claude, factory). Dashboard and MCP are bundled in the factory plugin output but not auto-registered system-wide; the user installs the plugin and Factory loads `mcp.json` from the plugin root automatically.

Deferred: dashboard port configuration, auth, per-platform dashboard launch scripts beyond `dashboard.sh`.

## Integration Test Cases

| Test case | What it verifies | Components exercised |
|-----------|------------------|----------------------|
| After build, `factory/sdd/dist/docs-mcp.js` exists and is a regular file | dist copied to factory | build.sh unified loop |
| After build, `factory/sdd/dist/docs-dashboard.js` exists | dist copied to factory | build.sh unified loop |
| After build, `factory/sdd/docs-dashboard/dashboard.sh` exists and is executable | docs-dashboard copied to factory | build.sh unified loop |
| After build, `factory/sdd/mcp.json` contains `mcpServers` and `DROID_PLUGIN_ROOT` | Factory MCP config written correctly | build.sh unified loop |
| After build, `claude/sdd/.mcp.json` still exists and contains `CLAUDE_PLUGIN_ROOT` (not `mcpServers`) | Claude MCP config unchanged | build.sh unified loop |
| After build, step 7b (standalone `.mcp.json` write outside loop) is gone — Claude config comes from the loop | No duplicate write logic | build.sh |
