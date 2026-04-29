---
name: local-setup
description: Developer setup for working on the plugin repo itself. Creates local symlinks for both Claude Code and Droid so edits to the working tree are reflected immediately. Safe to re-run.
version: 2.0.0
user_invocable: true
---

# Local Setup

Developer setup for working on the plugin repo itself. The installed plugin provides skills, agents, MCP, and hooks — but those point at the installed clone, not your working tree. This skill creates local symlinks for both Claude Code and Droid so edits to `src/sdd/` and `droid/sdd/` are reflected immediately.

Safe to re-run — all steps are idempotent.

## Usage

```
/local-setup
```

---

## Resolving paths

**REPO_ROOT** is the repo root (where this skill lives):
```bash
REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
```

Verify `REPO_ROOT/src/sdd/.agent/skills/` exists. If not, stop and tell the user:
```
Cannot find src/sdd/.agent/skills/ — are you in the plugin repo?
```

---

## Algorithm

```
1. Resolve REPO_ROOT
2. Symlink skills and agents into .agent/ (shared vendor-neutral path)
3. Symlink Claude Code discovery paths (.claude/skills/)
4. Symlink Droid discovery paths (.factory/skills/, .factory/droids/)
5. Install docs-mcp dependencies (bun install)
6. Write project-local .mcp.json with --root src/sdd
7. Write spec-driven-config.json (if absent)
8. Scaffold CLAUDE.md
9. Bootstrap default permissions in .claude/settings.json
10. Bootstrap Droid command allowlist in .factory/settings.json
11. Verify
```

---

## Step 1 — Symlink skills and agents into .agent/

`.agent/skills/` is the vendor-neutral path (Agent Skills standard). All shared skills live there.

```bash
# .agent/skills → canonical shared source
ln -sfn "${REPO_ROOT}/src/sdd/.agent/skills" "${REPO_ROOT}/.agent/skills"

# .agent/agents → canonical shared agents
ln -sfn "${REPO_ROOT}/src/sdd/.agent/agents" "${REPO_ROOT}/.agent/agents"
```

Print the count: `"Symlinked N skills and M agents into .agent/"`

---

## Step 2 — Symlink Claude Code discovery paths

Claude Code discovers skills at `.claude/skills/`.

```bash
mkdir -p "${REPO_ROOT}/.claude"
ln -sfn "${REPO_ROOT}/.agent/skills" "${REPO_ROOT}/.claude/skills"
```

Print: `"Claude Code: .claude/skills/ → .agent/skills/"`

---

## Step 3 — Symlink Droid discovery paths

Droid discovers skills at `.factory/skills/` and droids (subagents) at `.factory/droids/`. Point skills at `droid/sdd/skills/` (the Droid platform package, which includes the platform-specific `setup` skill plus symlinks to shared skills). Point droids at `droid/sdd/droids/` (build output with Droid-native frontmatter, per ADR-0063).

```bash
mkdir -p "${REPO_ROOT}/.factory"

# Skills: use droid/sdd/skills/ so the platform-specific setup skill is included
ln -sfn "${REPO_ROOT}/droid/sdd/skills" "${REPO_ROOT}/.factory/skills"

# Droids: use droid/sdd/droids/ (build output with Droid-native frontmatter)
ln -sfn "${REPO_ROOT}/droid/sdd/droids" "${REPO_ROOT}/.factory/droids"
```

Print: `"Droid: .factory/skills/ → droid/sdd/skills/, .factory/droids/ → droid/sdd/droids/"`

---

## Step 4 — Install docs-mcp dependencies

```bash
cd "${REPO_ROOT}/src/sdd/docs-mcp" && bun install
```

Print: `"Installed docs-mcp dependencies"`

---

## Step 5 — Write project-local .mcp.json override

This repo's `docs/` lives at `src/sdd/docs/`, not the project root. Write a project-level `.mcp.json` that passes `--root src/sdd` so docs-mcp finds the right directory. The `mcpServers` key is recognized by both Claude Code and Droid.

If `${REPO_ROOT}/.mcp.json` does not exist, create it:

```json
{
  "mcpServers": {
    "docs": {
      "command": "bun",
      "args": [
        "run",
        "src/sdd/docs-mcp/src/index.ts",
        "--root",
        "src/sdd"
      ]
    }
  }
}
```

If the file already exists and already has a `mcpServers.docs` key, print: `".mcp.json already has docs config — skipping"`

---

## Step 6 — Write spec-driven-config.json

If `${REPO_ROOT}/spec-driven-config.json` does not exist, create it:

```json
{
  "source_dirs": ["**/src/**"],
  "blocked_commands": [
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

If the file already exists, print: `"spec-driven-config.json already exists — skipping"`

---

## Step 7 — Scaffold CLAUDE.md

Inject or update the SDD workflow rules in `${REPO_ROOT}/CLAUDE.md` using marker-delimited content. The SDD section is wrapped in `<!-- sdd:begin -->` / `<!-- sdd:end -->` HTML comments.

Read the canonical workflow rules from `${REPO_ROOT}/src/sdd/context.md` and wrap in markers.

**Upsert logic:**
- **No CLAUDE.md**: Create it with the SDD marker block.
- **CLAUDE.md exists, no markers**: Prepend the SDD marker block above existing content.
- **CLAUDE.md exists, has markers**: Replace everything between markers with the latest content.

---

## Step 8 — Bootstrap default permissions (Claude Code)

Read or create `${REPO_ROOT}/.claude/settings.json`. Merge the following `allow` entries into the existing array (do not duplicate):

```json
{
  "permissions": {
    "allow": [
      "Bash",
      "Edit",
      "Write",
      "Update",
      "mcp__docs__*"
    ]
  }
}
```

---

## Step 9 — Bootstrap Droid command allowlist

Read or create `${REPO_ROOT}/.factory/settings.json`. Merge the following `commandAllowlist` entries into the existing array (do not duplicate):

```json
{
  "commandAllowlist": [
    "git add",
    "git commit",
    "git diff",
    "git log",
    "git status",
    "git stash"
  ]
}
```

Print: `"Droid: command allowlist configured in .factory/settings.json"`

---

## Step 10 — Verify

| Check | Command | Pass |
|-------|---------|------|
| .agent/skills | `ls ${REPO_ROOT}/.agent/skills/*/SKILL.md \| wc -l` | Skills present |
| .agent/agents | `ls ${REPO_ROOT}/.agent/agents/*.md \| wc -l` | Agents present |
| .claude/skills | `test -L ${REPO_ROOT}/.claude/skills` | Claude symlink present |
| .factory/skills | `test -L ${REPO_ROOT}/.factory/skills` | Droid skills symlink present |
| .factory/droids | `test -L ${REPO_ROOT}/.factory/droids` | Droid droids symlink present |
| config | `test -f ${REPO_ROOT}/spec-driven-config.json` | Config present |
| CLAUDE.md | `test -f ${REPO_ROOT}/CLAUDE.md` | Workflow rules present |
| .claude/settings | `test -f ${REPO_ROOT}/.claude/settings.json` | Claude permissions configured |
| .factory/settings | `test -f ${REPO_ROOT}/.factory/settings.json` | Droid allowlist configured |
