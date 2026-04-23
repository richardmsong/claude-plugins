# ADR: Agent-Abstract Plugin Packaging

**Status**: implemented
**Status history**:
- 2026-04-23: draft
- 2026-04-23: accepted
- 2026-04-23: implemented — all scope CLEAN

## Overview

Restructure the plugin repository into three layers: (1) an agent-neutral canonical source in `src/sdd/` containing skills, agents, MCP servers, guard logic, and context rules; (2) per-platform package directories (`claude/sdd/`, `droid/sdd/`) with platform-specific metadata, setup skills, and symlinks back to the canonical source; and (3) per-marketplace distribution metadata at the repo root. Rename the repo from `claude-plugins` to `agent-plugins`.

## Motivation

The plugin's installation story evolved through three ADRs and ended up tightly coupled to Claude Code:
- ADR-0026 introduced the Claude Code plugin format (`.claude-plugin/`, marketplace, `/plugin install`)
- ADR-0043 restructured to vendor-neutral `.agent/` layout, added `install.sh`
- ADR-0046 removed `install.sh`, consolidating to Claude-only installation

The result: Droid and other agents can read `.agent/skills/` if already in place, but there's no path to get them there without Claude. The packaging conflates platform-specific distribution metadata with the actual plugin data.

The goal: separate the plugin's core data from any specific agent's install mechanism so that Claude and Droid (and future agents) are equally first-class consumers. Each platform has its own thin package directory that wraps the shared source for that platform's marketplace.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repo name | `agent-plugins` (renamed from `claude-plugins`) | Platform-neutral. Clearly a plugin marketplace for any agent. |
| Repo structure | Monorepo: `src/` + per-platform dirs, marketplace at root | `src/sdd/` is the canonical source. `claude/sdd/` and `droid/sdd/` are platform packages with symlinks. Marketplace descriptors stay at repo root (platforms require them there). |
| Canonical source scope | Everything non-platform-specific | Skills, agents, docs-mcp source, dashboard, binaries, guard scripts, context.md, docs/ADRs. Platform dirs contain only: marketplace metadata, platform-specific setup skill, hook registration, and symlinks. |
| Platform packages | Relative symlinks to canonical source | Platform dirs use relative symlinks to `src/sdd/` for shared data. Symlinks must be relative (not absolute) so they survive cloning to any path. Platforms clone the whole repo, so symlinks resolve. No build step needed. |
| Skills directory | Per-skill symlinks + platform setup alongside | Each platform's `skills/` dir has individual symlinks to `src/sdd/.agent/skills/<name>` for shared skills, plus a real `setup/SKILL.md` for platform-specific setup. Agent scans one directory, finds everything. |
| Setup skills | Per-platform, self-contained | Each platform ships its own complete setup skill. No shared base. Each is independently readable and agent-native. |
| Context injection | Canonical `context.md` + per-platform adapters | `src/sdd/context.md` has the workflow rules. Each platform's setup translates into native format (CLAUDE.md markers, AGENTS.md, etc). One place to edit rules. |
| Hooks / guards | Ship guard logic as code, defer Droid format | Guard scripts in `src/sdd/hooks/guards/`. Claude wires them via `hooks/hooks.json`. Droid format TBD when known. No premature I/O abstraction. |
| Package manifest | No manifest — convention + well-known files | `.agent/` = skills/agents (scanned). `.mcp.json` = MCP servers (auto-discovered). Directory structure IS the format. |
| Agent detection | Env var detection | Check CLAUDE_PLUGIN_ROOT (Claude), DROID_HOME (Droid), etc. Falls back to prompt. |
| Droid v1 scope | Stub now, flesh out later | `droid/sdd/` with symlinks and README. No Droid-specific metadata or setup yet. Demonstrates the pattern. |

## User Flow

### Claude Code user
1. Add marketplace to settings:
   ```json
   "extraKnownMarketplaces": {
     "agent-plugins": {
       "source": { "source": "github", "repo": "<user>/agent-plugins" }
     }
   }
   ```
