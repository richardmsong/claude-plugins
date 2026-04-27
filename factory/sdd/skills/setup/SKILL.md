---
name: setup
description: Interactive setup for the spec-driven-dev workflow. First run includes a tutorial explaining SDD value, pipeline, and available skills. Re-runs refresh config idempotently.
version: 1.0.0
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

**PLATFORM_ROOT** is the absolute path to the `droid/sdd/` directory (the Droid platform package):

1. If `${DROID_PLUGIN_ROOT}` is set (running as an installed Droid plugin): use it directly.
   `PLATFORM_ROOT="${DROID_PLUGIN_ROOT}"`

2. Fallback (development — running within the cloned repo directly): resolve by walking up from this SKILL.md.
   This SKILL.md lives at `<PLATFORM_ROOT>/skills/setup/SKILL.md`. Use `realpath` to follow symlinks to the actual file, then walk up 3 levels.
   ```bash
   REAL=$(realpath "${BASH_SOURCE[0]}")
   PLATFORM_ROOT=$(cd "$(dirname "$REAL")/../../.." && pwd)
   ```

**TARGET** is the project being set up:
```bash
TARGET="${FACTORY_PROJECT_DIR:-.}"
TARGET=$(cd "$TARGET" && pwd)   # resolve to absolute path
```

---

## Algorithm

```
0. Detect first-time vs returning
1. If first-time: print intro block
2. Write spec-driven-config.json (skips if exists)
3. Scaffold AGENTS.md
4. Bootstrap default settings
5. If first-time: read repo context, print contextual example
6. If first-time: print skills overview
7. Verify
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
is being made. Droid then updates the living spec to reflect the decision,
and dev-harness subagents implement the code. A spec-evaluator verifies the
implementation matches the spec. The result: documentation and code stay in sync
because they're produced together, not after the fact.

## How the pipeline works

You describe a change in natural language → Droid invokes /feature-change →
writes an ADR (records the decision) → updates the spec (living documentation) →
dev-harness implements the code → implementation-evaluator verifies code matches spec.

## Why source files are protected

The master Droid session orchestrates — it reads specs, writes ADRs, and
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

## Step 3 — Scaffold AGENTS.md

Inject or update the SDD workflow rules in `${TARGET}/AGENTS.md` using marker-delimited content. The SDD section is wrapped in `<!-- sdd:begin -->` / `<!-- sdd:end -->` HTML comments.

Read the canonical workflow rules from `${PLATFORM_ROOT}/context.md` and wrap in markers.

**Upsert logic:**
- **No AGENTS.md**: Create it with the SDD marker block.
- **AGENTS.md exists, no markers**: Prepend the SDD marker block above existing content (preserving everything the user wrote).
- **AGENTS.md exists, has markers**: Replace everything between `<!-- sdd:begin -->` and `<!-- sdd:end -->` (inclusive) with the latest SDD content. Content outside the markers is preserved.

The SDD content between markers:

```
<!-- sdd:begin -->
<full contents of ${PLATFORM_ROOT}/context.md>
<!-- sdd:end -->
```

After updating, print:
- If created: `"AGENTS.md created with SDD workflow rules — add project-specific content after the sdd:end marker"`
- If updated: `"AGENTS.md updated — SDD workflow rules refreshed, project-specific content preserved"`
- If prepended: `"AGENTS.md updated — SDD workflow rules prepended, existing content preserved after sdd:end marker"`

---

## Step 4 — Bootstrap default settings

Read or create `${TARGET}/.factory/settings.json`. Merge the following `commandAllowlist` entries into the existing array (do not duplicate entries that already exist):

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

These entries allow dev-harness and implementation-evaluator subagents to run core git operations without interruption, which is required for the spec-commit and ADR-promotion steps to complete autonomously.

If `.factory/settings.json` already exists with a `commandAllowlist` array, merge only entries that are not already present. Do not remove existing entries.

Create the `.factory/` directory if it does not exist.

Print: `"Default command allowlist configured in .factory/settings.json"`

---

## Step 5 — Contextual example (first-time only)

Skip this step if `is_first_time` is false.

Read the repo to provide a personalized example of how SDD works in practice.

**Branch 1 — Repo has code** (check for `src/`, `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, existing `docs/`, or any common project markers):

Read a few key files to understand the project's purpose and tech stack. Then print a contextual example:

```
## How you'd use this

For example, if you wanted to [concrete change based on what's in the repo],
you'd just tell Droid: "[natural language request]". Droid would invoke
/feature-change, write an ADR recording why, update the relevant spec, and
implement it through dev-harness.
```

Replace the bracketed parts with specifics from the repo.

**Branch 2 — Empty repo, has Droid history** (no project markers, but `~/.factory/projects/` exists and has `.jsonl` files):

Sample JSONL files to understand what the user works on:

1. List all `.jsonl` files under `~/.factory/projects/`, sorted by mtime descending.
2. Read the **last 50 lines** (`tail -50`) of the **5 most recently modified** files.
3. Scan for user messages containing project-related keywords (language names, framework names, domain terms). Extract a 1-2 sentence summary of what the user has been working on.
4. If sampling yields no clear signal: fall through to Branch 3.
5. Never print or reference the raw JSONL content — only use derived summaries.

Print a contextual example based on what they've been working on across projects.

**Branch 3 — No signal** (empty repo, no history, or no clear signal from JSONL):

Print a generic example or ask what they're planning to build:

```
## How you'd use this

Tell Droid what you want to change: "add user authentication" or "fix the
broken search filter" or "refactor the payment module." Droid handles the rest —
ADR, spec update, implementation, and verification.

What are you planning to build in this project?
```

---

## Step 6 — Skills overview (first-time only)

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

## Step 7 — Verify

Run these checks and report results:

| Check | Command | Pass |
|-------|---------|------|
| config | `test -f ${TARGET}/spec-driven-config.json` | Config present |
| AGENTS.md | `test -f ${TARGET}/AGENTS.md` | Workflow rules present (with markers) |
| settings | `test -f ${TARGET}/.factory/settings.json` | Default settings configured |

Report pass/fail for each. Any failure is non-fatal — the workflow still works for skills; only the failed capability is degraded.

**If `is_first_time` is false** (returning user), print after verification:

```
SDD config refreshed. AGENTS.md updated to latest workflow rules.
```
