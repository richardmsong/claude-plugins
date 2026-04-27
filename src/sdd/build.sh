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

# 6b. Copy UI source and dashboard.sh into the plugin output
# The wrapper script and UI source ship with the plugin so `bun install` + `vite dev`
# can run at dashboard launch time (first-run bun install is handled by dashboard.sh).
echo "Copying docs-dashboard UI source and wrapper..."
mkdir -p "$OUT/docs-dashboard"
rsync -a --exclude='node_modules' --exclude='dist' \
  "$SRC/docs-dashboard/ui/" "$OUT/docs-dashboard/ui/"
cp "$SRC/docs-dashboard/dashboard.sh" "$OUT/docs-dashboard/dashboard.sh"
chmod +x "$OUT/docs-dashboard/dashboard.sh"

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

# 8b. Template agents for non-Claude platforms (ADR-0063)
# For each platform with .agent-templates/, strip Claude frontmatter from canonical
# agents and replace with platform-native frontmatter.
echo "Templating platform agents..."
for platform_dir in "$REPO_ROOT"/*/sdd; do
  templates="$platform_dir/.agent-templates"
  [ -d "$templates" ] || continue

  platform=$(basename "$(dirname "$platform_dir")")
  out_droids="$platform_dir/droids"
  rm -rf "$out_droids"
  mkdir -p "$out_droids"

  for canonical in "$SRC/.agent/agents"/*.md; do
    agent_name=$(basename "$canonical" .md)
    template="$templates/${agent_name}.yaml"

    if [ ! -f "$template" ]; then
      echo "FATAL: missing template $template for agent $agent_name on platform $platform"
      exit 1
    fi

    # Extract body: everything after the closing --- of YAML frontmatter
    body=$(awk '/^---$/{n++; if(n==2){p=1; next}} p' "$canonical")
    if [ -z "$body" ]; then
      echo "FATAL: agent $agent_name has no body after frontmatter stripping"
      exit 1
    fi

    # Write: platform frontmatter + body
    {
      echo "---"
      cat "$template"
      echo "---"
      echo "$body"
    } > "$out_droids/${agent_name}.md"

    echo "  $platform/$agent_name.md"
  done
done

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
         "$OUT/dist/docs-mcp.js" "$OUT/dist/docs-dashboard.js" \
         "$OUT/docs-dashboard/dashboard.sh" "$OUT/docs-dashboard/ui/package.json" \
         "$OUT/hooks/guards/blocked-commands.sh" "$OUT/hooks/guards/source-guard.sh"; do
  [ -f "$f" ] || { echo "FATAL: missing $f"; exit 1; }
done

echo "Build complete: $OUT"
