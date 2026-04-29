# ADR: dist/ as the installable plugin artifact per platform

**Status**: draft
**Status history**:
- 2026-04-29: draft

## Overview

Restructure each platform output directory so that `platform/sdd/dist/` is the complete, self-contained installable plugin artifact. Every file in `dist/` has exactly one corresponding stub file in the platform directory tree (outside `dist/`) — no exceptions. A single committed Go script (`src/sdd/build.go`) replaces `build.sh` entirely and handles all build steps: rendering every stub as a Go `text/template` into `dist/`, compiling TypeScript artifacts (docs-mcp.js, docs-dashboard.js, UI) by shelling out to bun, bumping the build hash, and running validation. Compiled artifacts also have stubs — build.go compiles them first, then the stub templates them into dist/. CI runs `cd src/sdd && go run build.go`. Every stub is a valid Go template.

## Motivation

Two compounding problems:

1. **Source unnesting**: `src/sdd/.agent/agents/` → `src/sdd/agents/`, `src/sdd/.agent/skills/` → `src/sdd/skills/`. `build.sh` still references the old `.agent/` paths and is broken.

2. **No clear installable artifact boundary**: the whole `platform/sdd/` directory mixes build inputs (`.agent-templates/`, `hooks/`) with generated outputs (`droids/`, `skills/`, `context.md`, `mcp.json`, `dist/`). Pointing a plugin installer at the whole directory is fragile. Making `dist/` the single installable artifact gives a clean boundary: delete `dist/`, run `go run src/sdd/build.go`, and `dist/` is fully restored.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Installable artifact | `platform/sdd/dist/` is the complete, self-contained plugin package | Clean install boundary: everything a plugin host needs is inside dist/ |
| Top-level stubs | `platform/sdd/agents/` (or `droids/`), `skills/`, etc. hold `.md` stub files — frontmatter + a body that uses `{{ include "agents/<name>.md" }}` to pull in the src body | Replaces `.agent-templates/`; reference to src is explicit in the template, not in a special metadata field |
| `.agent-templates/` | Removed — stubs are the template source | Stubs are more readable and directly editable; eliminates indirection |
| Build entry point | `src/sdd/build.go` — single Go script replaces `build.sh` entirely; CI runs `go run src/sdd/build.go` | Go 1.26 already installed; removes bash dependency; single language for all build logic |
| Templating engine | Go `text/template` inside `build.go` | Same process handles templating and artifact compilation (shells out to bun/npm where needed) |
| Uniform stub rule | Every file in `dist/` has exactly one stub in `platform/sdd/` (outside dist/); `build.go` renders stubs → dist/ | No special-cased files; all config is visible in the stub tree |
| Template data | Shared context: version.json fields + platform vars; YAML frontmatter (if present) merged in as additional fields | Uniform across all file types; no branching on extension |
| `include` function | Custom Go template function: reads `src/sdd/<path>`, renders it with the same data context, returns inline | Decouples stub directory name (droids/) from src directory name (agents/); explicit in the template |
| Compiled artifacts | `docs-mcp.js`, `docs-dashboard.js`, UI assets — build.go compiles them, then stub templates reference the build output via `{{ include }}` or `{{ compiledArtifact "path" }}` to place them into dist/ | Maintains uniform stub rule: every dist/ file has a stub; compiled artifacts are no exception |
| src/sdd/agents/ body | Body-only, no frontmatter — stubs own the frontmatter entirely | Clean separation; frontmatter in src would be misleading since it is never used |
| Stub → src body mapping | Stubs use `{{ include "agents/<name>.md" }}` in the body — a custom Go template function registered by `build.go` that reads and renders the referenced file from `src/sdd/`; if body has no `include`, stub renders as-is | Reference is in the template itself; no special frontmatter field; survives any directory renaming; `droids/` → `agents/` mapping is explicit in the stub body |
| Marketplace manifest | Static files at repo root: `agent-plugins/.factory-plugin/marketplace.json` and `agent-plugins/.claude-plugin/marketplace.json`, pointing to `factory/sdd/dist` and `claude/sdd/dist` respectively | Root-level manifests not compiled; dist/ plugin.json is the compiled manifest |
| dist/ tracked in git | Yes — CI commits dist/ same as today | Diff visibility; clone-and-go install; consistent with existing practice |
| Claude plugin root | `claude/sdd/dist/` — `.mcp.json` and `.claude-plugin/plugin.json` move inside dist/ | Claude is not special; same pattern as factory |
| Migration | All in one change: strip src agent bodies, convert existing stubs, remove .agent-templates/, restructure dist/ | Avoids a long-lived transitional state |
| Go script location | `src/sdd/build.go` with `go.mod` in `src/sdd/`; invoked via `cd src/sdd && go run build.go` | Requires `go.mod` for YAML parsing dependency (`gopkg.in/yaml.v3`); single Go file plus module |
| Stub linter | `build.go --lint` runs in CI before merge to main; checks: (1) every stub parses as a valid Go template, (2) every stub contains at least one `{{ }}` expression, (3) every file in `src/sdd/` that should have a corresponding stub has one in every platform directory — catches orphaned src files with no platform representation | Prevents invalid stubs, non-templated stubs, and forgotten platform coverage from landing |