2. `/plugin install spec-driven-dev@agent-plugins`
3. Claude reads `.claude-plugin/marketplace.json` → finds plugin at `claude/sdd/` → installs
4. Run `/setup` in target project → compiles binary, symlinks skills/agents, scaffolds CLAUDE.md, bootstraps permissions

### Droid user (future)
1. Install via Droid's native mechanism (reads `.droid-plugin/marketplace.json` at root)
2. Droid finds plugin at `droid/sdd/` → installs
3. Run Droid's equivalent setup → compiles binary, symlinks, scaffolds context

## Component Changes

### Repo layout (after)

```
agent-plugins/
├── .claude-plugin/
│   └── marketplace.json                  # Claude marketplace root
├── .droid-plugin/
│   └── marketplace.json                  # Droid marketplace root (stub)
├── src/
│   └── sdd/                              # CANONICAL SOURCE
│       ├── .agent/
│       │   ├── skills/
│       │   │   ├── plan-feature/SKILL.md
│       │   │   ├── feature-change/SKILL.md
│       │   │   ├── design-audit/SKILL.md
│       │   │   ├── spec-evaluator/SKILL.md
│       │   │   ├── file-bug/SKILL.md
│       │   │   └── dashboard/SKILL.md
│       │   └── agents/
│       │       ├── design-evaluator.md
│       │       ├── dev-harness.md
│       │       └── spec-evaluator.md
│       ├── docs-mcp/                     # MCP server source
│       ├── docs-dashboard/               # Dashboard source
│       ├── bin/
│       │   ├── docs-mcp                  # Compiled binary
│       │   └── sdd-master                # Master entrypoint
│       ├── hooks/
│       │   └── guards/
│       │       ├── blocked-commands.sh   # Agent-neutral guard logic
│       │       └── source-guard.sh       # Agent-neutral guard logic
│       ├── context.md                    # Canonical workflow rules
│       ├── package.json                  # Workspace config
│       └── docs/                         # ADRs and specs
├── claude/
│   └── sdd/                              # CLAUDE PLATFORM PACKAGE
│       ├── .claude-plugin/
│       │   └── plugin.json               # Claude metadata
│       ├── .mcp.json                     # Claude MCP config
│       ├── hooks/
│       │   ├── hooks.json                # Claude hook registration
│       │   ├── blocked-commands-hook.sh  # Claude I/O wrapper
│       │   └── source-guard-hook.sh      # Claude I/O wrapper
│       ├── skills/
│       │   ├── setup/SKILL.md            # Claude-specific setup (real file)
│       │   ├── plan-feature -> ../../../src/sdd/.agent/skills/plan-feature
│       │   ├── feature-change -> ../../../src/sdd/.agent/skills/feature-change
│       │   ├── design-audit -> ../../../src/sdd/.agent/skills/design-audit
│       │   ├── spec-evaluator -> ../../../src/sdd/.agent/skills/spec-evaluator
│       │   ├── file-bug -> ../../../src/sdd/.agent/skills/file-bug
│       │   └── dashboard -> ../../../src/sdd/.agent/skills/dashboard
│       └── agents -> ../../src/sdd/.agent/agents
├── droid/
│   └── sdd/                              # DROID PLATFORM PACKAGE (stub)
│       ├── skills/
│       │   ├── plan-feature -> ../../../src/sdd/.agent/skills/plan-feature
│       │   ├── feature-change -> ../../../src/sdd/.agent/skills/feature-change
│       │   ├── design-audit -> ../../../src/sdd/.agent/skills/design-audit
│       │   ├── spec-evaluator -> ../../../src/sdd/.agent/skills/spec-evaluator
│       │   ├── file-bug -> ../../../src/sdd/.agent/skills/file-bug
│       │   └── dashboard -> ../../../src/sdd/.agent/skills/dashboard
│       ├── agents -> ../../src/sdd/.agent/agents
│       └── README.md                     # "Droid support coming — format TBD"
└── README.md
```

### src/sdd/ — Canonical source

Contains everything that isn't platform-specific. This directory is never installed directly — platforms install their own package directory which symlinks here.

