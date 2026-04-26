# ADR: Devin CLI Platform Package

**Status**: draft
**Status history**:
- 2026-04-26: draft

## Overview

Add Devin CLI (Devin for Terminal) as a first-class platform in the agent-plugins monorepo, alongside Claude Code and Droid. This creates `devin/sdd/` — a platform package containing a Devin-specific setup skill, hook wrappers, MCP configuration, and symlinks/copies of the shared canonical source from `src/sdd/`.

### Known platform limitations

These are Devin CLI constraints that affect the SDD workflow. They don't block the platform package but degrade the experience compared to Claude Code.

1. **Hook `block`/`deny` kills the agent's turn.** When a PreToolUse hook returns `block` or `deny`, the agent goes silent — it cannot see the reason, recover, or try an alternative. The user must manually nudge the agent to continue. On Claude Code, the agent sees the block reason and adapts in the same turn. This means source-guard and blocked-commands hooks require human supervision on Devin. **Raise with Devin team.**

2. **No `DEVIN_PLUGIN_ROOT` environment variable.** Devin exposes `DEVIN_PROJECT_DIR` but has no equivalent of `CLAUDE_PLUGIN_ROOT` for referencing plugin assets. Hook wrappers and MCP configs must use paths relative to the project root or `$SCRIPT_DIR`.

3. **No subagent context in hook input.** Devin's PreToolUse hook stdin includes `tool_name` and `tool_input` but no `agent_type` or `subagent_type` field. Source-guard hooks cannot distinguish master-session edits from dev-harness subagent edits. Enforcement relies on AGENTS.md rules and Devin's per-agent permission system.

4. **Subagents cannot nest.** Devin subagents cannot spawn sub-subagents. Non-issue for the current SDD workflow (master session drives the loop), but limits future designs where evaluators might invoke dev-harness directly.

5. **No official marketplace/plugin system.** Distribution is manual — users copy files into `.agents/skills/` and `.claude/agents/`. No `devin plugin install` equivalent.

6. **Agent files need Devin-native frontmatter.** Canonical agents use Claude format (`tools: "*"`, `maxTurns`). The Devin build step must rewrite frontmatter to Devin format (`allowed-tools`, `permissions`) and place agents in `.devin/agents/<name>/AGENT.md` subdirectory format. This is normal build-step work, same as model slug rewriting.

## Motivation

Devin CLI is a terminal-based AI coding agent that supports the same extensibility primitives the SDD workflow relies on: skills (`SKILL.md`), custom subagents (`AGENT.md`), MCP servers, lifecycle hooks, and project rules (`AGENTS.md`). The existing three-layer architecture (ADR-0047) was designed to make adding new platforms mechanical — Droid (ADR-0057) proved the pattern. Devin CLI is the next platform to onboard.

