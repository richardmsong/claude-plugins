---
name: setup
description: Interactive setup for the spec-driven-dev workflow. First run includes a tutorial explaining SDD value, pipeline, and available skills. Re-runs refresh config idempotently.
version: 5.0.0
user_invocable: true
---

# Setup

Set up the `spec-driven-dev` workflow in a target project. First-time runs include a brief tutorial explaining what SDD is and how to use it. Re-runs refresh all config idempotently.

## Usage

```
/setup
```

---

## Resolving paths

**PLATFORM_ROOT** is the absolute path to the `claude/sdd/` directory (the Claude platform package):

1. If `${CLAUDE_PLUGIN_ROOT}` is set (running as an installed Claude plugin): use it directly.
   `PLATFORM_ROOT="${CLAUDE_PLUGIN_ROOT}"`

2. Fallback (development — running within the cloned repo directly): resolve by walking up from this SKILL.md.
   This SKILL.md lives at `<PLATFORM_ROOT>/skills/setup/SKILL.md`. The target project's `.agent/skills/setup/` may be a symlink to the plugin — use `realpath` to follow symlinks to the actual file, then walk up 3 levels.
   ```bash
   REAL=$(realpath "${BASH_SOURCE[0]}")
   PLATFORM_ROOT=$(cd "$(dirname "$REAL")/../../.." && pwd)
   ```

**TARGET** is the project being set up:
```bash
TARGET="${CLAUDE_PROJECT_DIR:-.}"
TARGET=$(cd "$TARGET" && pwd)   # resolve to absolute path
```

---

## Algorithm

```
0. Detect first-time vs returning
1. If first-time: print intro block
2. Write spec-driven-config.json (skips if exists)
3. Scaffold CLAUDE.md
4. Bootstrap default permissions
5. Symlink sdd-master
6. If first-time: print sdd-master explanation
7. If first-time: read repo context, print contextual example
8. If first-time: print skills overview
9. Verify
```

---

## Step 0 — Detect first-time vs returning

**Before any file writes**, capture whether this is a first-time run:

```bash
is_first_time=false
if [ ! -f "${TARGET}/spec-driven-config.json" ]; then
  is_first_time=true
fi
```

This check happens BEFORE Step 2 writes the config file. If a first run is interrupted after Step 2 but before the tutorial, re-running `/setup` will see the config file and skip the tutorial — but the tutorial is non-essential; the mechanical setup is what matters.

---

## Step 1 — Intro block (first-time only)

Skip this step if `is_first_time` is false.

Print the following (not interactive — just output):

```
## What is spec-driven development?

Every change starts with a decision record (ADR) that captures *why* the change
is being made. Claude then updates the living spec to reflect the decision,
and dev-harness subagents implement the code. A spec-evaluator verifies the
implementation matches the spec. The result: documentation and code stay in sync
because they're produced together, not after the fact.

## How the pipeline works

You describe a change in natural language → Claude invokes /feature-change →
writes an ADR (records the decision) → updates the spec (living documentation) →
dev-harness implements the code → implementation-evaluator verifies code matches spec.

## Why source files are protected

The master Claude session orchestrates — it reads specs, writes ADRs, and
directs subagents. It never edits source files directly. Subagents (dev-harness)
do the implementation. This separation ensures documentation and code don't drift
apart: every code change is traced back to a spec, and every spec change is
traced back to an ADR.
```

---

## Step 2 — Write spec-driven-config.json

If `${TARGET}/spec-driven-config.json` does not exist, create it:

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

- `source_dirs`: prevents the master session from editing source files directly — all code changes go through dev-harness agents. The user can add more patterns (e.g. `**/lib/**`).
- `blocked_commands`: rules checked by the blocked-commands guard hook. Categories: `ban` (always denied), `guard` (denied unless `SDD_DEBUG=1`).

If the file already exists, print: `"spec-driven-config.json already exists — skipping (preserving customizations)"`

---

## Step 3 — Scaffold CLAUDE.md

Inject or update the SDD workflow rules in `${TARGET}/CLAUDE.md` using marker-delimited content. The SDD section is wrapped in `<!-- sdd:begin -->` / `<!-- sdd:end -->` HTML comments.

Read the canonical workflow rules from `${PLATFORM_ROOT}/context.md` and wrap in markers.

**Upsert logic:**
- **No CLAUDE.md**: Create it with the SDD marker block.
- **CLAUDE.md exists, no markers**: Prepend the SDD marker block above existing content (preserving everything the user wrote).
- **CLAUDE.md exists, has markers**: Replace everything between `<!-- sdd:begin -->` and `<!-- sdd:end -->` (inclusive) with the latest SDD content. Content outside the markers is preserved.

The SDD content between markers:

```
<!-- sdd:begin -->
<full contents of ${PLATFORM_ROOT}/context.md>
<!-- sdd:end -->
```