**Moved from current `spec-driven-dev/`:**
- `.agent/skills/` — all shared skills (everything except setup)
- `.agent/agents/` — all agent definitions (unchanged)
- `docs-mcp/` — MCP server TypeScript source
- `docs-dashboard/` — dashboard source and UI
- `bin/` — compiled binaries
- `docs/` — ADRs and specs
- `package.json` — workspace config
- `bun.lock` — lockfile (moves with package.json; run `bun install` after move to verify)

**New:**
- `hooks/guards/blocked-commands.sh` — guard logic extracted from current `blocked-commands-hook.sh`, agent-neutral (takes command string, returns allow/deny)
- `hooks/guards/source-guard.sh` — guard logic extracted from current `source-guard-hook.sh`, agent-neutral
- `context.md` — workflow rules extracted from setup SKILL.md's CLAUDE.md template

**Removed (moved to platform dirs):**
- `.claude-plugin/` → `claude/sdd/.claude-plugin/`
- `.mcp.json` → `claude/sdd/.mcp.json`
- `hooks/hooks.json` → `claude/sdd/hooks/hooks.json`
- `hooks/blocked-commands-hook.sh` → split into guard logic (`src/`) + Claude I/O wrapper (`claude/`)
- `hooks/source-guard-hook.sh` → split into guard logic (`src/`) + Claude I/O wrapper (`claude/`)
- `.agent/skills/setup/` → `claude/sdd/skills/setup/` (platform-specific)

**Dropped (ADR-0043 compat layer, no longer needed):**
- `skills/` symlink → `.agent/skills/` — platform packages have their own `skills/` with per-skill symlinks to `src/`
- `agents/` symlink → `.agent/agents/` — platform packages symlink directly to `src/sdd/.agent/agents/`

### claude/sdd/ — Claude platform package

**`.claude-plugin/plugin.json`** — same schema and resolution as current. Today, `marketplace.json` has `"source": "./spec-driven-dev"` and Claude Code reads `spec-driven-dev/.claude-plugin/plugin.json` from that source directory. In the new layout, `"source": "./claude/sdd"` and Claude reads `claude/sdd/.claude-plugin/plugin.json`. Same lookup chain — `<source>/.claude-plugin/plugin.json`:
```json
{
  "name": "spec-driven-dev",
  "version": "1.0.0",
  "description": "Spec-driven development workflow",
  "author": { "name": "Richard Song" }
}
```

**`.mcp.json`** — Claude MCP config for the plugin itself (self-development mode):

`${CLAUDE_PLUGIN_ROOT}` resolves to the plugin source directory — the directory pointed to by `"source"` in the marketplace descriptor. In the current layout, marketplace says `"source": "./spec-driven-dev"` and `${CLAUDE_PLUGIN_ROOT}` resolves to `spec-driven-dev/`. In the new layout, marketplace says `"source": "./claude/sdd"` so `${CLAUDE_PLUGIN_ROOT}` resolves to `claude/sdd/`.

**Plugin-level `.mcp.json`** uses the flat-key format (no `"mcpServers"` wrapper) — this is the Claude Code plugin `.mcp.json` convention, distinct from the project-level `.mcp.json` which uses `"mcpServers": { ... }`:

```json
{
  "docs": {
    "command": "${CLAUDE_PLUGIN_ROOT}/../../src/sdd/bin/docs-mcp",
    "args": ["--root", "${CLAUDE_PLUGIN_ROOT}/../../src/sdd"]
  }
}
```

The `--root` arg must point to `src/sdd/` (not `claude/sdd/`) because that's where `docs/` lives with ADRs and specs. The `../../` traversal from `claude/sdd/` reaches the repo root, then descends into `src/sdd/`.

When setting up a **target project**, the setup skill writes the project-level `.mcp.json` format (with `"mcpServers"` wrapper) using resolved absolute paths:

```json
{
  "mcpServers": {
    "docs": {
      "command": "/absolute/path/to/src/sdd/bin/docs-mcp",
      "args": ["--root", "/absolute/path/to/target-project"]
    }
  }
}
```

The two formats serve different contexts: plugin-level (flat keys, ${CLAUDE_PLUGIN_ROOT} variables) for self-development; project-level (mcpServers wrapper, absolute paths) for target projects.