Devin CLI also natively reads `.agents/` directories and `AGENTS.md`, and can import `.claude/` configs — so much of the existing infrastructure is already compatible. The primary work is creating the thin platform-specific wrapper layer.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Directory location | `devin/sdd/` | Follows the `<platform>/sdd/` convention from ADR-0047. |
| Marketplace descriptor | Not applicable — no `.devin-plugin/` at repo root | Devin CLI has no official marketplace/plugin system. Distribution is via `.devin/skills/` or `.agents/skills/` directory copy. |
| Distribution strategy | `.agents/` standard directory | Cross-tool compatible — Devin, Claude Code, Cursor, and others all scan `.agents/skills/` natively. Most future-proof. Users copy (or symlink) into `.agents/skills/` and `.agents/agents/`. |
| Plugin root env var | Use `DEVIN_PROJECT_DIR` + relative paths from `$SCRIPT_DIR` | Devin CLI exposes `DEVIN_PROJECT_DIR` but has no `DEVIN_PLUGIN_ROOT` equivalent. Hook wrappers must use `$SCRIPT_DIR` for self-referencing. |
| Context injection file | `AGENTS.md` | Devin CLI natively loads `AGENTS.md` from project root (same as Droid). No separate file needed. |
| Hook registration format | `.devin/hooks.v1.json` or `hooks` key in `.devin/config.json` | Devin CLI supports both. `hooks.v1.json` is recommended as standalone. |
| Hook output format | Exit 0 + `{"decision": "block", "reason": "..."}` on stdout | Wrappers use exit 0 + JSON block. Guard scripts exit 1 on deny, so wrappers translate exit 1 → exit 0 + JSON block. |
| Hook turn-kill limitation | **Known platform limitation** — `block` and `deny` both kill the agent's turn | On Devin, a blocked tool call terminates the agent's turn — it goes silent and cannot recover or try alternatives without user intervention. This does NOT change the hook strategy: blocked actions must stay blocked. A dead turn is better than a corrupted source file or a bypassed workflow. This is a Devin platform gap that should be filed upstream. |
| Hook tool matchers | `exec` for commands, `edit\|write` for file operations | Devin CLI tool names (lowercase). |
| MCP config location | `.devin/config.json` under `mcpServers` key | Devin CLI reads MCP servers from config files, not a separate `.mcp.json`. |
| Agent file format | Flat `.md` files via `.claude/agents/` import | Devin natively imports `.claude/agents/*.md` flat files (documented in subagents.mdx). No format adaptation needed. The build step copies agents into this path. |
| Model slugs | Use short names (`sonnet`) for Devin agents; full identifiers for Claude/Droid | Devin docs only show short names (`sonnet`, `opus`, etc.). ADR-0058's `claude-sonnet-4-6` may not resolve. Build step rewrites `model:` field for Devin agents. |
| Subagent nesting | Not supported in Devin, but non-issue | Devin docs: "Subagents cannot spawn their own subagents." However, the SDD workflow already has the master session drive the dev-harness → evaluator loop. No nesting occurs. |
| Permissions bootstrap | `.devin/config.json` with `permissions.allow` array | Devin uses scope-based permissions: `Read(glob)`, `Write(glob)`, `Exec(prefix)`, `mcp__*`. |
| Setup skill | `devin/sdd/skills/setup/SKILL.md` (real file, not symlinked) | Platform-specific, following the pattern from Claude/Droid. |
| Build step | Extend `src/sdd/build.sh` to produce `devin/sdd/` | Same pattern as Claude build output — real files, no symlinks in distribution. |
| UserPromptSubmit hook | Include from the start (ADR-0059) | Devin CLI supports `UserPromptSubmit` events. Improves workflow compliance after context compaction. |
| Agent invocation | Build-rewritten skill headers per platform | Canonical skills currently hardcode Claude's `Agent(subagent_type=...)`. The Devin build step adds a preamble to each skill mapping invocation syntax: Devin's tool is `run_subagent(profile="<name>", task="<prompt>", title="<label>", is_background=true)`. The Claude build keeps skills as-is. This requires no marker in canonical source — the Devin build prepends the mapping preamble after the YAML frontmatter. |

## User Flow

### Installation (end user)

1. Clone the `agent-plugins` repo (or download `devin/sdd/` directory)
2. Copy `devin/sdd/skills/` into the target project's `.agents/skills/` directory
3. Copy `devin/sdd/agents/` into `.claude/agents/` (Devin imports flat `.md` files from this path)
4. Copy `devin/sdd/hooks/*.sh` into `.devin/hooks/` and `devin/sdd/hooks/guards/` into `.devin/hooks/guards/`
5. Copy `devin/sdd/hooks.v1.json` to `.devin/hooks.v1.json` (top-level in `.devin/`, not a subdirectory)
6. Copy `devin/sdd/dist/` into `.devin/dist/`
7. Run `/setup` in a Devin CLI session to scaffold `AGENTS.md`, `spec-driven-config.json`, MCP config, and permissions

### First run (after installation)

1. User invokes `/setup` in a Devin CLI session
2. **Path resolution:** `TARGET="${DEVIN_PROJECT_DIR:-.}"` (project root). No plugin root var — all paths relative to `$TARGET`.
3. **Write `spec-driven-config.json`** (if absent):
   ```json
   {
     "source_dirs": ["src/**", "lib/**", "packages/**"],
     "blocked_commands": [
       {"pattern": "gh\\s+run\\s+watch", "message": "Blocks until timeout. Use 'gh run view {id}' to poll.", "category": "ban"},
       {"pattern": "git\\s+apply", "message": "Bypasses the spec→dev-harness→evaluator loop. Use /feature-change.", "category": "ban"}
     ]
   }
   ```
4. **Upsert `AGENTS.md`** — read `context.md` from the installed package. If `AGENTS.md` exists, replace content between `<!-- sdd:begin -->` and `<!-- sdd:end -->` markers (preserve user content outside markers). If absent, create with markers wrapping the context content.
5. **Write `.devin/config.json`** (merge with existing if present):
   ```json
   {
     "mcpServers": {
       "docs": {
         "command": "bun",
         "args": ["run", ".devin/dist/docs-mcp.js", "--root", "."]
       }
     },
     "permissions": {
       "allow": ["Read(**)", "Exec(git)", "Exec(bun)", "mcp__docs__*"],
       "ask": ["Write(**)", "Exec(*)"]
     }
   }
   ```
