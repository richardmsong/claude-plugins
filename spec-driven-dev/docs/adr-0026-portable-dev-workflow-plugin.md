# ADR: Portable Dev Workflow Plugin

**Status**: accepted
**Status history**:
- 2026-04-20: draft
- 2026-04-21: accepted

## Overview

Extract the ADR/spec development workflow (skills, agents, docs MCP server, entrypoint script, and pre-tool-use hook) from the mclaude project into a standalone Claude Code plugin called `spec-driven-dev`. This makes the structured design → audit → implement → verify loop available in any repository.

## Motivation

The mclaude project evolved a powerful development workflow: plan-feature (ADR authoring with Q&A), design-audit (fresh-context evaluation loops), spec-evaluator (compliance checking), feature-change (orchestration), dev-harness (implementation), and file-bug (documentation). These are currently embedded in `.agent/skills/` and `.agent/agents/` inside the mclaude repo, but the patterns are project-agnostic — any repo with a `docs/` directory of ADRs and specs can use them.

The docs MCP server (`mclaude-docs-mcp/`) provides FTS5 search, section retrieval, and git-lineage tracking over markdown docs. It's also project-agnostic — it just needs a git repo with markdown files.

The master.sh entrypoint enforces a master/agent separation: the master session can only read code + edit docs + spawn agents, while dev-harness agents do the actual coding. This pattern is generic — it just needs a list of source directories.

Currently, starting a new project means either not having these workflows or manually copying files. A plugin solves this — install once, available everywhere.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Distribution | Claude Code plugin in a new standalone repo | Plugins bundle skills + agents + MCP servers. Standalone repo enables future marketplace publishing. |
| Plugin name | `spec-driven-dev` | Emphasizes the spec-first methodology. Clear what it does. |
| Docs MCP discovery | CLI arg `--root <path>` with walk-up-to-`.git` fallback | Explicit when configured via `.mcp.json`, still works standalone for debugging |
| Docs MCP packaging | Source in plugin repo; compiled binary at `${CLAUDE_PLUGIN_ROOT}/bin/docs-mcp` | No npm publish needed. Plugin `.mcp.json` references the binary via `${CLAUDE_PLUGIN_ROOT}`. Setup skill compiles it in place. |
| Which skills move | Core workflow: plan-feature, design-audit, feature-change, spec-evaluator, file-bug | Deploy-*, nats-send, job-queue, schedule-feature are mclaude-specific and stay |
| Which agents move | All three: design-evaluator, dev-harness, spec-evaluator | They implement the generic ADR/spec loop — descriptions generalized to remove "mclaude" references |
| Skill generalization | Generic patterns + conventions doc in plugin | Skills reference `docs/adr-*.md` and `docs/**/spec-*.md`. Plugin includes a conventions doc explaining expected repo structure. Project-specific context (component lists, doc index) goes in CLAUDE.md. |
| mclaude after extraction | CLAUDE.md only — no thin wrappers | Plugin skills are fully self-contained. mclaude-specific context goes in CLAUDE.md. |
| Hook design | Config-driven blocklist with ban/guard categories | Plugin ships `blocked-commands-hook.sh` (declared in `hooks/hooks.json`) that reads `.agent/blocked-commands.json`. Two categories: `ban` (never overridable) and `guard` (overridable via `SDD_DEBUG=1`). |
| Hook installation | Plugin `hooks/hooks.json` with per-project opt-in | Plugin declares the hook in `hooks/hooks.json` (standard plugin hook format). The hook script checks for `.agent/blocked-commands.json` at runtime — if the file doesn't exist, the hook exits silently (no-op). Projects opt in by creating the config file via `/spec-driven-dev:setup`. |
| Debug override | Single `SDD_DEBUG=1` env var | Relaxes all `guard`-category blocks. Bans are never overridable. Simple — one flag to remember. |
| Master entrypoint | Plugin provides generic `sdd-master` script at `${CLAUDE_PLUGIN_ROOT}/bin/sdd-master` | Reads `.agent/master-config.json` for source directories, auto-generates `--disallowedTools` for Edit/Write on those dirs. Setup skill symlinks to `~/.local/bin/` for CLI convenience. Model probe cache at `$HOME/.cache/sdd/master-model`. |