**`hooks/hooks.json`** — Claude hook registration pointing to Claude I/O wrappers. `${CLAUDE_PLUGIN_ROOT}` resolves to `claude/sdd/`, so these paths reference files within the platform package:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/blocked-commands-hook.sh\"" }]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/source-guard-hook.sh\"" }]
      }
    ]
  }
}
```

**`hooks/blocked-commands-hook.sh`** — Claude I/O wrapper. Reads Claude's JSON stdin, extracts the command string via `python3` (matching the current production approach — `python3` is available on all supported platforms; `jq` is not), delegates to the agent-neutral guard script, and formats Claude's JSON deny response with proper escaping:

```bash
#!/usr/bin/env bash
# Claude I/O wrapper for blocked-commands guard
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GUARD="$SCRIPT_DIR/../../src/sdd/hooks/guards/blocked-commands.sh"
INPUT=$(cat)
COMMAND=$(python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('tool_input',{}).get('command',''))" <<< "$INPUT")
[ -z "$COMMAND" ] && exit 0
REASON=$(bash "$GUARD" "$COMMAND" 2>&1)
if [ $? -ne 0 ]; then
  python3 -c "
import json, sys
reason = sys.stdin.read().strip()
print(json.dumps({'hookSpecificOutput': {
  'hookEventName': 'PreToolUse',
  'permissionDecision': 'deny',
  'permissionDecisionReason': reason
}}))
" <<< "$REASON"
fi
```

Uses `python3`'s `json.dumps()` for the deny response to safely handle special characters (quotes, backslashes, newlines) in the guard's denial message.

**`hooks/source-guard-hook.sh`** — same wrapper pattern for source file write protection. Reads Claude's JSON stdin, extracts `tool_input.file_path` via `python3`, delegates to `src/sdd/hooks/guards/source-guard.sh`.

### Guard script interface (`src/sdd/hooks/guards/`)

Guard scripts are agent-neutral executables with a simple contract:

| Aspect | Contract |
|--------|----------|
| Input | First positional argument (`$1`) is the value to check: command string for blocked-commands, file path for source-guard |
| Config | Reads config from `$CLAUDE_PROJECT_DIR/.agent/` (blocked-commands.json, master-config.json) |
| Allow | Exit 0, no stdout |
| Deny | Exit 1, reason message on stderr |
| No config file | Exit 0 (no-op — project hasn't opted in) |

This interface is the boundary between agent-neutral logic and agent-specific I/O. Each platform's wrapper translates its native hook I/O to this contract.

**`skills/setup/SKILL.md`** — Claude-specific setup skill (self-contained, does everything):

**Path resolution:**
- `PLATFORM_ROOT`: `${CLAUDE_PLUGIN_ROOT}` if set (running as installed plugin). This is the primary mechanism — when a user installs the plugin and runs `/setup`, `${CLAUDE_PLUGIN_ROOT}` is always set by Claude Code to the plugin's source directory (`claude/sdd/`).
- Fallback (development only): if `${CLAUDE_PLUGIN_ROOT}` is unset, the skill must be running from within the repo directly (not via an installed plugin). Use the known repo structure: resolve the SKILL.md's real path (following symlinks with `realpath`), then walk up from `claude/sdd/skills/setup/SKILL.md` → 3 levels → `claude/sdd/`. Using `realpath` is critical because the target project's `.agent/skills/setup/` may be a symlink to the plugin — `realpath` resolves through the symlink to the actual file in `claude/sdd/`.
- `SRC_ROOT`: `${PLATFORM_ROOT}/../../src/sdd` — the canonical source directory. The `../../` traversal from `claude/sdd/` reaches the repo root, then descends into `src/sdd/`.
- `TARGET`: `${CLAUDE_PROJECT_DIR}` if set, otherwise current working directory

**Steps:**
1. Resolve `PLATFORM_ROOT` and `SRC_ROOT` as above. Verify `SRC_ROOT/.agent/skills/` exists; if not, fail with "Cannot find canonical source at src/sdd/ — ensure the full repo is cloned."
2. Compile docs-mcp binary: `cd "${SRC_ROOT}/docs-mcp" && bun install && bun run build`
3. Symlink skills from `SRC_ROOT/.agent/skills/` and agents from `SRC_ROOT/.agent/agents/` into `TARGET/.agent/`
4. Symlink sdd-master (`SRC_ROOT/bin/sdd-master`) to `~/.local/bin/`
5. Configure MCP in `TARGET/.mcp.json` — resolve `SRC_ROOT/bin/docs-mcp` to absolute path and write it
6. Scaffold CLAUDE.md: read `SRC_ROOT/context.md`, wrap in `<!-- sdd:begin -->` / `<!-- sdd:end -->` markers, inject into `TARGET/CLAUDE.md`
7. Bootstrap permissions in `TARGET/.claude/settings.json`
8. Initialize `TARGET/.agent/blocked-commands.json` and `TARGET/.agent/master-config.json`

### droid/sdd/ — Droid platform package (stub)

Symlinks to shared skills and agents. `README.md` explains:
- The plugin's core data is at `src/sdd/`
- Droid-specific metadata, setup skill, and hook registration will be added when Droid's plugin format is documented
- Contributors can reference `claude/sdd/` as a template for what a platform package looks like

### context.md — Canonical workflow rules (new)

Extracted verbatim from the current setup SKILL.md's CLAUDE.md template (the content between `<!-- sdd:begin -->` and `<!-- sdd:end -->` markers in the current setup skill, Step 6). The full content includes all four sections with complete heuristics, trigger examples, and behavioral rules — not just the summaries shown below.

**Sections** (abbreviated here for readability — the actual file contains the full prose from the current setup SKILL.md):

1. **Change detected → invoke /feature-change immediately** — trigger heuristics ("fix", "change", "update", etc.), the loop description, "never write implementation code directly"
2. **New feature detected → invoke /plan-feature immediately** — trigger heuristics ("maybe we should…", "what if…"), durability rationale
3. **Never edit source files directly** — master session role, when to invoke dev-harness vs fix agent infrastructure
4. **Parallelism — use subagents for independent work** — launch multiple agents in single message

The file is agent-neutral markdown (no CLAUDE.md markers, no `<!-- sdd:begin -->`). Each platform's setup skill reads this file and wraps it in platform-specific formatting:
- Claude: `<!-- sdd:begin -->` / `<!-- sdd:end -->` markers injected into CLAUDE.md
- Droid: equivalent injection into AGENTS.md or Droid's context mechanism

### Marketplace descriptors

**`.claude-plugin/marketplace.json`** (at repo root):
```json
{
  "name": "agent-plugins",
  "owner": { "name": "Richard Song" },
  "metadata": {
    "description": "Agent-neutral plugin marketplace — spec-driven development workflows",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "spec-driven-dev",
      "source": "./claude/sdd",
      "description": "Spec-driven development workflow: ADR authoring, design audit, spec compliance, and implementation orchestration",
      "category": "development"
    }
  ]
}
```

**`.droid-plugin/marketplace.json`** (stub — exact schema TBD):
```json
{
  "name": "agent-plugins",
  "plugins": [
    {
      "name": "spec-driven-dev",
      "source": "./droid/sdd",
      "status": "stub"
    }
  ]
}
```

## Data Model

No new data model. The plugin's data is the directory structure itself. Each platform's marketplace metadata follows that platform's schema.

## Error Handling

| Failure | Behavior |
|---------|----------|
| Broken symlinks (partial clone) | Setup fails: "Symlinks to src/sdd/ not found — ensure the full repo is cloned" |
| Missing `bun` | Setup fails: "bun required to compile docs-mcp. Install: `curl -fsSL https://bun.sh/install \| bash`" |
| Unknown agent | Env var detection finds no match → setup prompts user to specify agent |
| Droid user installs stub | README explains Droid support is pending; core data is accessible at `src/sdd/` |