6. **First-time detection:** Check for `.agent/master-config.json`. If absent, this is first run — display the SDD tutorial (explains workflow, available skills, how `/feature-change` works).
7. **Verify:** Confirm `spec-driven-config.json`, `AGENTS.md`, `.devin/config.json`, `.devin/hooks.v1.json`, `.devin/dist/docs-mcp.js` all exist.

### Development workflow (after setup)

User says "add feature X" → Devin CLI loads `AGENTS.md` → routes to `/feature-change` → SDD loop runs (ADR → spec → dev-harness → evaluator → done).

Hooks fire on every tool use:
- `exec` → `blocked-commands-hook.sh` → checks against `spec-driven-config.json`
- `edit|write` → `source-guard-hook.sh` → prevents direct source edits by master session
- `UserPromptSubmit` → `workflow-reminder-hook.sh` → reminds agent of SDD workflow

## Component Changes

### `devin/sdd/` (NEW — Devin platform package)

**Structure:**
```
devin/sdd/
├── skills/
│   ├── setup/
│   │   └── SKILL.md                   # Devin-specific setup (real file)
│   ├── feature-change/                # symlink → src/sdd/.agent/skills/feature-change
│   ├── plan-feature/                  # symlink → src/sdd/.agent/skills/plan-feature
│   ├── design-audit/                  # symlink → src/sdd/.agent/skills/design-audit
│   ├── spec-evaluator/                # symlink → src/sdd/.agent/skills/spec-evaluator
│   ├── implementation-evaluator/      # symlink → src/sdd/.agent/skills/implementation-evaluator
│   ├── file-bug/                      # symlink → src/sdd/.agent/skills/file-bug
│   └── dashboard/                     # symlink → src/sdd/.agent/skills/dashboard
├── agents/                            # Flat .md files (Devin imports from .claude/agents/); installed to target's .claude/agents/
├── hooks.v1.json                      # Devin hook registration (flat schema, lives at .devin/ root)
├── hooks/
│   ├── blocked-commands-hook.sh       # Devin I/O wrapper
│   ├── source-guard-hook.sh           # Devin I/O wrapper
│   ├── workflow-reminder-hook.sh      # Devin I/O wrapper (ADR-0059)
│   └── guards/                        # symlink → src/sdd/hooks/guards/
├── dist/                              # Pre-built MCP server + dashboard (build artifact)
│   ├── docs-mcp.js
│   ├── docs-dashboard.js
│   └── ui/
└── context.md                         # symlink → src/sdd/context.md
```

**`hooks.v1.json`** (flat schema — no `"hooks"` wrapper key, unlike Claude/Droid):
```json
{
  "PreToolUse": [
    {
      "matcher": "exec",
      "hooks": [{"type": "command", "command": "bash .devin/hooks/blocked-commands-hook.sh"}]
    },
    {
      "matcher": "edit|write",
      "hooks": [{"type": "command", "command": "bash .devin/hooks/source-guard-hook.sh"}]
    }
  ],
  "UserPromptSubmit": [
    {
      "hooks": [{"type": "command", "command": "bash .devin/hooks/workflow-reminder-hook.sh"}]
    }
  ]
}
```

**Hook wrappers** translate Devin's JSON stdin/stdout to the agent-neutral guard script contract:
- Bridge `DEVIN_PROJECT_DIR` → `CLAUDE_PROJECT_DIR` (guards read the latter)
- Parse Devin's JSON to extract `tool_input.command` (blocked-commands) or `tool_input.file_path` (source-guard)
- Guard scripts exit 1 on deny; wrappers translate exit 1 → exit 0 + `{"decision": "block", "reason": "<text>"}`
- **Known Devin platform issue:** Both `block` and `deny` kill the agent's turn — it goes silent and requires user intervention to continue. This is a Devin CLI bug/limitation to raise with the Devin team. The correct behavior (as Claude Code does) is to let the agent see the block reason and continue its turn with an alternative approach. Despite this limitation, hooks still use `block` — a dead turn is better than letting a guarded action through.
- **workflow-reminder wrapper** wraps guard stdout in `{"add_context": "<text>"}` (Devin's context injection format, unlike Claude's plain-text stdout)

### `src/sdd/build.sh` (MODIFIED)

