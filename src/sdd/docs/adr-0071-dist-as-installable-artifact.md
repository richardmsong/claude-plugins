# ADR: dist/ as the installable plugin artifact per platform

**Status**: draft
**Status history**:
- 2026-04-29: draft

## Overview

Restructure each platform output directory so that `platform/sdd/dist/` is the complete, self-contained installable plugin artifact. Every file in `dist/` has exactly one corresponding stub file in the platform directory tree (outside `dist/`). A committed Go script (`src/sdd/build_templates.go`) renders all stubs as Go `text/template` files into `dist/`. For `.md` files the stub provides frontmatter (data context) and the matching `src/sdd/` file provides the body (template text). For all other files (`.json`, shell scripts, etc.) the stub itself is the complete Go template. Files with no `{{ }}` expressions render verbatim — copy is a degenerate template. Compiled artifacts (`docs-mcp.js`, `docs-dashboard.js`, UI assets) are built by `build.sh` and placed in `dist/` separately. `build.sh` is also updated for the unnested `src/sdd/` source paths.

## Motivation

Two compounding problems:

1. **Source unnesting**: `src/sdd/.agent/agents/` → `src/sdd/agents/`, `src/sdd/.agent/skills/` → `src/sdd/skills/`. `build.sh` still references the old `.agent/` paths and is broken.

2. **No clear installable artifact boundary**: the whole `platform/sdd/` directory mixes build inputs (`.agent-templates/`, `hooks/`) with generated outputs (`droids/`, `skills/`, `context.md`, `mcp.json`, `dist/`). Pointing a plugin installer at the whole directory is fragile. Making `dist/` the single installable artifact gives a clean boundary: delete `dist/`, run `build.sh + src/sdd/ + platform/sdd/`, and `dist/` is fully restored.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Installable artifact | `platform/sdd/dist/` is the complete, self-contained plugin package | Clean install boundary: everything a plugin host needs is inside dist/ |
| Top-level stubs | `platform/sdd/agents/` (or `droids/`), `skills/`, etc. hold `.md` stub files — frontmatter + a body that uses `{{ include "agents/<name>.md" }}` to pull in the src body | Replaces `.agent-templates/`; reference to src is explicit in the template, not in a special metadata field |
| `.agent-templates/` | Removed — stubs are the template source | Stubs are more readable and directly editable; eliminates indirection |
| Templating engine | Go `text/template`, driven by a committed script `src/sdd/build_templates.go` | Go 1.26 is already installed; no new binary dependency; owned Go script |
| Uniform stub rule | Every file in `dist/` has exactly one stub in `platform/sdd/` (outside dist/); `build_templates.go` renders stubs → dist/ | No special-cased files; all config is visible in the stub tree |
| Template data | Shared context: version.json fields + platform vars; YAML frontmatter (if present) merged in as additional fields | Uniform across all file types; no branching on extension |
| `include` function | Custom Go template function: reads `src/sdd/<path>`, renders it with the same data context, returns inline | Decouples stub directory name (droids/) from src directory name (agents/); explicit in the template |
| Compiled artifacts | `docs-mcp.js`, `docs-dashboard.js`, UI assets — built by `build.sh`, placed in dist/ directly (not stub-driven) | Cannot be Go-templated; only exception to the uniform stub rule |
| src/sdd/agents/ body | Body-only, no frontmatter — stubs own the frontmatter entirely | Clean separation; frontmatter in src would be misleading since it is never used |
| Stub → src body mapping | Stubs use `{{ include "agents/<name>.md" }}` in the body — a custom Go template function registered by `build_templates.go` that reads and renders the referenced file from `src/sdd/`; if body has no `include`, stub renders as-is | Reference is in the template itself; no special frontmatter field; survives any directory renaming; `droids/` → `agents/` mapping is explicit in the stub body |
| Marketplace manifest | Static files at repo root: `agent-plugins/.factory-plugin/marketplace.json` and `agent-plugins/.claude-plugin/marketplace.json`, pointing to `factory/sdd/dist` and `claude/sdd/dist` respectively | Root-level manifests not compiled; dist/ plugin.json is the compiled manifest |
| dist/ tracked in git | Yes — CI commits dist/ same as today | Diff visibility; clone-and-go install; consistent with existing practice |
| Claude plugin root | `claude/sdd/dist/` — `.mcp.json` and `.claude-plugin/plugin.json` move inside dist/ | Claude is not special; same pattern as factory |
| Migration | All in one change: strip src agent bodies, convert existing stubs, remove .agent-templates/, restructure dist/ | Avoids a long-lived transitional state |
| Go script location | `src/sdd/build_templates.go`, invoked by `build.sh` via `go run src/sdd/build_templates.go` | Co-located with build.sh; single Go file, no module needed |

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
│   ├── build.sh
│   └── build_templates.go
├── factory/sdd/             ← everything here (outside dist/) is a stub/template
│   ├── .factory-plugin/
│   │   └── plugin.json      ← Go template stub → dist/.factory-plugin/plugin.json
│   ├── mcp.json             ← Go template stub → dist/mcp.json
│   ├── context.md           ← Go template stub → dist/context.md
│   ├── droids/              ← frontmatter-only .md stubs → dist/droids/ (merged with src body)
│   ├── skills/              ← frontmatter-only .md stubs → dist/skills/ (merged with src body)
│   ├── hooks/               ← Go template stubs → dist/hooks/ (hooks.json, wrappers)
│   └── dist/                ← fully derived, CI-tracked
│       ├── .factory-plugin/plugin.json
│       ├── mcp.json
│       ├── context.md
│       ├── droids/
│       ├── skills/
│       ├── hooks/guards/
│       ├── docs-mcp.js      ← compiled artifact (not stub-driven)
│       ├── docs-dashboard.js
│       └── docs-dashboard/
└── claude/sdd/              ← everything here (outside dist/) is a stub/template
    ├── .claude-plugin/
    │   └── plugin.json      ← Go template stub → dist/.claude-plugin/plugin.json
    ├── .mcp.json            ← Go template stub → dist/.mcp.json
    ├── context.md           ← Go template stub → dist/context.md
    ├── agents/              ← frontmatter-only .md stubs → dist/agents/ (merged with src body)
    ├── skills/              ← frontmatter-only .md stubs → dist/skills/ (merged with src body)
    ├── hooks/               ← Go template stubs → dist/hooks/
    └── dist/                ← fully derived, CI-tracked
        ├── .claude-plugin/plugin.json
        ├── .mcp.json
        ├── context.md
        ├── agents/
        ├── skills/
        ├── hooks/guards/
        ├── docs-mcp.js      ← compiled artifact (not stub-driven)
        ├── docs-dashboard.js
        └── docs-dashboard/