## Security

Same as current: guard scripts enforce command blocklists and source file write protection. Each platform's hook registration wires the guard scripts into the agent's native pre-tool-use mechanism. Guard logic code is shared; I/O wrappers are platform-specific.

## Impact

- Supersedes installation decisions in ADR-0026 (Claude plugin packaging)
- Supersedes ADR-0046 (remove install.sh)
- Extends ADR-0043 (vendor-neutral layout) — makes `src/` the primary structure instead of `.agent/` at plugin root
- Repo renamed from `claude-plugins` to `agent-plugins`

## Scope

### In v1
- Create `src/sdd/` with canonical source (move from current `spec-driven-dev/`)
- Extract `context.md` from setup SKILL.md
- Extract agent-neutral guard logic from hook scripts to `src/sdd/hooks/guards/`
- Create `claude/sdd/` platform package with metadata + setup + hook wrappers + symlinks
- Create `droid/sdd/` stub with symlinks + README
- Update marketplace descriptors at root
- Rename repo to `agent-plugins`
- Update README

### Deferred
- Droid platform package (full setup skill, metadata, hook registration)
- Other agents (Codex, Copilot, Gemini CLI, Cursor, Devin CLI)
- Guard script I/O abstraction (decide when Droid hook format is known)
- Plugin registry / cross-marketplace discovery

