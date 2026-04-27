# ADR: Remove hooks from Factory/Droid and Devin platform packages

**Status**: accepted
**Status history**:
- 2026-04-27: draft
- 2026-04-27: accepted

## Overview

Strip all PreToolUse hooks (source-guard and blocked-commands) from the Droid and Devin platform packages. Neither platform exposes `agent_type`/`subagent_type` in hook input, making hard enforcement impossible. Soft enforcement (AGENTS.md rules that vanish on compaction) is not acceptable -- the SDD contract requires mechanical guarantees. Skills remain; hooks go.

## Motivation

The harness maturity scorecard (2026-04-27) established a hard rule: **enforcement must be hard**. Without `agent_type` in PreToolUse stdin, the source-guard hook cannot distinguish master-session edits from subagent edits. On both Droid and Devin, the hook blocks _everyone_ identically -- including the dev-harness subagent that is supposed to write code. This makes hooks actively harmful rather than protective:

1. **Source-guard blocks the wrong caller.** On Droid, ADR-0057 §3 documents this empirically: the subagent gets `"master session cannot edit ..."` because the hook can't tell it's a subagent. On Devin, ADR-0060 §3 acknowledges the same gap and excluded source-guard from v1.

2. **Blocked-commands has limited value without source-guard.** The blocked-commands hook prevents specific shell commands (e.g. `git apply`, `gh run watch`), but if the master session can freely edit source files, command blocking is a speed bump on a highway with no guardrails.

3. **Hook-block turn-kill on Devin.** ADR-0060 §1 documents that Devin kills the agent's turn on any hook block/deny. The agent goes silent and requires manual intervention. Hooks that fire become UX hazards.

4. **Skills still work.** Skill discovery, invocation, subagent spawning (on Devin -- Droid has the separate exec-mode bug), MCP, and context injection all function independently of hooks. Removing hooks does not break the skill layer.

The hooks can be re-added when the platforms expose `agent_type` in hook input. Until then, they create the illusion of enforcement without the substance.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope of removal | Remove source-guard AND blocked-commands from both Droid and Devin | Without source-guard, blocked-commands provides marginal value. Clean removal avoids partial enforcement that misleads users into thinking protections exist. |
| Workflow-reminder hook (ADR-0059) | Keep on both Droid and Devin | It's the one enforcement mechanism that survives compaction. Does not depend on `agent_type`. Unconditional context injection. On Devin, hook errors could kill the turn, but the script is a simple echo with no failure modes. |
| Claude Code hooks | Unchanged | Claude Code exposes `agent_type` in PreToolUse stdin. Hard enforcement works. No changes. |
| Canonical guard scripts (`src/sdd/hooks/guards/`) | Unchanged | These are agent-neutral scripts. They stay as the canonical source for when platforms add `agent_type` support. |
| `.factory/settings.json` (local dev) | Remove hook entries, keep `commandAllowlist` | Hooks are non-functional locally for the same reason. `commandAllowlist` is independent of hooks. |
| Devin hooks | Remove PreToolUse hooks from `.devin/hooks/`. Keep `UserPromptSubmit` (workflow-reminder). | ADR-0060 is still draft with no implemented hooks. This narrows the planned scope -- hooks are temporarily disabled, not abandoned. |
| ADR-0057 (Droid) amendment | Amend in place -- still draft | ADR-0057 is still draft. Add a note that PreToolUse hooks are temporarily disabled per this ADR. Feature is planned, not cancelled. |
| ADR-0060 (Devin) amendment | Amend in place -- still draft | ADR-0060 is still draft. Narrow the hooks scope: remove PreToolUse hooks, keep UserPromptSubmit. Feature is temporarily disabled pending upstream `agent_type` support. |
| `droid/sdd/hooks/` directory | Keep as empty placeholder with README | Signals that hooks are planned and documents re-enablement criteria. |
| Re-enablement criteria | Platforms must add `agent_type`/`subagent_type` to PreToolUse hook input | Hooks are re-added when hard enforcement becomes possible. Not before. |

