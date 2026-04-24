#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$REPO_ROOT/src/sdd"
OUT="$REPO_ROOT/claude/sdd"

echo "=== SDD Plugin Build ==="

# 1. Remove stale symlinks in OUT (leave real files intact)
echo "Cleaning stale symlinks..."
find "$OUT" -type l -delete

# 2. Install workspace dependencies (needed for workspace:* resolution)
# Note: --frozen-lockfile is NOT used because bun.lock is gitignored
# (it contained internal registry URLs). bun install regenerates it from package.json.
echo "Installing workspace dependencies..."
cd "$SRC"
bun install

# 3. Bundle MCP server
echo "Bundling docs-mcp..."
mkdir -p "$OUT/dist"
bun build --target=bun "$SRC/docs-mcp/src/index.ts" --outfile "$OUT/dist/docs-mcp.js"

# 4. Bundle dashboard server
# No --define needed: server.ts uses process.env.CLAUDE_PLUGIN_ROOT at runtime
echo "Bundling docs-dashboard..."
bun build --target=bun "$SRC/docs-dashboard/src/server.ts" \
  --outfile "$OUT/dist/docs-dashboard.js"

# 5. Build dashboard UI
echo "Building dashboard UI..."
cd "$SRC/docs-dashboard/ui"
bun run build
mkdir -p "$OUT/dist/ui"
cp -R dist/* "$OUT/dist/ui/"

# 6. Copy skills (excluding local-setup which is dev-only)
# NOTE: The setup/ skill has NO counterpart in src/sdd/.agent/skills/ — it lives
# only in claude/sdd/skills/setup/ and is the one skill that is authored directly
# in the output directory (it's Claude-specific and not part of the canonical source).
# The per-skill rm+cp below is safe because it only touches skills that exist in SRC.
# A full `rm -rf "$OUT/skills"` would delete setup/ — never do that.
echo "Copying skills..."
for skill in "$SRC/.agent/skills"/*/; do
  name=$(basename "$skill")
  [ "$name" = "local-setup" ] && continue
  rm -rf "$OUT/skills/$name"
  cp -R "$skill" "$OUT/skills/$name"
done

# 7. Post-process dashboard skill for bundled distribution
# The source SKILL.md has three things that don't work in the bundled install:
#   a. Step 1 references docs-dashboard/ui/ for building UI — doesn't exist in bundle (UI is pre-built)
#   b. Server path points to TypeScript source — must point to bundled JS
#   c. --docs-dir flag — server.ts only parses --root (with CLAUDE_PROJECT_DIR fallback)
# Strategy: rewrite the entire SKILL.md to the distribution version.
cat > "$OUT/skills/dashboard/SKILL.md" << 'SKILL_EOF'
---
name: dashboard
description: Start the docs dashboard server. UI is pre-built; launches the bundled Bun server on port 4567.
version: 1.0.0
user_invocable: true
---

# Dashboard

Start the docs dashboard server for browsing ADRs, specs, lineage graphs, and blame data.

## Usage

```
/dashboard [--port <n>]
```

---

## Algorithm

```
1. Start the server
2. Open in browser (if Playwright MCP available)
```

No UI build step needed — the UI is pre-built and bundled at `${CLAUDE_PLUGIN_ROOT}/dist/ui/`.

---

## Step 1 — Start the server

Launch the dashboard server in the background. Try the default port first; if it's in use, increment and retry:

```bash
PORT=<port>
while lsof -iTCP:$PORT -sTCP:LISTEN &>/dev/null; do
  PORT=$((PORT + 1))
done
cd "$CLAUDE_PROJECT_DIR" && bun run "${CLAUDE_PLUGIN_ROOT}/dist/docs-dashboard.js" --root "$CLAUDE_PROJECT_DIR" --port $PORT
```

Default port is `4567`. If the user passed `--port <n>`, start scanning from that port instead.

Use `run_in_background: true` so the server runs without blocking the session.

Print the URL: `Dashboard running at http://127.0.0.1:<port>/`

---

## Step 2 — Open in browser (optional)

If the Playwright MCP is available, navigate to the dashboard URL to confirm it's serving:

```
mcp__playwright__browser_navigate({ url: "http://127.0.0.1:<port>/" })
```

If Playwright is not available, just print the URL and let the user open it manually.
SKILL_EOF

# 7b. Write the bundled .mcp.json (overwrite existing — it references TS source)
cat > "$OUT/.mcp.json" << 'MCP_EOF'
{
  "docs": {
    "command": "bun",
    "args": [
      "run",
      "${CLAUDE_PLUGIN_ROOT}/dist/docs-mcp.js"
    ]
  }
}
MCP_EOF

# 8. Copy agents
echo "Copying agents..."
rm -rf "$OUT/agents"
cp -R "$SRC/.agent/agents" "$OUT/agents"

# 9. Copy guard scripts
echo "Copying guards..."
mkdir -p "$OUT/hooks/guards"
cp "$SRC/hooks/guards/blocked-commands.sh" "$OUT/hooks/guards/"
cp "$SRC/hooks/guards/source-guard.sh" "$OUT/hooks/guards/"

# 10. Rewrite hook wrappers to use CLAUDE_PLUGIN_ROOT instead of relative src/ path
# The source files contain: GUARD="$SCRIPT_DIR/../../../src/sdd/hooks/guards/..."
# We replace the entire GUARD= line to avoid sed escaping issues with $ and quotes.
# Note: uses a temp file instead of sed -i to be portable across BSD and GNU sed
# (BSD sed requires `sed -i ''`, GNU sed requires `sed -i` — no single syntax works on both).
for wrapper in "$OUT/hooks/blocked-commands-hook.sh" "$OUT/hooks/source-guard-hook.sh"; do
  guard_name=$(grep 'GUARD=' "$wrapper" | sed 's|.*/||' | tr -d '"')
  sed "s|^GUARD=.*|GUARD=\"\${CLAUDE_PLUGIN_ROOT}/hooks/guards/${guard_name}\"|" "$wrapper" > "$wrapper.tmp"
  mv "$wrapper.tmp" "$wrapper"
done

# 11. Copy context.md
cp "$SRC/context.md" "$OUT/context.md"

# 12. Validate critical files exist
echo "Validating build..."
for f in "$OUT/skills/setup/SKILL.md" "$OUT/.mcp.json" "$OUT/.claude-plugin/plugin.json" \
         "$OUT/dist/docs-mcp.js" "$OUT/dist/docs-dashboard.js" "$OUT/dist/ui/index.html" \
         "$OUT/hooks/guards/blocked-commands.sh" "$OUT/hooks/guards/source-guard.sh"; do
  [ -f "$f" ] || { echo "FATAL: missing $f"; exit 1; }
done

echo "Build complete: $OUT"
