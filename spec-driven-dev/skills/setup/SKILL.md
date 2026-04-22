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
4. Verify
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

## Step 4 — Verify

Run these checks and report results:

| Check | Command | Pass |
|-------|---------|------|
| docs-mcp binary exists | `test -x "${CLAUDE_PLUGIN_ROOT}/bin/docs-mcp"` | Binary compiled |
| sdd-master symlink | `test -L ~/.local/bin/sdd-master` | Symlink in place |
| sdd-master on PATH | `which sdd-master` | Callable from CLI |
| blocked-commands config | `test -f .agent/blocked-commands.json` | Config present |
| master config | `test -f .agent/master-config.json` | Config present |

Report pass/fail for each. Any failure is non-fatal — the plugin still works for skills and hooks; only the failed capability is degraded.