## User Flow

### Before (current state)

1. User sets up Droid/Devin platform package
2. Hooks are registered and fire on every tool call
3. Source-guard blocks both master AND subagent edits (Droid) or is absent (Devin)
4. Blocked-commands fires but provides marginal protection
5. On Devin, any hook block kills the agent's turn

### After (this ADR)

1. User sets up Droid/Devin platform package
2. No PreToolUse hooks are registered. UserPromptSubmit (workflow-reminder) remains active.
3. Skills work as before: `/plan-feature`, `/feature-change`, `/design-audit`, etc.
4. SDD workflow is enforced by AGENTS.md rules + UserPromptSubmit reminder -- acknowledged as soft enforcement, documented as a known limitation
5. No PreToolUse hook-related UX disruptions (turn-kills, false blocks)

## Component Changes

### `droid/sdd/hooks/` (MODIFIED)

Remove PreToolUse hook wrappers and guard symlinks. Keep directory with README explaining re-enablement criteria. Keep workflow-reminder hook (if/when implemented per ADR-0059).

**Remove:**
- `blocked-commands-hook.sh` -- Droid I/O wrapper for PreToolUse
- `source-guard-hook.sh` -- Droid I/O wrapper for PreToolUse
- `guards/` -- symlinks to canonical guard scripts

**Modify:**
- `hooks.json` -- remove all `PreToolUse` entries. Keep `UserPromptSubmit` entry (workflow-reminder, ADR-0059) if present.

**Add:**
- `README.md` -- documents why hooks are disabled and when they'll be re-enabled (requires `agent_type` in PreToolUse input).

### `.factory/settings.json` (MODIFIED)

Remove `hooks` key entirely. Keep `commandAllowlist` (independent of hooks).

### `.devin/hooks.v1.json` (MODIFIED)

Remove all `PreToolUse` entries. Add `UserPromptSubmit` entry for workflow-reminder (ADR-0059) when implemented.

### `.devin/hooks/` (MODIFIED)

Remove PreToolUse hook wrappers (`blocked-commands-hook.sh`, `source-guard-hook.sh`). Keep directory for workflow-reminder hook.

### ADR-0057 (AMENDED in place)

Add note to blocking issues: "PreToolUse hooks temporarily disabled per ADR-0062. Re-enable when Factory adds `agent_type`/`subagent_type` to PreToolUse hook input."

### ADR-0060 (AMENDED in place)

Narrow hooks scope in decisions table and component changes: PreToolUse hooks are temporarily disabled per ADR-0062. `UserPromptSubmit` (workflow-reminder) remains in scope.

## Data Model

No changes.

## Error Handling

No changes. Removing hooks removes error paths (hook failures, turn-kills).

## Security

Enforcement is weaker without hooks. This is acknowledged and documented:
- AGENTS.md rules remain but are vulnerable to context compaction
- UserPromptSubmit hook (if kept) partially mitigates by re-injecting reminders
- Hard enforcement is deferred until platforms add `agent_type` support

## Impact

- **harness-maturity-scorecard.md**: Update hooks platform section to reflect temporary removal. Note that hooks are N/A (temporarily disabled), not Missing (never planned).
- **spec-agents.md**: No change (agents are independent of hooks)
- **ADR-0057**: Amend blocking issues section -- note PreToolUse hooks temporarily disabled per this ADR
- **ADR-0060**: Amend decisions table and component changes -- narrow hooks scope to UserPromptSubmit only

## Scope

### In v1
- Remove source-guard hook from Droid platform package
- Remove blocked-commands hook from Droid platform package
- Remove hooks from `.factory/settings.json` (local dev)
- Remove hooks from Devin platform package (if they exist beyond ADR-0060 draft)
- Update scorecard and impacted docs

### Deferred
- Re-add hooks when platforms expose `agent_type` in PreToolUse input
- Investigate alternative enforcement mechanisms (e.g. session-ID-based guards)

## Open questions

None -- all resolved.