## User Flow

### First-time setup (per machine)

1. Register plugin source: `claude plugin marketplace add <path-or-repo-url>`
2. Install plugin: `claude plugin install spec-driven-dev`
3. Run `/spec-driven-dev:setup` once (compiles docs-mcp binary inside plugin, symlinks `sdd-master` to `~/.local/bin/` for CLI convenience, verifies `~/.local/bin` is on PATH)

### Per-project setup

1. Run `/spec-driven-dev:setup` in the project (idempotent — safe to re-run):
   - `.agent/blocked-commands.json` — created with default ban rules if absent; **skipped if already exists** (preserves user customizations)
   - `.agent/master-config.json` — created with empty `source_dirs` if absent; **skipped if already exists**
   - `docs-mcp` binary — always recompiled (picks up source updates from plugin)
2. Edit `.agent/master-config.json` to list source directories that only agents can modify
3. Optionally add project-specific guard rules to `.agent/blocked-commands.json`
4. Launch via `sdd-master` instead of `claude` to enforce master/agent separation

### Daily workflow

1. `/plan-feature <description>` → creates ADR in `docs/`, Q&A until all ambiguities resolved
2. `/design-audit docs/adr-NNNN-slug.md` → fresh-context evaluation loop until CLEAN
3. `/feature-change <description>` → checks spec → spawns dev-harness → implements + tests
4. `/spec-evaluator [component]` → compliance audit
5. `/file-bug <description>` → documents bug in `.agent/bugs/`

## Component Changes

### Plugin manifest (`.claude-plugin/plugin.json`)

```json
{
  "name": "spec-driven-dev",
  "description": "Spec-driven development workflow: ADR authoring, design audit, spec compliance, and implementation orchestration with docs MCP indexer",
  "author": {
    "name": "Richard Song"
  }
}
```

### Plugin repo: `spec-driven-dev/` (new)

```
spec-driven-dev/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json                          # flat keys, uses ${CLAUDE_PLUGIN_ROOT}
├── docs-mcp/                          # extracted from mclaude-docs-mcp/
│   ├── src/
│   │   ├── index.ts                   # accepts --root <path>, fallback walk-up-to-.git
│   │   ├── db.ts
│   │   ├── content-indexer.ts
│   │   ├── lineage-scanner.ts
│   │   ├── parser.ts
│   │   ├── tools.ts
│   │   └── watcher.ts
│   ├── tests/                         # extracted from mclaude-docs-mcp/tests/
│   └── package.json
├── bin/
│   ├── docs-mcp                       # compiled binary (built by setup skill via bun build --compile)
│   └── sdd-master                     # generic master entrypoint script
├── skills/
│   ├── setup/SKILL.md                 # /spec-driven-dev:setup — compile binary + project init
│   ├── plan-feature/SKILL.md          # generalized (see "Skill generalization" below)
│   ├── design-audit/SKILL.md          # already generic — no changes needed
│   ├── feature-change/SKILL.md        # generalized (see below)
│   ├── spec-evaluator/SKILL.md        # generalized (see below)
│   └── file-bug/SKILL.md              # generalized (see below)
├── agents/
│   ├── design-evaluator.md            # single-file convention for plugins; already generic
│   ├── dev-harness.md                 # generalized (see below)
│   └── spec-evaluator.md              # generalized (see below)
├── hooks/
│   ├── hooks.json                     # plugin hook registration (PreToolUse on Bash)
│   └── blocked-commands-hook.sh       # reads $CLAUDE_PROJECT_DIR/.agent/blocked-commands.json
└── docs/
    └── conventions.md                 # expected repo structure for ADR/spec workflow
```

### docs-mcp changes

- `index.ts`: replace hardcoded `resolve(join(scriptDir, "..", ".."))` with `--root` CLI arg parsing; fallback to walking up from CWD to find `.git`
- `package.json`: add build script: `"build": "bun build --compile src/index.ts --outfile ../bin/docs-mcp"`. The setup skill runs `cd docs-mcp && bun install && bun run build` to produce the binary at `${CLAUDE_PLUGIN_ROOT}/bin/docs-mcp`.
- `.docs-index.db` created at `<project-root>/.agent/.docs-index.db` (not next to source)