```

## Component Changes

### `src/sdd/build.sh`
- Update all `$SRC/.agent/agents/` → `$SRC/agents/`, `$SRC/.agent/skills/` → `$SRC/skills/`
- Replace unified loop's agent/droid and skill templating with `go run "$SRC/build_templates.go <platform_dir> <src_dir>"`
- Remove explicit plugin.json / mcp.json write steps — these are now stub-rendered by build_templates.go
- Build and place compiled artifacts (docs-mcp.js, docs-dashboard.js, UI) into dist/ as before
- Validation step updated to check dist/ paths

### `src/sdd/build_templates.go`
New file. For each platform directory, recursively walks all files outside `dist/`:

Every stub is rendered as a Go `text/template` with a shared data context (version.json fields + platform vars). One custom function is registered:

- `include "path"` — reads `src/sdd/<path>`, renders it as a Go template with the same data context, returns the result inline

Whether a stub uses `{{ include "..." }}`, `{{ .Version }}`, both, or neither is purely the stub author's choice. The Go script applies the same algorithm to every file regardless of extension.

Example agent stub at `factory/sdd/droids/dev-harness.md`:
```
---
name: dev-harness
description: ...
model: claude-opus-4-5
tools: "*"
---
{{ include "agents/dev-harness.md" }}
```

Example non-`.md` stub at `factory/sdd/.factory-plugin/plugin.json`:
```json
{
  "name": "spec-driven-dev",
  "version": "{{ .Version }}",
  "description": "{{ .Description }}",
  "_buildHash": "{{ .BuildHash }}"
}
```

**For all other files (`.json`, `.sh`, `.md` with no src match):**
1. Parse file as Go `text/template`
2. Data context = `version.json` fields + platform-specific vars (platform name, plugin root path)
3. Render and write to `platform/sdd/dist/<same-relative-path>`

Files with no `{{ }}` expressions are written verbatim.

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
Convert from hard-coded JSON to Go template stubs. Add `{{ .Version }}`, `{{ .Description }}`, `{{ .BuildHash }}`, and any path variables. Rendered into dist/ by build_templates.go.

### `claude/sdd/.claude-plugin/plugin.json`, `claude/sdd/.mcp.json`, `claude/sdd/context.md`
Convert to Go template stubs if not already. Add template variables as needed. Rendered into dist/ by build_templates.go.

### `agent-plugins/.factory-plugin/marketplace.json`
New static file pointing to `factory/sdd/dist`.

### `agent-plugins/.claude-plugin/marketplace.json`
New static file pointing to `claude/sdd/dist`.

## Impact

- `src/sdd/build.sh` — updated src paths, delegates to build_templates.go
- `src/sdd/build_templates.go` — new Go templating script (stub→dist for all file types)
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
- `agent-plugins/.factory-plugin/marketplace.json` — new static file
- `agent-plugins/.claude-plugin/marketplace.json` — new static file

## Scope

All in one change. Setup skill (`setup/`) remains a special case — it lives in `claude/sdd/skills/setup/` as a real file (not in src) and is excluded from stub processing.

## Integration Test Cases

| Test case | What it verifies | Components exercised |
|-----------|------------------|----------------------|
| Delete `factory/sdd/dist/`, run `build.sh`, `dist/` is fully restored | dist/ is fully derived | build.sh, build_templates.go |
| `factory/sdd/dist/droids/dev-harness.md` has factory frontmatter + src body | Go template merge works correctly | build_templates.go |
| `factory/sdd/dist/.factory-plugin/plugin.json` has correct version | dist/ plugin.json generated from version.json | build.sh |
| `claude/sdd/dist/.mcp.json` exists and references dist/ path | .mcp.json moved into dist/ | build.sh |
| `agent-plugins/.factory-plugin/marketplace.json` points to `factory/sdd/dist` | Marketplace manifest correct | static file |
| `factory/sdd/droids/dev-harness.md` contains only frontmatter, no body | Stubs are frontmatter-only | migration |
| `factory/sdd/dist/.factory-plugin/plugin.json` contains correct version/buildHash | Non-.md stub rendered with version.json data | build_templates.go |
| `claude/sdd/dist/.mcp.json` rendered from stub template | Non-.md stub rendering works for Claude | build_templates.go |