## Open questions

(none — all resolved)

## Implementation Plan

### Sequencing

The restructure must happen in a specific order because the marketplace descriptor and plugin metadata reference directory paths:

1. **Create `src/sdd/`** — `mkdir -p src/sdd && git mv spec-driven-dev/.agent spec-driven-dev/docs-mcp spec-driven-dev/docs-dashboard spec-driven-dev/bin spec-driven-dev/docs spec-driven-dev/package.json spec-driven-dev/bun.lock src/sdd/` (explicitly listing both dotfiles and regular files to preserve git history). Drop the compat symlinks (`spec-driven-dev/skills`, `spec-driven-dev/agents`). Remove platform-specific files from src/ (`.claude-plugin/`, `.mcp.json`, `hooks/hooks.json`) — they'll be recreated in step 3.
2. **Create `claude/sdd/`** — write platform metadata, setup skill, hook wrappers. Create relative symlinks to `src/sdd/` for shared skills/agents.
3. **Create `droid/sdd/` stub** — symlinks + README.
4. **Extract context.md** — pull the full CLAUDE.md template content from the current setup SKILL.md into `src/sdd/context.md` (agent-neutral form, no markers).
5. **Extract guard logic** — split current hook scripts into agent-neutral guards (src/) + Claude I/O wrappers (claude/).
6. **Update marketplace descriptors** — rewrite `.claude-plugin/marketplace.json` to point `source` to `./claude/sdd`. Create `.droid-plugin/marketplace.json` stub.
7. **Update README** — rewrite for new structure.
8. **Rename repo** — this is a GitHub operation, done last. Update `extraKnownMarketplaces` instructions in README.

### Migration for existing users

Existing users who installed via `/plugin install spec-driven-dev@richardmsong-plugins` will need to:
1. Update their `extraKnownMarketplaces` in `~/.claude/settings.json`: change repo from `richardmsong/claude-plugins` to `richardmsong/agent-plugins` and marketplace name from `richardmsong-plugins` to `agent-plugins`
2. Re-install: `/plugin install spec-driven-dev@agent-plugins`
3. Re-run `/setup` in their target project (setup is idempotent)

### Estimates

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| File moves (src/sdd/) | ~0 (moves, not new code) | ~30k | Git mv operations, update imports/paths, move bun.lock |
| context.md extraction | ~30 | ~30k | Extract from setup SKILL.md, simple |
| Guard logic extraction | ~80 (split + new interface) | ~60k | Split I/O wrapper from logic, define $1/exit-code contract |
| claude/sdd/ package | ~250 (setup skill + hook wrappers) | ~80k | Rewrite setup with new path resolution, write I/O wrappers |
| droid/sdd/ stub | ~20 (README + symlinks) | ~30k | Minimal |
| Marketplace descriptors | ~30 | ~30k | Update existing, create Droid stub |
| README | ~60 | ~30k | Rewrite for new structure |
| Symlink creation | ~0 (just ln commands) | Included above | Part of restructure, all relative symlinks |

**Total estimated tokens:** ~290k
**Estimated wall-clock:** 2-3h of active dev-harness time
