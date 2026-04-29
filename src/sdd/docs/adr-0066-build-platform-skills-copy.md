# ADR: Copy skills to all platform output directories during build

**Status**: implemented
**Status history**:
- 2026-04-28: accepted
- 2026-04-28: implemented — all scope CLEAN

## Overview

`build.sh` must copy skill directories into every platform's output directory, replacing any symlinks left behind by `local-setup`. Currently only `claude/sdd/skills/` receives real copies; `factory/sdd/skills/` retains symlinks pointing back into `src/`.

## Motivation

`local-setup` creates symlinks under `factory/sdd/skills/` so that in-place edits to source skills are immediately visible during development. `build.sh` already removes stale symlinks from `claude/sdd/` but has no equivalent step for other platform directories. As a result a production build of the factory plugin ships symlinks instead of self-contained copies, which breaks installs on any machine that does not have the source tree at the same relative path.

The analogous gap for `droids/` was closed in step 8b (platform agent templating); skills were overlooked.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to add the step | After step 8b in build.sh | Keeps all per-platform output work together |
| Transformation | Copy verbatim (no frontmatter template) | Skills have no platform-specific frontmatter; unlike agents they are plain markdown instruction files |
| Exclusion | Skip `local-setup` (same rule as claude) | `local-setup` is a dev-only skill and must not ship in any plugin |
| Existing real dirs | Skills absent from `src/.agent/skills/` are never targeted by the copy loop, so platform-specific real dirs (e.g. `setup/`) are never touched. For skills that do exist in src, any prior copy (real dir or symlink) is removed and replaced with a fresh copy. | `setup/` is not a skill in src, so it is naturally preserved; no explicit guard needed. |
| local-setup cleanup | Explicitly remove `local-setup` from platform skill dirs before the copy loop | The `continue` guard skips the copy but does not remove a pre-existing `local-setup` symlink or dir left by `local-setup` skill; must be cleaned explicitly. |

## Impact

- `src/sdd/build.sh` — new step 8c added after step 8b
- No spec files exist yet; this ADR is the first doc in the project

## Scope

Fixes skills copy for all current platforms (factory). `context.md` symlink in `factory/sdd/` is a related but separate issue, deferred.

## Integration Test Cases

| Test case | What it verifies | Components exercised |
|-----------|------------------|----------------------|
| After `build.sh`, `factory/sdd/skills/design-audit` is a real directory, not a symlink | Skills are copied as real files | build.sh |
| After `build.sh`, `factory/sdd/skills/setup` still exists and is a real directory | Existing real dirs are preserved | build.sh |
| After `build.sh`, `factory/sdd/skills/local-setup` does not exist | Dev-only skill excluded | build.sh |
