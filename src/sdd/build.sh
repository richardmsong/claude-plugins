#!/usr/bin/env bash
set -euo pipefail

NO_BUMP=false
while [ $# -gt 0 ]; do
  case "$1" in
    --no-bump) NO_BUMP=true; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$REPO_ROOT/src/sdd"
OUT="$REPO_ROOT/claude/sdd"

echo "=== SDD Plugin Build ==="

# ---- Version sync ----
SOURCE_PLUGIN="$SRC/version.json"
CURRENT_HASH=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")

echo "Syncing plugin version..."
python3 -c "
import json, sys, os, glob

source_path = sys.argv[1]
current_hash = sys.argv[2]
repo_root = sys.argv[3]
no_bump = sys.argv[4] == 'true'

with open(source_path) as f:
    source = json.load(f)

version = source.get('version', '')
if not version:
    print('FATAL: no version in ' + source_path, file=sys.stderr)
    sys.exit(1)

description = source.get('description', '')
stored_hash = source.get('_buildHash', '')

# Auto-bump patch if source changed since last build (unless --no-bump)
if current_hash != 'unknown' and current_hash != stored_hash:
    if not no_bump:
        parts = version.split('.')
        if len(parts) == 3:
            parts[2] = str(int(parts[2]) + 1)
            version = '.'.join(parts)
            source['version'] = version
        print(f'  bumped to {version} (hash: {current_hash[:8]})')
    else:
        print(f'  version: {version} (--no-bump, hash updated)')
    source['_buildHash'] = current_hash
    with open(source_path, 'w') as f:
        json.dump(source, f, indent=2)
        f.write('\n')
else:
    print(f'  version: {version} (no change)')

# Discover and sync all other platform plugin.json files
targets = glob.glob(os.path.join(repo_root, '*/sdd/.*-plugin/plugin.json'))
for target in targets:
    if os.path.abspath(target) == os.path.abspath(source_path):
        continue
    with open(target) as f:
        data = json.load(f)
    data['version'] = version
    if description:
        data['description'] = description
    with open(target, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    print(f'  synced: {os.path.relpath(target, repo_root)}')
" "$SOURCE_PLUGIN" "$CURRENT_HASH" "$REPO_ROOT" "$NO_BUMP"

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

# === Unified per-platform loop ===
echo "Building platform outputs..."
for platform_dir in "$REPO_ROOT"/*/sdd; do
  # Skip the source directory itself
  [ "$platform_dir" = "$SRC" ] && continue
  platform=$(basename "$(dirname "$platform_dir")")
  echo "  platform: $platform"

  # dist/ — copy bundled servers (built into $OUT/dist/ above; skip if this IS $OUT)
  if [ "$platform_dir" != "$OUT" ]; then
    rm -rf "$platform_dir/dist"
    cp -R "$OUT/dist" "$platform_dir/dist"
  fi

  # docs-dashboard — UI source and launch wrapper
  mkdir -p "$platform_dir/docs-dashboard"
  rsync -a --exclude='node_modules' --exclude='dist' \
    "$SRC/docs-dashboard/ui/" "$platform_dir/docs-dashboard/ui/"
  cp "$SRC/docs-dashboard/dashboard.sh" "$platform_dir/docs-dashboard/dashboard.sh"
  chmod +x "$platform_dir/docs-dashboard/dashboard.sh"

  # MCP registration config — format differs by platform
  if [ -d "$platform_dir/.claude-plugin" ]; then
    cat > "$platform_dir/.mcp.json" << 'MCP_EOF'
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
  elif [ -d "$platform_dir/.factory-plugin" ]; then
    cat > "$platform_dir/mcp.json" << 'MCP_EOF'
{
  "mcpServers": {
    "docs": {
      "type": "stdio",
      "command": "bun",
      "args": [
        "run",
        "${DROID_PLUGIN_ROOT}/dist/docs-mcp.js"
      ]
    }
  }
}
MCP_EOF
  fi

  # Skills (verbatim, exclude local-setup)
  rm -rf "$platform_dir/skills/local-setup"
  for skill in "$SRC/.agent/skills"/*/; do
    name=$(basename "$skill")
    [ "$name" = "local-setup" ] && continue
    target="$platform_dir/skills/$name"
    rm -rf "$target"
    cp -R "$skill" "$target"
  done

  # Agents/droids — detect format from .agent-templates/ presence
  templates="$platform_dir/.agent-templates"
  if [ -d "$templates" ]; then
    agents_out="$platform_dir/droids"
    rm -rf "$agents_out"
    mkdir -p "$agents_out"
    for canonical in "$SRC/.agent/agents"/*.md; do
      agent_name=$(basename "$canonical" .md)
      template="$templates/${agent_name}.yaml"
      if [ ! -f "$template" ]; then
        echo "FATAL: missing template $template"
        exit 1
      fi
      body=$(awk '/^---$/{n++; if(n==2){p=1; next}} p' "$canonical")
      if [ -z "$body" ]; then
        echo "FATAL: agent $agent_name has no body after frontmatter stripping"
        exit 1
      fi
      {
        echo "---"
        cat "$template"
        echo "---"
        echo "$body"
      } > "$agents_out/${agent_name}.md"
    done
  else
    agents_out="$platform_dir/agents"
    rm -rf "$agents_out"
    cp -R "$SRC/.agent/agents" "$agents_out"
  fi

  # Guards — copy all from src to platform's hooks/guards/
  if [ -d "$platform_dir/hooks" ]; then
    mkdir -p "$platform_dir/hooks/guards"
    for guard in "$SRC/hooks/guards"/*.sh; do
      cp "$guard" "$platform_dir/hooks/guards/"
    done
  fi

  # context.md
  rm -f "$platform_dir/context.md"
  cp "$SRC/context.md" "$platform_dir/context.md"
done

# 12. Validate critical files exist
echo "Validating build..."
for f in "$OUT/skills/setup/SKILL.md" "$OUT/.mcp.json" "$OUT/.claude-plugin/plugin.json" \
         "$OUT/dist/docs-mcp.js" "$OUT/dist/docs-dashboard.js" \
         "$OUT/docs-dashboard/dashboard.sh" "$OUT/docs-dashboard/ui/package.json" \
         "$OUT/hooks/guards/blocked-commands.sh" "$OUT/hooks/guards/source-guard.sh" \
         "$OUT/hooks/guards/workflow-reminder.sh" \
         "$REPO_ROOT/factory/sdd/dist/docs-mcp.js" \
         "$REPO_ROOT/factory/sdd/dist/docs-dashboard.js" \
         "$REPO_ROOT/factory/sdd/docs-dashboard/dashboard.sh" \
         "$REPO_ROOT/factory/sdd/mcp.json"; do
  [ -f "$f" ] || { echo "FATAL: missing $f"; exit 1; }
done

echo "Build complete: $OUT"