## Directory layout after change

```
agent-plugins/
├── .factory-plugin/marketplace.json   ← static, points to factory/sdd/dist
├── .claude-plugin/marketplace.json    ← static, points to claude/sdd/dist
├── src/sdd/
│   ├── agents/              ← body-only .md files (no frontmatter)
│   ├── skills/              ← body-only .md files (no frontmatter)
│   ├── hooks/guards/        ← platform-neutral guard scripts
│   ├── version.json         ← version source of truth
│   ├── go.mod               ← Go module (for gopkg.in/yaml.v3)
│   ├── go.sum
│   └── build.go             ← replaces build.sh; cd src/sdd && go run build.go
├── factory/sdd/             ← everything here (outside dist/) is a stub/template
│   ├── .factory-plugin/
│   │   └── plugin.json      ← Go template stub → dist/.factory-plugin/plugin.json
│   ├── mcp.json             ← Go template stub → dist/mcp.json
│   ├── context.md           ← Go template stub → dist/context.md
│   ├── droids/              ← frontmatter-only .md stubs → dist/droids/ (merged with src body)
│   ├── skills/              ← frontmatter-only .md stubs → dist/skills/ (merged with src body)
│   ├── hooks/               ← Go template stubs (hooks.json, wrappers); guards use {{ include }}
│   │   ├── hooks.json       ← Go template stub (platform-specific hook registration)
│   │   ├── workflow-reminder-hook.sh  ← Go template stub (platform I/O wrapper)
│   │   └── guards/          ← stubs that {{ include }} shared guards from src/sdd/hooks/guards/
│   ├── docs-mcp.js          ← stub for compiled artifact
│   ├── docs-dashboard.js    ← stub for compiled artifact
│   ├── docs-dashboard/      ← stubs for compiled UI assets
│   └── dist/                ← fully derived, CI-tracked
│       ├── .factory-plugin/plugin.json
│       ├── mcp.json
│       ├── context.md
│       ├── droids/
│       ├── skills/
│       ├── hooks/
│       ├── docs-mcp.js
│       ├── docs-dashboard.js
│       └── docs-dashboard/
└── claude/sdd/              ← everything here (outside dist/) is a stub/template
    ├── .claude-plugin/
    │   └── plugin.json      ← Go template stub → dist/.claude-plugin/plugin.json
    ├── .mcp.json            ← Go template stub → dist/.mcp.json
    ├── context.md           ← Go template stub → dist/context.md
    ├── agents/              ← frontmatter-only .md stubs → dist/agents/ (merged with src body)
    ├── skills/              ← frontmatter-only .md stubs → dist/skills/ (merged with src body)
    ├── hooks/               ← Go template stubs (hooks.json, wrappers, guards)
    │   ├── hooks.json       ← Go template stub (Claude-specific hook registration)
    │   ├── blocked-commands-hook.sh   ← Claude I/O wrapper stub
    │   ├── source-guard-hook.sh       ← Claude I/O wrapper stub
    │   ├── workflow-reminder-hook.sh  ← Claude I/O wrapper stub
    │   └── guards/          ← stubs that {{ include }} shared guards from src/sdd/hooks/guards/
    ├── docs-mcp.js          ← stub for compiled artifact
    ├── docs-dashboard.js    ← stub for compiled artifact
    ├── docs-dashboard/      ← stubs for compiled UI assets
    └── dist/                ← fully derived, CI-tracked
        ├── .claude-plugin/plugin.json
        ├── .mcp.json
        ├── context.md
        ├── agents/
        ├── skills/
        ├── hooks/
        ├── docs-mcp.js
        ├── docs-dashboard.js
        └── docs-dashboard/
```

## Component Changes

### `src/sdd/build.go`
New file. Replaces `build.sh` entirely. Responsibilities:

1. **Stub rendering**: For each platform directory, recursively walk all files outside `dist/`. Render each as a Go `text/template` with shared data context (version.json fields + platform vars + YAML frontmatter if present). Register one custom function: `include "path"` — reads `src/sdd/<path>`, renders it with the same data context, returns inline. Write output to `platform/sdd/dist/<mirrored-path>`.

2. **Compiled artifacts**: Shell out to `bun build` / `npm run build` to produce `docs-mcp.js`, `docs-dashboard.js`, and UI assets; place results in `dist/`.

3. **Build hash**: Content-hash all input files (src/sdd/ + platform stubs) using SHA256 — walk all files, hash each, combine into a single digest. Store in `src/sdd/version.json` as `_buildHash`. Version bumps only when actual content changes, not on unrelated commits. Replaces the current `git rev-parse HEAD` approach.

4. **Validation**: Check expected files exist in each platform's `dist/`.

Example stubs:

`factory/sdd/droids/dev-harness.md`:
```
---
name: dev-harness
description: ...
model: claude-opus-4-5
tools: "*"
---
{{ include "agents/dev-harness.md" }}
```

`factory/sdd/.factory-plugin/plugin.json`:
```json
{
  "name": "spec-driven-dev",
  "version": "{{ .Version }}",
  "description": "{{ .Description }}",
  "_buildHash": "{{ .BuildHash }}"
}
```

### `src/sdd/agents/*.md`
Remove frontmatter from all 4 agent files (design-evaluator, dev-harness, implementation-evaluator, spec-evaluator). Keep body only.

### `factory/sdd/droids/*.md`
Convert from full content (frontmatter + body) to frontmatter-only stubs.

### `claude/sdd/agents/*.md`
Convert from full content (frontmatter + body) to frontmatter-only stubs.

### `factory/sdd/skills/*/SKILL.md` and `claude/sdd/skills/*/SKILL.md`
Convert from full content to frontmatter-only stubs.

### `factory/sdd/.agent-templates/`
Deleted — replaced by stubs.

### `factory/sdd/.factory-plugin/plugin.json` and `factory/sdd/mcp.json`
Convert from hard-coded JSON to Go template stubs. Add `{{ .Version }}`, `{{ .Description }}`, `{{ .BuildHash }}`, and any path variables. Rendered into dist/ by build.go.

### `claude/sdd/.claude-plugin/plugin.json`, `claude/sdd/.mcp.json`, `claude/sdd/context.md`
Convert to Go template stubs if not already. Add template variables as needed. Rendered into dist/ by build.go.

### `agent-plugins/.factory-plugin/marketplace.json`
New static file pointing to `factory/sdd/dist`.

### `agent-plugins/.claude-plugin/marketplace.json`
New static file pointing to `claude/sdd/dist`.

## Impact

- `src/sdd/build.sh` — deleted
- `src/sdd/build.go` — new; replaces build.sh entirely
- `src/sdd/agents/*.md` — strip frontmatter, keep body only
- `factory/sdd/droids/*.md` — strip body, keep frontmatter only
- `claude/sdd/agents/*.md` — strip body, keep frontmatter only
- `factory/sdd/skills/*/SKILL.md` — strip body, keep frontmatter only
- `claude/sdd/skills/*/SKILL.md` — strip body, keep frontmatter only
- `factory/sdd/.factory-plugin/plugin.json` — convert to Go template stub
- `factory/sdd/mcp.json` — convert to Go template stub
- `claude/sdd/.claude-plugin/plugin.json` — convert to Go template stub
- `claude/sdd/.mcp.json` — convert to Go template stub
- `claude/sdd/context.md` — convert to Go template stub (if it uses any build vars)
- `factory/sdd/.agent-templates/` — deleted
- `src/sdd/skills/local-setup/` — deleted (development-only, doesn't belong in dist/)
- `src/sdd/skills/setup/SKILL.md` — new; common setup body extracted from existing platform-specific setup skills
- `agent-plugins/.factory-plugin/marketplace.json` — new static file
- `agent-plugins/.claude-plugin/marketplace.json` — new static file

## Scope

All in one change. No special cases — setup skill follows the same stub+template pattern as everything else. Each platform has its own setup stub (e.g., `claude/sdd/skills/setup/SKILL.md`, `factory/sdd/skills/setup/SKILL.md`) with platform-specific frontmatter, and the shared body comes from `src/sdd/skills/setup/SKILL.md` via `{{ include }}`.

## Integration Test Cases

| Test case | What it verifies | Components exercised |
|-----------|------------------|----------------------|
| Delete `factory/sdd/dist/`, run `go run src/sdd/build.go`, `dist/` is fully restored | dist/ is fully derived | build.go |
| `factory/sdd/dist/droids/dev-harness.md` has factory frontmatter + src body | Go template merge + include works correctly | build.go |
| `factory/sdd/dist/.factory-plugin/plugin.json` has correct version | Non-.md stub rendered with version.json data | build.go |
| `claude/sdd/dist/.mcp.json` rendered from stub template | Non-.md stub rendering works for Claude | build.go |
| `build.go --lint` rejects a stub with no `{{ }}` expression | Linter catches non-templated stubs | build.go --lint |
| `build.go --lint` rejects a stub with invalid Go template syntax | Linter catches malformed stubs | build.go --lint |
| Add `src/sdd/agents/new-agent.md` without a stub in factory/sdd/ or claude/sdd/ → lint fails | Linter catches orphaned src files missing platform stubs | build.go --lint |
| `agent-plugins/.factory-plugin/marketplace.json` points to `factory/sdd/dist` | Marketplace manifest correct | static file |
| `factory/sdd/droids/dev-harness.md` contains only frontmatter, no body | Stubs are frontmatter-only | migration |
| `factory/sdd/dist/.factory-plugin/plugin.json` contains correct version/buildHash | Non-.md stub rendered with version.json data | build.go |
| `claude/sdd/dist/.mcp.json` rendered from stub template | Non-.md stub rendering works for Claude | build.go |