Add a Devin build target that:
1. Copies skills (excluding `local-setup`) into `devin/sdd/skills/`
2. Prepends a Devin-specific invocation preamble after the YAML frontmatter in each copied skill. The preamble maps Claude's `Agent(subagent_type="<name>")` to Devin's `run_subagent(profile="<name>", task="<prompt>", title="<label>", is_background=true)`. No marker needed in canonical source — Claude build copies skills verbatim (they already use Claude syntax).
3. Translates skill frontmatter: `user_invocable: true` → adds `triggers: [user, model]` (Devin's equivalent)
4. Copies agents (flat `.md` files) into `devin/sdd/agents/`, rewrites `model: claude-sonnet-4-6` → `model: sonnet`
5. Copies guard scripts into `devin/sdd/hooks/guards/`
6. Copies compiled `dist/` assets (docs-mcp.js, docs-dashboard.js, ui/)
7. Copies `context.md`
8. Writes `hooks.v1.json` (flat Devin schema, as shown above)
9. Writes hook wrapper scripts with `$SCRIPT_DIR`-relative paths to guards

### `src/sdd/.agent/skills/local-setup/SKILL.md` (MODIFIED)

Add Devin-specific local-dev symlink steps:
- Symlink skills into `.devin/skills/`
- Symlink agents into `.devin/agents/`
- Write `.devin/config.json` with MCP server pointing to TypeScript source (not compiled JS)
- Write `.devin/hooks.v1.json` for hook registration

### `AGENTS.md` (UNCHANGED)

Already exists at repo root with SDD workflow rules. Devin CLI loads this natively — no changes needed.

## Data Model

No new data model changes. The plugin reuses:
- `spec-driven-config.json` — blocked commands + source-dir protection (shared across platforms)
- `.agent/audits/` — evaluator output (shared)
- `.agent/bugs/` — bug reports (shared)
- `.agent/master-config.json` — source-dir patterns (shared)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `bun` not installed | Setup skill detects and instructs user to install Bun |
| MCP server fails to start | Setup skill validates config; Devin CLI shows MCP connection error |
| Hook script fails (exit 1) | Devin CLI treats exit 1 as error (logged, doesn't block). Wrappers translate guard's exit 1 → exit 0 + JSON block. If wrapper itself errors, Devin default-allows. |
| Hook returns `block` or `deny` | **Devin platform issue:** agent's turn is killed — goes silent, requires user intervention. Filed as upstream issue. Hooks still use `block` because letting guarded actions through is worse. |
| Guard script missing config | Guard scripts exit 0 (no-op) when `spec-driven-config.json` absent |
| Agent model not recognized | Build step rewrites `model: claude-sonnet-4-6` to `model: sonnet` for Devin agents |
| Subagent tries to spawn sub-subagent | Non-issue — SDD workflow doesn't nest. Devin denies the tool but no SDD agent attempts this. |

## Security

- Hook wrappers run with user's shell permissions (same as Claude/Droid)
- Guard scripts are read-only checks — they deny/allow but never modify state
- No secrets stored in platform package
- MCP server runs locally via stdio (no network exposure)

## Scope

### In v1
- Devin platform package (`devin/sdd/`) with setup skill, hooks, and build target
- Hook wrappers for `exec`, `edit|write`, and `UserPromptSubmit`
- Agent files distributed via `.claude/agents/` import path (flat `.md` format, v1)
- MCP server integration (docs-mcp via `.devin/config.json`)
- Local-setup support for self-development
- Build step producing self-contained distribution
- Permissions bootstrap in `.devin/config.json`

### Deferred
- Dashboard skill (requires Playwright MCP — Devin has it but needs testing)
- Native Devin `.devin/agents/<name>/AGENT.md` format (experimental in Devin CLI, may change) — v1 uses `.claude/agents/` import instead
- Automated install script / package manager integration
- Cross-platform CI testing for Devin CLI
- OpenCode platform package (separate ADR)

## Prerequisites

- **ADR-0059 (workflow-enforcement-hook)**: Must be implemented first — `src/sdd/hooks/guards/workflow-reminder.sh` does not exist yet. The Devin `UserPromptSubmit` hook depends on it.

## Impact

- **spec-agents.md**: Add note about Devin model slug rewriting (`claude-sonnet-4-6` → `sonnet`)
- **conventions.md**: Add Devin-specific discovery paths: `.devin/skills/`, `.agents/skills/`, `.devin/agents/`, `.agents/agents/`, `.claude/agents/` (import), `.devin/config.json`, `.devin/hooks.v1.json`
- **build.sh**: Extended with Devin build target (9 steps as described above)
- **local-setup skill**: Extended with Devin symlink steps
- **Canonical skills**: No changes — Devin build prepends preamble, doesn't require markers

## Open questions

None — all design questions resolved.
