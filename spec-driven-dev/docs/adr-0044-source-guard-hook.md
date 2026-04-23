# ADR: Hook-based source guard replaces --disallowedTools

**Status**: accepted
**Status history**:
- 2026-04-23: accepted

## Overview

Replace the `--disallowedTools` approach in `sdd-master` with a PreToolUse hook (`source-guard-hook.sh`) that blocks source file edits only for registered master sessions. Subagents pass through because they have different session IDs.

## Motivation

ADR-0026 specified that `sdd-master` reads `master-config.json` and generates `--disallowedTools Edit(<glob>) Write(<glob>)` flags. This **cascades to all subagents** spawned by the master session — including dev-harness agents that need to edit source files. The result: dev-harness agents get "File is in a directory that is denied by your permission settings" on Edit/Write calls, defeating the purpose of the master/agent separation.

A hook-based guard solves this because hooks receive the caller's `session_id` in the input JSON. The master session's session ID is captured and registered; subagents have different session IDs and are allowed through.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Guard mechanism | PreToolUse hook on Edit\|Write | Hooks receive `session_id`, enabling per-session blocking without cascading to subagents |
| Session tracking | `.agent/.master-sessions` file with one session ID per line | Supports multiple concurrent sdd-master sessions; simple grep-based lookup |
| Registration trigger | First Edit/Write call from a session with an empty marker file | Lazy registration — session ID is only available inside the hook via stdin JSON, not at launch time |
| Marker file lifecycle | sdd-master creates empty marker, hook writes session ID into it, EXIT trap reads marker to deregister | Clean separation: sdd-master owns create/cleanup, hook owns registration |
| Pattern matching | Python `fnmatch` on relative paths against `source_dirs` globs | Consistent with the glob patterns already in `master-config.json` |

## Impact

Supersedes the `--disallowedTools` generation logic described in ADR-0026 (section "sdd-master entrypoint", lines 227-255). The `master-config.json` format and `source_dirs` field are unchanged — only the enforcement mechanism changes.

Files changed:
- `bin/sdd-master` — removes `--disallowedTools`, adds marker file lifecycle + EXIT trap
- `hooks/source-guard-hook.sh` — new PreToolUse hook
- `hooks/hooks.json` — adds `Edit|Write` matcher entry

Conventions updated:
- `docs/conventions.md` — documents `.master-sessions` in `.agent/` directory listing

## Scope

**In scope (v1):**
- Hook-based source guard for Edit and Write tools
- Multi-session support via `.master-sessions` registry
- Marker file + EXIT trap for clean deregistration

**Deferred:**
- Hook-based guard for Bash tool (file writes via shell commands) — blocked-commands-hook.sh already covers dangerous shell commands separately
- Automatic stale session cleanup (crash without trap firing) — low risk, manual cleanup is trivial
