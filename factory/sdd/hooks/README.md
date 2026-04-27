# Droid Hooks — Temporarily Disabled

PreToolUse hooks (source-guard, blocked-commands) are disabled per ADR-0062.

## Why

Factory/Droid does not expose `agent_type` or `subagent_type` in PreToolUse
hook input. Without this field, source-guard cannot distinguish master-session
edits from dev-harness subagent edits — it blocks both identically. Hard
enforcement is impossible.

## Re-enablement criteria

Re-add PreToolUse hooks when Factory adds `agent_type`/`subagent_type` to
PreToolUse hook stdin. The canonical guard scripts remain at
`src/sdd/hooks/guards/` and need only platform-specific I/O wrappers.

## What still works

- Skills (`/plan-feature`, `/feature-change`, `/design-audit`, etc.)
- Subagent spawning (pending exec-mode bug fix — ADR-0057 §1)
- MCP servers
- Context injection (AGENTS.md)
- UserPromptSubmit hook (workflow-reminder, ADR-0059) — when implemented