After updating, print:
- If created: `"CLAUDE.md created with SDD workflow rules — add project-specific content after the sdd:end marker"`
- If updated: `"CLAUDE.md updated — SDD workflow rules refreshed, project-specific content preserved"`
- If prepended: `"CLAUDE.md updated — SDD workflow rules prepended, existing content preserved after sdd:end marker"`

---

## Step 4 — Bootstrap default permissions

Read or create `${TARGET}/.claude/settings.json`. Merge the following `allow` entries into the existing array (do not duplicate entries that already exist):

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

These permissions are required for:
- **Bash/Edit/Write/Update**: dev-harness and implementation-evaluator subagents run without supervision and cannot prompt for permission
- **docs MCP tools**: all doc operations should be auto-approved

If `.claude/settings.json` already exists with an `allow` array, merge only entries that are not already present. Do not remove existing entries.

Print: `"Default permissions configured in .claude/settings.json"`

---

## Step 5 — Symlink sdd-master

```bash
mkdir -p ~/.local/bin
ln -sf "${PLATFORM_ROOT}/bin/sdd-master" ~/.local/bin/sdd-master
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
```

---

## Step 6 — sdd-master explanation (first-time only)

Skip this step if `is_first_time` is false.

Print:

```
## sdd-master

`sdd-master` is a CLI shortcut that starts a Claude session with the SDD
workflow pre-loaded. Use it in any project where you've run /setup:

  cd ~/my-project
  sdd-master

Tip: run /setup on every project you want to use SDD with. It's idempotent —
safe to re-run whenever you update the plugin.
```

---

## Step 7 — Contextual example (first-time only)

Skip this step if `is_first_time` is false.

Read the repo to provide a personalized example of how SDD works in practice.

**Branch 1 — Repo has code** (check for `src/`, `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, existing `docs/`, or any common project markers):

Read a few key files to understand the project's purpose and tech stack. Then print a contextual example:

```
## How you'd use this

For example, if you wanted to [concrete change based on what's in the repo],
you'd just tell Claude: "[natural language request]". Claude would invoke
/feature-change, write an ADR recording why, update the relevant spec, and
implement it through dev-harness.
```

Replace the bracketed parts with specifics from the repo.

**Branch 2 — Empty repo, has Claude history** (no project markers, but `~/.claude/projects/` exists and has `.jsonl` files):

Sample JSONL files to understand what the user works on:

1. List all `.jsonl` files under `~/.claude/projects/`, sorted by mtime descending.
2. Read the **last 50 lines** (`tail -50`) of the **5 most recently modified** files.
3. Scan for user messages containing project-related keywords (language names, framework names, domain terms). Extract a 1-2 sentence summary of what the user has been working on.
4. If sampling yields no clear signal: fall through to Branch 3.
5. Never print or reference the raw JSONL content — only use derived summaries.

Print a contextual example based on what they've been working on across projects.

**Branch 3 — No signal** (empty repo, no history, or no clear signal from JSONL):

Print a generic example or ask what they're planning to build:

```
## How you'd use this

Tell Claude what you want to change: "add user authentication" or "fix the
broken search filter" or "refactor the payment module." Claude handles the rest —
ADR, spec update, implementation, and verification.

What are you planning to build in this project?
```

---

## Step 8 — Skills overview (first-time only)

Skip this step if `is_first_time` is false.

Discover skills dynamically: scan `${PLATFORM_ROOT}/skills/*/SKILL.md` and include every skill whose frontmatter contains `user_invocable: true`, excluding `setup` (the user just ran it).

Print the discovered skills:

```
## Available skills

These are invoked automatically based on your request — you don't need to
memorize them. But for reference:

- /feature-change — any change: features, bug fixes, refactors, config
- /plan-feature — new features that need design discussion first
- /dashboard — browse your ADRs, specs, and lineage graph
- /implementation-evaluator — verify code matches specs
- /design-audit — evaluate an ADR for ambiguities and gaps
- /file-bug — report a bug with structured reproduction steps
```

The list above is illustrative. The actual list is discovered from the skill files at runtime — if skills are added or removed, the output reflects the current state.

---

## Step 9 — Verify

Run these checks and report results:

| Check | Command | Pass |
|-------|---------|------|
| config | `test -f ${TARGET}/spec-driven-config.json` | Config present |
| CLAUDE.md | `test -f ${TARGET}/CLAUDE.md` | Workflow rules present (with markers) |
| permissions | `test -f ${TARGET}/.claude/settings.json` | Default permissions configured |
| sdd-master symlink | `test -L ~/.local/bin/sdd-master` | Symlink in place |
| sdd-master on PATH | `which sdd-master` | Callable from CLI |

Report pass/fail for each. Any failure is non-fatal — the workflow still works for skills; only the failed capability is degraded.

**If `is_first_time` is false** (returning user), print after verification:

```
SDD config refreshed. CLAUDE.md updated to latest workflow rules.
```
