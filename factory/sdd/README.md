# spec-driven-dev — Droid Platform Package (stub)

Droid support is coming. This directory demonstrates the platform package pattern.

## What's here

- `skills/` — symlinks to the shared skills in `src/sdd/.agent/skills/`
- `agents/` — symlink to the shared agent definitions in `src/sdd/.agent/agents/`

## What's not here yet

- Droid marketplace metadata (`.droid-plugin/plugin.json` or equivalent) — format TBD when Droid's plugin format is documented
- Droid-specific setup skill — will be added when Droid's context injection mechanism is known
- Hook registration — will be added when Droid's hook format is known

## The plugin's core data

All skills, agents, MCP server source, dashboard, binaries, and guard scripts live at `src/sdd/` — the canonical agent-neutral source. Droid can read skills from `droid/sdd/skills/` without a platform-specific setup, as long as the repo is cloned locally.

## Contributing

See `claude/sdd/` as a reference for what a complete platform package looks like. The pattern:
1. `skills/` — per-skill symlinks to `src/sdd/.agent/skills/<name>`
2. `agents` — symlink to `src/sdd/.agent/agents/`
3. Platform metadata (marketplace descriptor, plugin.json)
4. Platform-specific setup skill
5. Hook wrappers that delegate to `src/sdd/hooks/guards/`
