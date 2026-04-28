# Spec: Hooks

Living reference for the hook infrastructure in the SDD plugin. Hooks provide deterministic enforcement of SDD workflow rules via platform hook systems (Claude Code `PreToolUse`/`UserPromptSubmit`, Factory/Droid `PreToolUse`/`UserPromptSubmit`, Devin `UserPromptSubmit`).

## Architecture

Hooks follow a two-layer pattern:

1. **Canonical guard scripts** (`src/sdd/hooks/guards/`) — agent-neutral, platform-independent logic. Accept arguments, exit 0 (allow) or 1 (deny with reason on stderr).
2. **Platform I/O wrappers** (`<platform>/sdd/hooks/`) — read platform-specific JSON from stdin, extract relevant fields, call the canonical guard, and format the response for the platform's hook protocol.

This separation means guard logic is written once and tested once. Adding a new platform requires only a new I/O wrapper.

## Guard Scripts

### `blocked-commands.sh`

Blocks dangerous shell commands. Reads rules from `spec-driven-config.json` in the project root.

| Field | Value |
|-------|-------|
| Path | `src/sdd/hooks/guards/blocked-commands.sh` |
| Interface | `$1` = command string. Exit 0 = allow, exit 1 = deny (reason on stderr). |
| Config | `spec-driven-config.json` → `blocked_commands[]` array. Each entry: `{ category, pattern, message }`. |
| Categories | `ban` (always denied), `guard` (denied unless `SDD_DEBUG=1`). |
| No config | No-op (exit 0). Project hasn't opted in. |

### `source-guard.sh`

Blocks master-session edits to source files. Reads `source_dirs` patterns from `spec-driven-config.json`.

| Field | Value |
|-------|-------|
| Path | `src/sdd/hooks/guards/source-guard.sh` |
| Interface | `$1` = file path. Exit 0 = allow, exit 1 = deny (reason on stderr). |
| Config | `spec-driven-config.json` → `source_dirs[]` array of glob patterns. |
| No config | No-op (exit 0). No restrictions. |
| Prerequisite | Platform must expose `agent_type` in hook input so the wrapper can bypass the guard for subagents. |

### `workflow-reminder.sh`

Injects SDD workflow reminder into agent context on every user message. Does not inspect the prompt — unconditional injection.

| Field | Value |
|-------|-------|
| Path | `src/sdd/hooks/guards/workflow-reminder.sh` |
| Interface | No arguments, no stdin parsing. Prints reminder to stdout, exits 0. |
| Hook event | `UserPromptSubmit` |
| Output | Short, imperative reminder focused on invoking `/feature-change` before implementing changes. |

## Platform Hook Wrappers

### Claude Code (`claude/sdd/hooks/`)

| Wrapper | Guard | Hook Event | Notes |
|---------|-------|------------|-------|
| `blocked-commands-hook.sh` | `blocked-commands.sh` | `PreToolUse` (Execute) | Reads `tool_input.command` from JSON stdin. Returns JSON with `permissionDecision: deny` on block. |
| `source-guard-hook.sh` | `source-guard.sh` | `PreToolUse` (Edit\|Create) | Reads `tool_input.file_path` from JSON stdin. Bypasses guard when `agent_type` is present (subagent). Returns JSON with `permissionDecision: deny` on block. |
| `workflow-reminder-hook.sh` | `workflow-reminder.sh` | `UserPromptSubmit` | Calls guard, passes stdout through. Exit 0 stdout is added to agent context by Claude Code. |

### Factory/Droid (`factory/sdd/hooks/`)

| Wrapper | Guard | Hook Event | Status | Notes |
|---------|-------|------------|--------|-------|
| `workflow-reminder-hook.sh` | `workflow-reminder.sh` | `UserPromptSubmit` | Planned (ADR-0059) | Same pattern as Claude Code wrapper. |

PreToolUse hooks (source-guard, blocked-commands) are **temporarily disabled** on Droid per ADR-0062. Droid does not expose `agent_type` in PreToolUse hook input, making source-guard impossible. Re-enable when Droid adds `agent_type`/`subagent_type` to PreToolUse hook stdin.

### Devin (`.devin/hooks/`)

| Wrapper | Guard | Hook Event | Status | Notes |
|---------|-------|------------|--------|-------|
| `workflow-reminder-hook.sh` | `workflow-reminder.sh` | `UserPromptSubmit` | Deferred — ADR-0060 is draft | Devin context injection format may differ from Claude Code. Implement when ADR-0060 is accepted. |

PreToolUse hooks are **temporarily disabled** on Devin per ADR-0062 for the same `agent_type` reason. Additionally, Devin kills the agent's turn on any hook block/deny (ADR-0060 §1).

## Hook Registration

Each platform registers hooks in a `hooks.json` file:

### Claude Code (`claude/sdd/hooks/hooks.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/blocked-commands-hook.sh\"" }] },
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/source-guard-hook.sh\"" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/workflow-reminder-hook.sh\"" }] }
    ]
  }
}
```

### Factory/Droid (`factory/sdd/hooks/hooks.json`)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "bash \"${DROID_PLUGIN_ROOT}/hooks/workflow-reminder-hook.sh\"" }] }
    ]
  }
}
```

PreToolUse entries omitted per ADR-0062.

## Local Development

The `/local-setup` skill creates a symlink `.factory/hooks -> factory/sdd/hooks`. This means edits to `factory/sdd/hooks/hooks.json` take effect immediately during local development without a separate `.factory/settings.json` hook entry.

## Build Integration

The `src/sdd/build.sh` script handles hook distribution for the Claude Code plugin:

1. Copies canonical guard scripts to `claude/sdd/hooks/guards/`
2. Rewrites `GUARD=` paths in wrappers to use `${CLAUDE_PLUGIN_ROOT}` instead of relative source paths

The Factory/Droid plugin is not built — it is authored directly and symlinked for local dev.

## Related ADRs

| ADR | Status | Relevance |
|-----|--------|-----------|
| ADR-0059 | accepted | Designs the `UserPromptSubmit` workflow-reminder hook |
| ADR-0060 | draft | Devin platform package — includes hook wrappers |
| ADR-0062 | implemented | Removes PreToolUse hooks from Droid and Devin (temporarily) |
