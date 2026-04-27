# ADR: OpenCode Platform Package

**Status**: accepted
**Status history**:
- 2026-04-27: draft
- 2026-04-27: accepted — paired with spec-agents.md

## Overview

Add OpenCode (the open-source terminal AI coding agent at opencode.ai) as a first-class platform in the `agent-plugins` monorepo. This creates `opencode/sdd/` -- a platform package containing an OpenCode-specific setup skill, hook wrappers (if supported), MCP configuration, agent templates, and copies of the shared canonical source from `src/sdd/`.

## Motivation

The `agent-plugins` repository is designed to be agent-neutral (ADR-0047). We already support Claude Code (ADR-0047), Droid (ADR-0057), Gemini CLI (ADR-0061), and Devin CLI (ADR-0060). OpenCode is an open-source AI coding agent (by Anomaly/opencode.ai) that supports the same extensibility primitives the SDD workflow relies on:

- **Skills**: `SKILL.md` files discovered from `~/.opencode/skills/` and project-local paths
- **Agents**: Configured in `opencode.json` with custom prompts, models, tool permissions
- **MCP servers**: Supported for additional tool integration
- **Rules**: `AGENTS.md` for project-level custom instructions
- **Plugins**: Go/TypeScript plugin system with event hooks
- **Tools**: Built-in tools include `read`, `edit`, `glob`, `grep`, `list`, `bash`, `todowrite`, `skill`

OpenCode is gaining traction as the primary open-source alternative to Claude Code. Adding support allows users who prefer open-source tooling to leverage the SDD workflow.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Directory location | `opencode/sdd/` | Follows the `<platform>/sdd/` convention from ADR-0047. |
| Context injection file | `AGENTS.md` | OpenCode natively loads `AGENTS.md` from project root (same as Droid, Devin). |
| Config file | `opencode.json` | OpenCode's native project-level config format for agents, MCP servers, and permissions. |
| Skills location | `.opencode/skills/` (project-local), `~/.opencode/skills/` (global) | OpenCode's native skill discovery paths. Skills are SKILL.md files loaded on-demand via the native skill tool. |
| Agent definitions | Both: JSON in `opencode.json` AND markdown files in `.opencode/agents/` | OpenCode supports markdown agent definitions at `~/.config/opencode/agents/` (global) or `.opencode/agents/` (project-local). JSON agents in config are also supported. We use markdown files for the SDD agents. |
| Hook system | Go/TypeScript plugins with event hooks (tool events supported) | OpenCode plugins hook into tool, command, file, session, and other events. Plugins live in `.opencode/plugins/` or installed via npm. Plugin system can intercept tool calls. |
| Tool name mapping | `read`, `edit`, `glob`, `grep`, `list`, `bash`, `todowrite`, `skill` | OpenCode's built-in tool names differ from Claude Code and Droid. |
| Marketplace descriptor | Not needed -- no `.opencode-plugin/` at repo root | OpenCode has no marketplace system like Claude. Distribution via npm packages or manual file copy. |
| Distribution strategy | Manual copy + npm package (future) | Users copy files into `.opencode/skills/`, `.opencode/agents/`, `.opencode/plugins/`. npm plugins can be loaded via `"plugin": ["pkg-name"]` in opencode.json. |
| Model slugs | Provider-prefixed identifiers (e.g., `anthropic/claude-sonnet-4-6`, `openai/gpt-4o`) | OpenCode uses provider-prefixed model identifiers. Build step rewrites model fields for OpenCode agents. |
| MCP config | `opencode.json` under `mcpServers` key | OpenCode reads MCP servers from its JSON config file. |
| Build step | Extend `src/sdd/build.sh` to produce `opencode/sdd/` | Same pattern as Claude/Devin builds. Build step 8b modified to support per-platform output dir name (see below). |
| Build output dir | `opencode/sdd/agents/` (not `droids/`) | OpenCode discovers agents from `agents/` directories. Build step 8b currently hardcodes `droids/` -- must be parameterized via a config file or naming convention per platform. |
| Agent invocation syntax | OpenCode uses `subagent` tool: `subagent(agent="<name>", prompt="<task>")` | Canonical skills use Claude's `Agent(subagent_type=...)`. Build step prepends an invocation-syntax preamble to each copied skill mapping Claude syntax to OpenCode syntax (same pattern as Devin ADR-0060). |
| Source-guard hook | Deferred -- rely on AGENTS.md rules | OpenCode's plugin hook system may support tool interception, but subagent context distinguishing is unclear. Enforce via AGENTS.md rules for v1 (same approach as Devin). |
| Permissions config | `"permission"` key in `opencode.json` | OpenCode supports per-tool permission config: `"allow"`, `"ask"`, `"deny"`. Setup configures appropriate defaults. |