### `.mcp.json` in plugin

Uses flat-key format (no `"mcpServers"` wrapper) per the plugin `.mcp.json` convention:

```json
{
  "docs": {
    "command": "${CLAUDE_PLUGIN_ROOT}/bin/docs-mcp",
    "args": ["--root", "${CLAUDE_PROJECT_DIR}"]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` resolves to the plugin's install directory. `${CLAUDE_PROJECT_DIR}` resolves to the current project root. If `CLAUDE_PROJECT_DIR` is empty/unset, docs-mcp falls back to walking up from CWD to find `.git`.

### Pre-tool-use hook

Declared in `hooks/hooks.json` (standard plugin hook format):

```json
{
  "description": "Config-driven command blocklist for spec-driven-dev workflow",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/blocked-commands-hook.sh\""
          }
        ]
      }
    ]
  }
}
```

`blocked-commands-hook.sh` — the actual script:
1. Checks for `$CLAUDE_PROJECT_DIR/.agent/blocked-commands.json` — if absent, exits 0 (no-op, project hasn't opted in)
2. Reads stdin JSON and extracts the command string at `tool_input.command`
3. Matches against each rule's regex pattern
4. For `ban` rules: always denies by printing the hook deny response JSON and exiting 0
5. For `guard` rules: denies unless `SDD_DEBUG=1` is set in the environment

**Hook I/O contract:**
- **Input** (stdin): JSON with the command at `tool_input.command` (string)
- **Deny output** (stdout): `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "<message>"}}`
- **Allow output**: exit 0 with no stdout (implicit allow)

Default `.agent/blocked-commands.json` created by `/spec-driven-dev:setup`:
```json
{
  "rules": [
    {
      "pattern": "gh\\s+run\\s+watch",
      "message": "Blocks until timeout. Use 'gh run view {id}' to poll.",
      "category": "ban"
    },
    {
      "pattern": "git\\s+apply",
      "message": "Bypasses the spec→dev-harness→evaluator loop. Use /feature-change.",
      "category": "ban"
    }
  ]
}
```

mclaude adds project-specific guards (in its `.agent/blocked-commands.json`):
```json
{
  "rules": [
    {"pattern": "gh\\s+run\\s+watch", "message": "Blocks until timeout. Use 'gh run view {id}' to poll.", "category": "ban"},
    {"pattern": "git\\s+apply", "message": "Bypasses the spec→dev-harness→evaluator loop. Use /feature-change.", "category": "ban"},
    {"pattern": "helm\\s+(upgrade|install)", "message": "Must run via CI. Set SDD_DEBUG=1 to override.", "category": "guard"},
    {"pattern": "docker\\s+build", "message": "Must run via CI. Set SDD_DEBUG=1 to override.", "category": "guard"},
    {"pattern": "k3d\\s+image\\s+import", "message": "Bypasses CI. Set SDD_DEBUG=1 to override.", "category": "guard"},
    {"pattern": "kubectl\\s+(create|apply|patch|delete|replace|edit|scale|rollout\\s+restart|exec)", "message": "Cluster state managed by Helm. Set SDD_DEBUG=1 to override.", "category": "guard"}
  ]
}
```

**Migration from existing hook:** The current `pre-tool-use.sh` uses `LOCAL_DEPLOY=1` and `KUBECTL_MUTATE=1` as per-rule overrides. These are replaced by the single `SDD_DEBUG=1`. The old env vars are not honored — the mclaude CLAUDE.md and any scripts referencing them (e.g. `deploy-local-preview`) must be updated to use `SDD_DEBUG=1` instead. This is a clean break, not a backward-compatible migration.

### Skill and agent generalization

Several skills and agents contain hardcoded mclaude-specific content that must be replaced with generic, convention-based patterns. The generic versions discover project structure at runtime rather than hardcoding component names.

**plan-feature/SKILL.md** — The research step (Step 1) currently names mclaude-specific docs (`docs/feature-list.md`, `docs/spec-doc-layout.md`). Replace with: use `list_docs` and `search_docs` MCP tools to discover project docs dynamically. The ADR template itself is already generic.

**feature-change/SKILL.md** — Description says "any change to the mclaude app". Replace "mclaude app" with "the project". The component discovery step currently assumes mclaude component names; replace with: discover components by scanning `docs/**/spec-*.md` via the docs MCP `list_docs` tool, or reading a `components` list from CLAUDE.md if present. The "Master session write restrictions" section currently hardcodes mclaude component directories (`mclaude-control-plane/`, `mclaude-web/`, etc.); replace with: read `.agent/master-config.json` `source_dirs` to determine which directories are agent-only. If the config file doesn't exist, skip write restrictions (no master/agent separation configured).

**spec-evaluator/SKILL.md** — Contains a hardcoded component table (control-plane, session-agent, spa, cli, helm, server, connector, relay, mcp, common) with per-component spec file paths. Replace with: dynamic component discovery. The skill scans `docs/` for `spec-*.md` files, groups them by directory (each directory = a component), and offers the list to the user. No hardcoded table. The component→spec mapping is derived from the filesystem, not embedded in the skill.

**file-bug/SKILL.md** — Step 1 "Identify the spec" has a hardcoded table mapping bug areas to mclaude-specific ADRs and specs. Replace with: use `search_docs` to find relevant specs/ADRs by keyword from the bug description. No hardcoded routing table.

**dev-harness agent** — Description says "mclaude component", contains per-component test requirement tables with mclaude component names. Replace "mclaude component" with "project component". The per-component test tables are removed; instead, the agent reads the component's spec file(s) to determine what tests are required. Test categories (build, unit, integration, e2e) remain generic.

**spec-evaluator agent** — Contains a hardcoded per-component table mapping component names to spec file paths. Replace with: the agent receives the component name and spec path(s) as arguments in its prompt (the spec-evaluator skill passes them after dynamic discovery). No hardcoded table in the agent.

### `sdd-master` entrypoint

Reads `.agent/master-config.json`:
```json
{
  "source_dirs": [
    "mclaude-control-plane/**/*.go",
    "mclaude-session-agent/**/*.go",
    "mclaude-web/src/**"
  ]
}
```

Generates `--disallowedTools` for `Edit(<dir>)` and `Write(<dir>)` on each entry. Includes the Opus model probing logic from current `master.sh`, with the probe cache at `$HOME/.cache/sdd/master-model` (not the mclaude-specific `$HOME/.cache/mclaude/master-model`).

### mclaude project cleanup

After plugin extraction:
- **Remove** from `.agent/skills/`: plan-feature, design-audit, feature-change, spec-evaluator, file-bug
- **Remove** from `.agent/agents/`: design-evaluator, dev-harness, spec-evaluator
- **Remove** `.agent/hooks/pre-tool-use.sh` (plugin hook replaces it)
- **Keep** in `.agent/skills/`: deploy-connector, deploy-local-preview, deploy-preview, deploy-relay, deploy-server, job-queue, nats-send, schedule-feature
- **Remove** `mclaude-docs-mcp/` (source moves to plugin repo)
- **Remove** `.mcp.json` docs entry (plugin provides it)
- **Update** `scripts/master.sh` → call `sdd-master` instead of inline logic
- **Update** `CLAUDE.md` → trim workflow rules that the plugin now handles; keep mclaude-specific rules (CI, DNS, deploy). Add mclaude component list so plugin skills can discover components from CLAUDE.md.
- **Update** `.claude/settings.json` → remove the project-level `PreToolUse` hook entry (plugin's `hooks/hooks.json` now provides it)
- **Update** `scripts/master.sh` → replace inline `--disallowedTools` list with a call to `sdd-master` (reads `.agent/master-config.json`)
- **Update** `scripts/droid.sh` → replace inline `--disabled-tools` list with reading `.agent/master-config.json` directly. `sdd-master` wraps `claude` only (uses `--disallowedTools`); `droid.sh` stays a separate script because the `droid` binary uses different flag names (`--disabled-tools`). Both scripts read the same config file; only the flag generation differs.
- **Update** deploy-local-preview skill → replace `LOCAL_DEPLOY=1` with `SDD_DEBUG=1`
- **Create** `.agent/master-config.json` with mclaude source directories
- **Create** `.agent/blocked-commands.json` with mclaude-specific guard rules added to defaults

## Data Model

No new persistent state beyond existing patterns:
- `.agent/.docs-index.db` — SQLite FTS5 index (runtime, gitignored)
- `.agent/blocked-commands.json` — committed to repo
- `.agent/master-config.json` — committed to repo
- `.agent/bugs/*.md` — committed to repo
- `.agent/audits/*.md` — committed or gitignored per preference

## Error Handling

- No `docs/` directory → docs MCP logs warning, returns empty results (no crash)
- No `.git` → lineage scanning skipped; search and section retrieval still work
- No `.agent/blocked-commands.json` → hook exits silently (no-op) — project hasn't opted in
- No `.agent/master-config.json` → `sdd-master` runs without `--disallowedTools` (master can edit anything)
- `docs-mcp` binary not compiled → Claude Code logs MCP start failure; skills still work but without docs MCP tools. `/spec-driven-dev:setup` must be run first.
- `bun` not installed → setup skill fails with clear message ("bun required to compile docs-mcp")
- `~/.local/bin` not on PATH → setup skill warns and prints the line to add to shell profile. `sdd-master` symlink won't work from CLI until PATH is fixed; the hook and MCP server are unaffected (they use `${CLAUDE_PLUGIN_ROOT}` paths).

## Security

No secrets, tokens, or auth. The docs MCP reads the local filesystem only. The hook reads project-local config only. The master entrypoint reads project-local config only.

## Impact

**New:**
- `spec-driven-dev` plugin repository with skills, agents, docs MCP, hook, and entrypoint

**Modified in mclaude:**
- `.agent/skills/` — 5 skills removed (provided by plugin)
- `.agent/agents/` — 3 agents removed (provided by plugin)
- `.agent/hooks/pre-tool-use.sh` — removed (plugin hook replaces)
- `mclaude-docs-mcp/` — removed (moved to plugin)
- `.mcp.json` — docs entry removed
- `CLAUDE.md` — trimmed; add mclaude component list for plugin skills
- `scripts/master.sh` — simplified to call `sdd-master`
- `scripts/droid.sh` — replace inline `--disabled-tools` list with reading `.agent/master-config.json`
- `deploy-local-preview` skill — replace `LOCAL_DEPLOY=1` with `SDD_DEBUG=1`

**New in mclaude:**
- `.agent/blocked-commands.json` — mclaude-specific guard rules
- `.agent/master-config.json` — mclaude source directory list

## Scope

**v1:**
- Plugin repo with all skills, agents, docs MCP, hook, and entrypoint
- Setup skill for one-time project configuration
- Docs MCP accepts `--root` with walk-up fallback
- Conventions doc explaining expected repo structure
- mclaude project cleaned up to use the plugin

**Deferred:**
- Publishing to a marketplace
- Plugin configuration (custom doc directories, custom ADR templates)
- Per-rule override env vars (v1 has only `SDD_DEBUG=1`)
- Auto-detection of source directories for master config

## Open questions

(none)

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| Plugin scaffolding | ~80 | 30k | plugin.json, .mcp.json, hooks/hooks.json, conventions.md |
| Skill extraction + generalization | ~400 (edits) | 150k | Generalize plan-feature, feature-change, spec-evaluator, file-bug; design-audit unchanged |
| Agent extraction + generalization | ~250 (edits) | 100k | Generalize dev-harness + spec-evaluator agents (remove hardcoded component tables); design-evaluator mostly unchanged |
| Docs MCP portability | ~120 | 60k | --root CLI arg, walk-up fallback, bun build --compile, db path to .agent/, tests moved |
| Pre-tool-use hook | ~100 | 40k | hooks.json, blocked-commands-hook.sh, ban/guard categories, SDD_DEBUG, project opt-in check |
| sdd-master entrypoint | ~70 | 30k | Config-driven --disallowedTools, model probing, cache path |
| Setup skill | ~150 | 60k | Compile binary, symlink sdd-master, create project configs, PATH check |
| mclaude cleanup | ~100 (mixed) | 40k | Remove extracted files, update CLAUDE.md + settings.json + deploy skills, create configs, migrate env vars |

**Total estimated tokens:** ~510k
**Estimated wall-clock:** 1h of 5h budget (20%)
