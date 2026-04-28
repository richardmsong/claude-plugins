# ADR: UserPromptSubmit hook for workflow enforcement

**Status**: accepted
**Status history**:
- 2026-04-25: accepted

## Overview

Add a `UserPromptSubmit` hook that injects a mandatory `/feature-change` reminder into the agent's context on every user message. This ensures the agent follows the SDD workflow even after context compaction drops the AGENTS.md / CLAUDE.md instructions.

## Motivation

The SDD workflow rules are injected into CLAUDE.md (Claude Code) and AGENTS.md (Droid) at session start. However:

1. After compaction, these instructions are summarized or lost entirely.
2. Even when the instructions are in context, the agent can and does choose to ignore them -- implementing changes directly instead of invoking `/feature-change`.
3. The existing PreToolUse hooks (source-guard, blocked-commands) only block specific tool calls. They don't prevent the agent from skipping the ADR/spec workflow entirely.

The only mechanism that survives compaction and fires before every agent response is a `UserPromptSubmit` hook. By injecting the workflow reminder as context on every user message, the agent receives the instruction fresh every time, regardless of compaction state.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hook event | `UserPromptSubmit` | Fires before the agent processes each user message. Injects `additionalContext` that the agent sees as part of the prompt. Survives compaction because it's re-injected on every message. |
| Injection method | Exit code 0 with stdout (simple mode) | `UserPromptSubmit` is the one hook where stdout on exit 0 is added to agent context. Simplest implementation -- no JSON output needed. |
| Reminder content | Short, imperative, action-specific | Must be concise to minimize token overhead per message. Focuses on the single most-violated rule: invoke `/feature-change` before implementing. |
| Scope | Both platforms (Claude Code + Droid) | Hook is added to `claude/sdd/hooks/hooks.json` and `factory/sdd/hooks/hooks.json`. Local dev is covered by the existing `.factory/hooks -> factory/sdd/hooks` symlink (created by `/local-setup`), so no `.factory/settings.json` edit is needed. |
| Script location | Shared script at `src/sdd/hooks/guards/workflow-reminder.sh` | Same pattern as blocked-commands and source-guard: agent-neutral script in `src/sdd/hooks/guards/`, platform wrappers in `claude/sdd/hooks/` and `droid/sdd/hooks/`. |
| Implementation | Simple echo script, no stdin parsing needed | The hook doesn't need to inspect the prompt. It unconditionally injects the reminder. |

## Impact

- New: `src/sdd/hooks/guards/workflow-reminder.sh`
- New: `claude/sdd/hooks/workflow-reminder-hook.sh` (Claude I/O wrapper)
- New: `factory/sdd/hooks/workflow-reminder-hook.sh` (Droid I/O wrapper)
- Edit: `claude/sdd/hooks/hooks.json` -- add `UserPromptSubmit` entry
- Edit: `factory/sdd/hooks/hooks.json` -- add `UserPromptSubmit` entry
- No `.factory/settings.json` edit needed -- `.factory/hooks` symlinks to `factory/sdd/hooks/` via `/local-setup`

No specs updated -- this is a process enforcement mechanism, not a behavior change to any component.

## Scope

### In v1
- `UserPromptSubmit` hook that injects workflow reminder on every user message
- Wired into both platform hook configs (local dev covered by existing symlink)

### Deferred
- Prompt-aware filtering (only inject when the message looks like a change request)
- Token-budget-aware injection (skip if context is near limit)