## User Flow

### Installation (end user -- manual copy)
1. Clone the `agent-plugins` repo (or download `opencode/sdd/` directory)
2. Copy `opencode/sdd/skills/` into the target project's `.opencode/skills/`
3. Copy `opencode/sdd/agents/` into `.opencode/agents/`
4. Copy `opencode/sdd/dist/` into `.opencode/dist/`
5. Copy `opencode/sdd/context.md` to `.opencode/context.md`
6. Run `/setup` in an OpenCode session to scaffold `AGENTS.md`, `opencode.json` (MCP + permissions), and `spec-driven-config.json`

### First run (after installation)
1. User invokes `/setup` in an OpenCode session
2. **Path resolution:** `TARGET` is the current working directory (OpenCode does not have a plugin root env var -- all paths are project-relative)
3. **First-time detection:** Check for `${TARGET}/spec-driven-config.json`. If absent, first run.
4. **Write `spec-driven-config.json`** (if absent) with blocked commands and source-dir patterns
5. **Upsert `AGENTS.md`** -- read `.opencode/context.md`, inject between `<!-- sdd:begin -->` / `<!-- sdd:end -->` markers
6. **Write `opencode.json`** (merge with existing) -- MCP server config + permission defaults
7. **Tutorial:** If first run, display the SDD workflow tutorial
8. **Verify:** Confirm all config files exist

### Development workflow (after setup)
User says "add feature X" -> OpenCode loads `AGENTS.md` -> routes to `/feature-change` -> SDD loop runs (ADR -> spec -> dev-harness subagent -> evaluator -> done).

## Component Changes

### `opencode/sdd/` (NEW -- OpenCode platform package)

**Structure:**
```
opencode/sdd/
├── skills/
│   ├── setup/
│   │   └── SKILL.md                   # OpenCode-specific setup (real file)
│   ├── feature-change/                # copied from src/sdd
│   ├── plan-feature/                  # copied from src/sdd
│   ├── design-audit/                  # copied from src/sdd
│   ├── spec-evaluator/                # copied from src/sdd
│   ├── implementation-evaluator/      # copied from src/sdd
│   └── file-bug/                      # copied from src/sdd
├── agents/                            # Markdown agent definitions (YAML frontmatter)
│   ├── dev-harness.md                 # Build output: OpenCode frontmatter + skill body
│   ├── implementation-evaluator.md
│   ├── spec-evaluator.md
│   └── design-evaluator.md
├── .agent-templates/                  # Frontmatter templates for agents (ADR-0063)
│   ├── dev-harness.yaml               # See "OpenCode agent frontmatter" below
│   ├── implementation-evaluator.yaml
│   ├── spec-evaluator.yaml
│   ├── design-evaluator.yaml
│   └── output-dir                     # Contains "agents" (not "droids")
├── dist/                              # Pre-built MCP server + dashboard
│   ├── docs-mcp.js
│   ├── docs-dashboard.js
│   └── ui/
└── context.md                         # copied from src/sdd/context.md
```

### OpenCode agent frontmatter schema

OpenCode markdown agent definitions in `.opencode/agents/*.md` use YAML frontmatter. The template files define these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Agent identifier, used in `subagent(agent="<name>")` invocations |
| `description` | yes | When the master session should delegate to this agent |
| `model` | yes | Provider-prefixed model identifier (e.g., `anthropic/claude-sonnet-4-6`) |
| `tools` | no | Object mapping tool names to `true`/`false`. Omit for all tools enabled. |

Example template (`opencode/sdd/.agent-templates/dev-harness.yaml`):
```yaml
name: dev-harness
description: Implements and tests a component against its spec. Invoked repeatedly until all gaps are closed.
model: anthropic/claude-sonnet-4-6
```

