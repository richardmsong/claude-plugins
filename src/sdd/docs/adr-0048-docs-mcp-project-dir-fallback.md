# ADR: docs-mcp CLAUDE_PROJECT_DIR fallback and guard /feature-change messaging

**Status**: accepted
**Status history**:
- 2026-04-23: accepted

## Overview

Add `CLAUDE_PROJECT_DIR` as a fallback for docs-mcp's docsRoot resolution so the MCP server automatically finds docs in the user's project when running as a plugin. Also update the source guard's deny message to direct users to `/feature-change`.

## Motivation

When docs-mcp runs as a Claude plugin MCP server, the process cwd is not guaranteed to be the user's project directory. The current fallback chain (`--root` → `process.cwd()`) fails when cwd differs from the project root. `CLAUDE_PROJECT_DIR` is set by Claude Code in the MCP process environment and reliably points to the project. Additionally, relative `--root` paths (e.g. `src/sdd`) need a stable base to resolve against.

The source guard's deny message currently says "Use dev-harness agents instead" which is an implementation detail. Users should be directed to `/feature-change`, the workflow entry point.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| docsRoot priority | `--root` → `CLAUDE_PROJECT_DIR` → `cwd` | `--root` is explicit override; env var is the reliable plugin-context fallback; cwd is last resort |
| Relative --root resolution | Resolve against `CLAUDE_PROJECT_DIR` (if set) or `cwd` | Relative paths like `src/sdd` must resolve against the project root, not an arbitrary cwd |
| Guard deny message | Reference `/feature-change` | Users interact with the skill, not the internal agent machinery |

## Impact

Updates `spec-docs-mcp.md` (Runtime section — already committed in prior spec commit). Affects `docs-mcp` and `source-guard` components.

## Scope

- docs-mcp: 3-line change to docsRoot resolution in `src/index.ts`
- source-guard: 1-line message change in `src/sdd/hooks/guards/source-guard.sh`
