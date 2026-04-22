---
name: setup
description: One-time setup for the spec-driven-dev plugin. Compiles the docs-mcp binary, symlinks sdd-master, and initializes per-project config files. Safe to re-run.
version: 1.0.0
user_invocable: true
---

# Setup

One-time setup for the `spec-driven-dev` plugin. Compiles the docs-mcp binary, symlinks `sdd-master` for CLI convenience, and initializes per-project config files.

Safe to re-run — all steps are idempotent.

## Usage

```
/spec-driven-dev:setup
```

---

## Prerequisites

```bash
which bun    # install: curl -fsSL https://bun.sh/install | bash
which claude # install: npm install -g @anthropic-ai/claude-code
```

---

## Algorithm

```
1. Compile docs-mcp binary
2. Symlink sdd-master to ~/.local/bin/
3. Initialize per-project config files (if absent)
4. Scaffold CLAUDE.md (if absent)
5. Bootstrap default permissions in .claude/settings.json
6. Verify
```

---

## Step 1 — Compile docs-mcp binary

```bash
cd "${CLAUDE_PLUGIN_ROOT}/docs-mcp" && bun install && bun run build
```

This produces `${CLAUDE_PLUGIN_ROOT}/bin/docs-mcp` — the compiled binary that the plugin's `.mcp.json` references. Always recompile (picks up source updates from plugin).

If `bun` is not installed, stop and tell the user:
```
bun is required to compile the docs-mcp binary.
Install: curl -fsSL https://bun.sh/install | bash
```

---

## Step 2 — Symlink sdd-master

```bash
mkdir -p ~/.local/bin
ln -sf "${CLAUDE_PLUGIN_ROOT}/bin/sdd-master" ~/.local/bin/sdd-master
```

Check if `~/.local/bin` is on PATH:
```bash
echo "$PATH" | tr ':' '\n' | grep -q "$HOME/.local/bin"
```

If not on PATH, warn the user:
```
~/.local/bin is not on your PATH. Add this to your shell profile:

  export PATH="$HOME/.local/bin:$PATH"

The sdd-master CLI shortcut won't work until PATH is updated.
The hook and MCP server are unaffected (they use ${CLAUDE_PLUGIN_ROOT} paths).
```

---

## Step 3 — Initialize per-project config files

These files are created in the current project directory. Each is **skipped if already present** to preserve user customizations.

### .agent/blocked-commands.json

If `$CLAUDE_PROJECT_DIR/.agent/blocked-commands.json` does not exist, create it with default ban rules:

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

If the file already exists, print: `".agent/blocked-commands.json already exists — skipping (preserving customizations)"`

### .agent/master-config.json

If `$CLAUDE_PROJECT_DIR/.agent/master-config.json` does not exist, create it with empty source dirs:

```json
{
  "source_dirs": []
}
```

Tell the user: `"Edit .agent/master-config.json to list source directories that only agents can modify (e.g. 'src/**/*.ts')."`

If the file already exists, print: `".agent/master-config.json already exists — skipping"`

---

## Step 4 — Scaffold CLAUDE.md

If `$CLAUDE_PROJECT_DIR/CLAUDE.md` does not exist, create it with the core SDD workflow rules:

```markdown
# Project Rules

## All changes — /feature-change first

**Never write implementation code directly for any app change.**
Every change — feature, bug fix, refactor, config, UI tweak, backend change — goes through `/feature-change` first.

The loop: `/feature-change` checks the spec → updates spec if needed → commits spec → calls dev-harness → implements and tests.

For bug fixes where the spec is already correct, `/feature-change` skips the spec update and goes straight to dev-harness.

## New feature detected → invoke /plan-feature immediately

When the user describes anything that looks like a potential new feature, jump straight into `/plan-feature` — don't wait for the full picture, don't rely on keeping it in memory.

Planning context is lost when you get compacted or switched out. The ADR on disk is the durable form. Start `/plan-feature` on the first mention, even mid-conversation, even if there are still open questions — drafts are first-class and can be paused, committed, and resumed.

Heuristic: if the user says something like "maybe we should…", "what if…", "could we add…", "I want to…", or describes a capability the app doesn't have yet → that's `/plan-feature`. Don't ask permission; just start the skill and let the Q&A surface the rest.

## Parallelism — use subagents for independent work

When requests can be parallelized, use subagents extensively rather than handling them sequentially.

Launch multiple agents in a single message when their work is independent. Don't serialize tasks that can overlap.
```

If the file already exists, print: `"CLAUDE.md already exists — skipping (preserving customizations)"`

Tell the user: `"Review CLAUDE.md and add project-specific rules (component lists, deploy commands, etc.)"`

---

## Step 5 — Bootstrap default permissions

Read or create `$CLAUDE_PROJECT_DIR/.claude/settings.json`. Merge the following `allowedTools` entries into the existing array (do not duplicate entries that already exist):

```json
{
  "permissions": {
    "allowedTools": [
      "Edit",
      "Write",
      "mcp__plugin_spec-driven-dev_docs__search_docs",
      "mcp__plugin_spec-driven-dev_docs__get_section",
      "mcp__plugin_spec-driven-dev_docs__get_lineage",
      "mcp__plugin_spec-driven-dev_docs__list_docs",
      "Bash(bun *)",
      "Bash(bun test*)",
      "Bash(bunx *)",
      "Bash(git add*)",
      "Bash(git commit*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git status*)",
      "Bash(git stash*)",
      "Bash(git checkout*)",
      "Bash(git branch*)",
      "Bash(git rev-parse*)",
      "Bash(git ls-tree*)",
      "Bash(git cat-file*)",
      "Bash(git show*)",
      "Bash(find *)",
      "Bash(grep *)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Bash(wc *)",
      "Bash(head *)",
      "Bash(tail *)",
      "Bash(mkdir *)",
      "Bash(rm -rf /tmp/*)",
      "Bash(curl -s *)"
    ]
  }
}
```

These permissions are required for:
- **Edit/Write**: dev-harness and spec-evaluator subagents run without supervision and cannot prompt for permission
- **docs MCP tools**: read-only doc operations should never require approval
- **Bash patterns**: test runners (bun test), git operations, and filesystem exploration are core to the workflow

If `.claude/settings.json` already exists with an `allowedTools` array, merge only entries that are not already present. Do not remove existing entries.

Print: `"Default permissions configured in .claude/settings.json"`

---

## Step 6 — Verify

Run these checks and report results:

| Check | Command | Pass |
|-------|---------|------|
| docs-mcp binary exists | `test -x "${CLAUDE_PLUGIN_ROOT}/bin/docs-mcp"` | Binary compiled |
| sdd-master symlink | `test -L ~/.local/bin/sdd-master` | Symlink in place |
| sdd-master on PATH | `which sdd-master` | Callable from CLI |
| blocked-commands config | `test -f .agent/blocked-commands.json` | Config present |
| master config | `test -f .agent/master-config.json` | Config present |
| CLAUDE.md | `test -f CLAUDE.md` | Workflow rules present |
| permissions | `test -f .claude/settings.json` | Default permissions configured |

Report pass/fail for each. Any failure is non-fatal — the plugin still works for skills and hooks; only the failed capability is degraded.