Example template (`opencode/sdd/.agent-templates/spec-evaluator.yaml`):
```yaml
name: spec-evaluator
description: Fresh-context spec alignment audit. Reads an ADR and all referenced specs, reports gaps.
model: anthropic/claude-sonnet-4-6
tools:
  read: true
  glob: true
  grep: true
  edit: true
  bash: true
```

### `src/sdd/build.sh` (MODIFIED)

Add an OpenCode build target following the same pattern as Devin (ADR-0060):
1. Copy skills (excluding `local-setup` and `dashboard`) into `opencode/sdd/skills/`
2. Prepend an OpenCode-specific invocation preamble after YAML frontmatter in each copied skill, mapping Claude's `Agent(subagent_type="<name>")` to OpenCode's `subagent(agent="<name>", prompt="<task>")`
3. Copy agents via the templating step (ADR-0063). **Modify step 8b** to read a platform config that maps `.agent-templates/` output to either `droids/` (Droid) or `agents/` (OpenCode). Add a file `<platform>/sdd/.agent-templates/output-dir` containing the target directory name. Default is `droids/` if file is absent (backward-compatible).
4. Copy compiled `dist/` assets (docs-mcp.js, docs-dashboard.js, ui/)
5. Copy `context.md`

### `opencode.json` config structure (written by setup skill)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcpServers": {
    "docs": {
      "command": "bun",
      "args": ["run", ".opencode/dist/docs-mcp.js", "--root", "."]
    }
  },
  "permission": {
    "read": "allow",
    "glob": "allow",
    "grep": "allow",
    "list": "allow",
    "todowrite": "allow",
    "skill": "allow",
    "edit": "allow",
    "bash": "allow"
  }
}
```

### `src/sdd/.agent/skills/local-setup/SKILL.md` (MODIFIED)
Add OpenCode-specific local-dev symlink steps:
- Symlink skills into `.opencode/skills/`
- Symlink agents into `.opencode/agents/`
- Write `opencode.json` with MCP server pointing to TypeScript source (not compiled JS)

## Data Model

No new data model. Reuses `spec-driven-config.json` and existing shared structures.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| MCP server fails to start | Setup validates config; OpenCode shows MCP connection error |
| `bun` not installed | Setup skill detects and instructs user to install Bun (needed for MCP server) |
| Missing `spec-driven-config.json` | Setup creates it; guard logic (if added later) exits 0 (no-op) |
| Agent model not recognized | Build step rewrites `model: claude-sonnet-4-6` to `model: anthropic/claude-sonnet-4-6` for OpenCode agents |
| Subagent fails | Master session retries via `/feature-change` loop (same as other platforms) |

## Security

- Guard scripts are read-only checks
- No secrets stored in platform package
- MCP server runs locally via stdio

## Impact

- Adds `opencode` to the list of supported platforms
- Updates `spec-agents.md` -- OpenCode model slug mapping, tool name mapping
- Updates `build.sh` -- OpenCode build target
- Updates `local-setup` skill -- OpenCode symlink steps

## Scope

### In v1
- OpenCode platform package (`opencode/sdd/`) with setup skill and build target
- Agent templates (`.agent-templates/`) for OpenCode frontmatter
- MCP server integration
- AGENTS.md context injection
- Skills distribution
- Build step producing self-contained distribution
- Local-setup support for self-development

### Deferred
- Dashboard skill (needs testing with OpenCode)
- Hook-based enforcement (blocked-commands, source-guard) via OpenCode plugin system
- npm package distribution (`opencode-sdd-plugin`)
- OpenCode-specific tutorial content in setup skill

## Open questions

(none -- all resolved)

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `opencode/sdd/` structure | ~10 | ~30k | Symlinks, manifest, config |
| OpenCode setup skill | ~150 | ~60k | Scaffolding AGENTS.md and config |
| Agent templates | ~40 | ~30k | 4 YAML files |
| Build target in build.sh | ~50 | ~50k | Shell scripting |
| Hook wrappers | ~100 | ~50k | If hooks are supported |
| Local-setup updates | ~20 | ~20k | Symlink steps |

**Total estimated tokens:** ~240k
**Estimated wall-clock:** 2-3h
