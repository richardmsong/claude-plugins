# ADR: Version sync step in build.sh

**Status**: accepted
**Status history**:
- 2026-04-28: draft
- 2026-04-28: accepted

## Overview

Add a version sync step to `src/sdd/build.sh` that reads `version` and `description` from `factory/sdd/.factory-plugin/plugin.json` (the Droid plugin manifest) and writes them to every other platform's plugin.json (`*/sdd/.*-plugin/plugin.json`), making the Droid plugin.json the single source of truth for plugin metadata across all platforms.

## Motivation

Multiple platform plugin manifests (`factory/sdd/.factory-plugin/plugin.json`, `claude/sdd/.claude-plugin/plugin.json`, and future platforms) each have independent `version` and `description` fields. Today they're maintained manually and already diverge (Claude's description is shorter). As the plugin evolves and more platforms are added, keeping metadata in sync by hand is error-prone. Since `build.sh` already produces platform outputs from source, it's the natural place to enforce metadata consistency.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Source of truth | `factory/sdd/.factory-plugin/plugin.json` | The Droid/Factory plugin is authored directly (not built), so its `plugin.json` is the canonical version. All other platform plugin.json files are derived. |
| Sync targets | All `*/sdd/.*-plugin/plugin.json` except the source | Glob pattern discovers current and future platform manifests automatically. |
| Sync mechanism | Python `json` module for read/write | Python3 is already required by the build (guard scripts use it). `jq` is not a declared dependency. Using Python for JSON read/write avoids adding a new tool dependency and handles quoting correctly. |
| Sync scope | `version` and `description` fields | Both fields synced — single source of truth for all metadata. `name` and `author` preserved per-platform. |
| Auto-increment | Bump patch version when source has changed since last build | Compare current git HEAD against a stored hash in the source plugin.json. If different, increment patch (e.g. 1.0.0 → 1.0.1). Major/minor bumps are manual edits to the source plugin.json. |
| Change detection | Git hash comparison | Store `_buildHash` in `factory/sdd/.factory-plugin/plugin.json`. On build, compare `git rev-parse HEAD` against stored hash. If different, bump patch and update hash. If same, no bump (idempotent rebuild). |
| `--no-bump` flag | Skip auto-increment, still sync | For manual major/minor bumps: edit version in source plugin.json, run `build.sh --no-bump` to sync without auto-incrementing. The hash is still updated so the next regular build doesn't double-bump. |
| Build step placement | Early — before any steps that depend on the plugin output | The version should be correct before validation runs. Place after the initial setup but before the validation step. |
| Failure behavior | Fatal — exit 1 if the source plugin.json is missing or has no version field | A missing version is a configuration error. Failing fast prevents publishing a plugin with no version. |

## User Flow

### Normal build (source changed)
1. Developer makes changes to `src/sdd/` and commits
2. Developer runs `src/sdd/build.sh`
3. Build compares `git rev-parse HEAD` against `_buildHash` in source plugin.json
4. Hash differs → bump patch (e.g. 1.0.0 → 1.0.1), update `_buildHash`
5. Build syncs `version` and `description` to all other platform plugin.json files
6. All plugins now have the same version

### Idempotent rebuild (no source change)
1. Developer runs `src/sdd/build.sh` again without committing new changes
2. Hash matches → no version bump, sync still runs (ensures consistency)

### Manual major/minor bump
1. Developer edits `version` in `factory/sdd/.factory-plugin/plugin.json` (e.g. 1.0.5 → 2.0.0)
2. Developer runs `src/sdd/build.sh --no-bump`
3. No auto-increment — version stays at 2.0.0, `_buildHash` is updated
4. All platform plugin.json files get 2.0.0

## Component Changes

### `src/sdd/build.sh`

New step early in the build (after REPO_ROOT is set, before any build steps). Also parse `--no-bump` from CLI args.

**CLI parsing** (at top of script, after `set -euo pipefail`):

```bash
NO_BUMP=false
while [ $# -gt 0 ]; do
  case "$1" in
    --no-bump) NO_BUMP=true; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done
```

**Version sync step**:

```bash
# ---- Version sync ----
SOURCE_PLUGIN="$REPO_ROOT/factory/sdd/.factory-plugin/plugin.json"
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
```

### `factory/sdd/.factory-plugin/plugin.json` (MODIFIED)

Source of truth. Gains a `_buildHash` field to track the last-built git hash:

```json
{
  "name": "spec-driven-dev",
  "version": "1.0.1",
  "description": "Spec-driven development workflow: ADR authoring, design audit, spec compliance, and implementation orchestration",
  "author": { "name": "Richard Song" },
  "_buildHash": "ba60d82..."
}
```

### All other `*/sdd/.*-plugin/plugin.json` files (MODIFIED by build)

`version` and `description` overwritten from source. `name` and `author` preserved.

### `.github/workflows/build-plugin.yml` (MODIFIED)

Add `factory/sdd/.factory-plugin/` to the `git add` line so the updated `_buildHash` and bumped version in the source plugin.json are committed by CI. Without this, every CI run sees a stale hash and re-bumps indefinitely.

```yaml
git add claude/sdd/ droid/sdd/droids/ factory/sdd/.factory-plugin/
```

## Data Model

No changes.

## Error Handling

| Error | Behavior |
|-------|----------|
| `factory/sdd/.factory-plugin/plugin.json` missing | `python3 -c ...` fails, `set -euo pipefail` exits build |
| `version` field missing from JSON | Empty string check, `FATAL` message, exit 1 |
| Target plugin.json missing | `python3 -c ...` fails on open, `set -euo pipefail` exits build |
| `version` is not a valid semver (x.y.z) | Patch bump fails on `int()` conversion — build crashes, which is correct (malformed version should not propagate) |
| Git not available | `CURRENT_HASH` is `"unknown"`, no auto-bump, sync still runs |
| No target plugin.json files found (only source exists) | Glob returns empty, no sync performed, build continues |

## Security

No security implications. Version field is a display string with no auth or access control impact.

## Impact

- Edit: `src/sdd/build.sh` — add version sync step and `--no-bump` flag
- Edit: `factory/sdd/.factory-plugin/plugin.json` — gains `_buildHash` field
- Edit: `.github/workflows/build-plugin.yml` — add `factory/sdd/.factory-plugin/` to `git add` so `_buildHash` persists across CI builds
- Modified by build: `claude/sdd/.claude-plugin/plugin.json` — `version` and `description` synced
- Modified by build: any future `*/sdd/.*-plugin/plugin.json` files

## Scope

### In v1
- Sync `version` and `description` from Droid plugin.json to all platform plugin.json files
- Auto-increment patch on each build when git HEAD differs from stored `_buildHash`
- Glob-based target discovery (`*/sdd/.*-plugin/plugin.json`)

### Deferred
- Semver validation (reject malformed versions before bumping)
- Pre-release suffixes (e.g. `1.0.1-rc.1`)
- Version bumping from git tags or CI

## Open questions

None — all resolved.

## Integration Test Cases

No integration tests — change is build-infrastructure-only with no runtime behavior.
