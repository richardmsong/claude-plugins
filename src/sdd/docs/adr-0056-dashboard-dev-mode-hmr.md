# ADR: Dashboard dev mode with Vite HMR; no prebuild

**Status**: implemented
**Status history**:
- 2026-04-24: draft
- 2026-04-24: accepted — paired with spec-dashboard.md (Runtime, CLI Flags, Error Handling sections updated)
- 2026-04-27: implemented — all scope CLEAN

## Overview

Collapse the two dashboard execution paths (local-dev and plugin-install) into a single `/dashboard` mode that runs Vite's dev server alongside the Bun backend so UI edits hot-reload in the browser. Ship the UI source tree in both paths — remove the prebuild step from `src/sdd/build.sh`, remove the `claude/sdd/dist/ui/` artifact, and remove the server's "auto-build UI on startup" logic (ADR-0049). A single checked-in wrapper script (`src/sdd/docs-dashboard/dashboard.sh`) launches both processes as children and cleans them up on signal. The local-dev and plugin-install SKILLs are unified into one file.

## Motivation

Three problems compound:

1. **Current `/dashboard` is broken on Apple Silicon.** The SKILL unconditionally runs `bun run build`, which triggers a Vite/Rollup prod bundle. Rollup's CJS `require('@rollup/rollup-darwin-arm64')` cannot resolve the native binary because `ui/package.json` pins `@rollup/rollup-darwin-x64` (Intel) in devDeps. Every rebuild fails; the dashboard serves whatever stale `ui/dist/` happens to be on disk.

2. **No HMR.** Even when the build works, seeing a UI change requires rerunning `/dashboard`, waiting minutes for a prod bundle, and refreshing manually. The dev loop is unusable.

3. **The prebuild carries no value.** The only consumer of the bundled `claude/sdd/dist/ui/` is the Bun backend's static-file handler. That handler can just as well serve a dev-mode Vite proxy, and `vite dev` uses esbuild (not Rollup) so the native-deps bug is moot. Shipping pre-bundled assets saves no install-time cost worth the maintenance surface.

Vite's `server.proxy` in `ui/vite.config.ts` already forwards `/api` and `/events` to the backend — the plumbing for a two-process layout already exists. This ADR wires it up and deletes the prebuild path.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dev mode in the local-dev SKILL | Default. `/dashboard` with no flags launches HMR mode. A future `--preview` or `--prod` flag (not in v1) can opt into prod-parity. | Fewer keystrokes for the 95% case in a dev repo; the currently-broken prod path is exited by default. |
| Plugin-install dashboard | Same as local-dev — runs `vite dev` + backend. No prebuilt UI in `claude/sdd/dist/ui/`. | Per user direction — "the dashboard should never be prebuilt." Removes the rollup native-deps bug as a side effect. |
| SKILL unification | Single SKILL file at `src/sdd/.agent/skills/dashboard/SKILL.md` → copied unchanged into `claude/sdd/skills/dashboard/` by `build.sh` (no rewrite). The old `build.sh` step 7 heredoc rewrite is deleted. | Both routes now run identical commands; two files with a build-time rewrite was only justified by the prebuild split. |
| Process supervision | Single bash wrapper script at `src/sdd/docs-dashboard/dashboard.sh`. Launches backend + Vite as children, installs a `trap` on EXIT/SIGINT/SIGTERM that kills both children, `wait`s on them. Killing the wrapper kills the whole tree. | Per user direction — one script, self-cleaning. Eliminates pidfiles, `--stop` subcommands, and orphaned processes. |
| UI source in plugin install | `src/sdd/build.sh` copies `src/sdd/docs-dashboard/ui/` (minus `node_modules/` and `dist/`) into `claude/sdd/docs-dashboard/ui/`. Wrapper script runs `bun install` the first time it sees no `node_modules/`. | First `/dashboard` after install is slow (~30 s for `bun install`); subsequent runs are fast. Tarball stays compact (no `node_modules/`). |
| Vite backend-URL wiring | `ui/vite.config.ts` reads `process.env.BACKEND_PORT` (default 4567) and uses it for the `/api` and `/events` proxy targets. The wrapper sets `BACKEND_PORT` when launching Vite. | Dynamic because the port scanner may have picked a non-default backend port. |
| Port scanning | Wrapper picks both ports before launching anything: `lsof` scan from 4567 for backend, `lsof` scan from 5173 for Vite. Vite runs with `--strictPort` so it uses exactly the port the wrapper chose and does not try to scan internally. | Only one source of truth for port selection (the wrapper); `--strictPort` prevents a silent drift where Vite ends up on a port the wrapper didn't record. |
| `--port <n>` SKILL arg | `<n>` is the starting port for the backend scan. Vite always scans from 5173 regardless. | Preserves current muscle memory; Vite port rarely matters since it's what the browser opens via the printed URL. |
| Readiness detection | Wrapper polls `nc -z 127.0.0.1 $PORT` for each child in a 200 ms loop with a 30-second timeout per child. Children are launched with stdout+stderr redirected to per-run log files (`$TMPDIR/sdd-dashboard-$$-backend.log` and `…-vite.log`); on readiness timeout, the wrapper prints the last 20 lines of the failing child's log before exiting. Log files are removed by the EXIT trap on clean shutdown. | No reliance on log-line grepping for readiness; captured log file is needed only to surface the root cause when one side fails to start. |
| Shell requirement | Wrapper's shebang is `#!/usr/bin/env bash`. The script uses bash-3.2-safe idioms only — no `wait -n`, no `[[ -v … ]]`, no `${var,,}`. The "wait for either child" pattern is a 0.5 s `kill -0` poll loop so it works on macOS's stock `/bin/bash` (3.2) as well as newer bash. | macOS ships bash 3.2 at `/bin/bash`. Requiring bash 4+ would force a Homebrew dependency for no gain. |
| URL printed to the user | The Vite URL (`http://127.0.0.1:$VITE_PORT/`). The backend URL is logged as "backend at … (do not open directly)". | Vite is the HMR entry point. Opening the backend serves nothing useful in the new model. |
| ADR-0049 (server auto-build on startup) | **Superseded.** Delete the `if (!process.env.CLAUDE_PLUGIN_ROOT) { ... bun run build ... }` block from `server.ts` (lines 188–217). The server is now a pure API + SSE server with no static UI fallback logic. | The wrapper runs `vite dev`; static serving from the Bun backend is not used in dev mode. |
| `handleStatic` in server.ts | **Deleted.** Any non-API request returns 404. | The SPA is served entirely by Vite; the backend has no reason to serve static files. |
| `src/sdd/build.sh` step 5 (UI build) | Deleted. `vite build`, the `ui/dist` copy to `$OUT/dist/ui/`, and the `dist/ui/index.html` validation at the end of `build.sh` all go away. | UI is the only surface the user iterates on and the only one that was ever "prebuilt." |
| `src/sdd/build.sh` UI source copy | New step: copy `src/sdd/docs-dashboard/ui/` (excluding `node_modules/` and `dist/`) → `claude/sdd/docs-dashboard/ui/`. Also copy `src/sdd/docs-dashboard/dashboard.sh` → `claude/sdd/docs-dashboard/dashboard.sh` (chmod +x). | The wrapper needs the UI source tree at a predictable path in the plugin install. |
| `src/sdd/build.sh` docs-dashboard backend bundle | **Kept.** Step 4 still bundles `src/sdd/docs-dashboard/src/server.ts` → `claude/sdd/dist/docs-dashboard.js`. | Backend imports `docs-mcp/resolve-docs-root` as a workspace path; that can only be resolved at bundle time. Backend is also not an iteration surface — users don't HMR the server — so bundling is fine. |
| SKILL `--port` semantics | Starting scan port for backend. Vite always scans from 5173. | Simplest; matches current behavior for the one knob users actually touch. |
| Playwright "open in browser" step | Kept, pointing at the Vite URL. | No change from current. |
| ADR-0051 (plugin build step) | **Partially superseded.** The UI-bundling portion goes away. Docs-mcp bundling remains. This ADR records the supersession. | Scope preserved — docs-mcp is still a single-file bundle. |

## User Flow

1. User runs `/dashboard` (or `/dashboard --port 5000`) from any project with SDD set up.
2. SKILL invokes `${PLATFORM_ROOT}/docs-dashboard/dashboard.sh` in the background, passing `--port <n>` if supplied. `PLATFORM_ROOT` resolves to `src/sdd/` in local-dev and `claude/sdd/` in plugin install — the SKILL walks up from its own location.
3. Wrapper script:
   1. Resolves `PLATFORM_ROOT` from `${BASH_SOURCE[0]}` (directory of the script is `$PLATFORM_ROOT/docs-dashboard/`; one `..` gives `$PLATFORM_ROOT`).
   2. Resolves `PROJECT_DIR` from `$CLAUDE_PROJECT_DIR`, falling back to `$PWD`.
   3. Defines `BACKEND_LOG="$(mktemp -t sdd-dashboard-backend.XXXXXX)"` and `VITE_LOG="$(mktemp -t sdd-dashboard-vite.XXXXXX)"`. Installs an EXIT trap that kills both child PIDs (if set) and deletes both log files.
   4. Scans for a free backend port starting at 4567 (or `--port <n>`). Scans for a free Vite port starting at 5173.
   5. If `${PLATFORM_ROOT}/docs-dashboard/ui/node_modules/` does not exist, runs `bun install` in `${PLATFORM_ROOT}/docs-dashboard/ui/`. Prints a one-line notice.
   6. Resolves backend entrypoint: `${PLATFORM_ROOT}/dist/docs-dashboard.js` if it exists (plugin install — bundled), else `${PLATFORM_ROOT}/docs-dashboard/src/server.ts` (local-dev — source). Launches backend in background with stdout+stderr redirected to `$BACKEND_LOG`: `bun run "$BACKEND_ENTRY" --root "$PROJECT_DIR" --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &`. Captures PID.
   7. Launches Vite in background via a subshell so `cd` does not affect the parent shell, with stdout+stderr redirected to `$VITE_LOG`: `(cd "${PLATFORM_ROOT}/docs-dashboard/ui" && BACKEND_PORT="$BACKEND_PORT" exec bun x vite --port "$VITE_PORT" --strictPort) >"$VITE_LOG" 2>&1 &`. Captures PID.
   8. Polls `nc -z 127.0.0.1 "$BACKEND_PORT"` and `nc -z 127.0.0.1 "$VITE_PORT"` in a 200 ms loop (max 150 iterations = 30 s per child). If either times out, prints the last 20 lines of the failing child's log (`tail -n 20 "$LOG"`) and `exit 1` — the EXIT trap cleans up.
   9. Prints the banner to stdout:
       ```
       Dashboard (dev) running at http://127.0.0.1:<VITE_PORT>/
       Backend at http://127.0.0.1:<BACKEND_PORT>/ (proxied; do not open directly)
       Ctrl-C or killing this process stops both.
       ```
   10. "Wait for either child" loop (bash-3.2 safe): `while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$VITE_PID" 2>/dev/null; do sleep 0.5; done`. When one dies, the trap fires on exit and kills the other.
4. Session-scope cleanup: when the Claude Code session ends, the background wrapper is killed, its trap fires, both children die and log files are removed. When the user wants to stop the dashboard mid-session, they kill the wrapper process (PID shown in the banner or via `ps`).

## Component Changes

### `src/sdd/docs-dashboard/dashboard.sh` (NEW)

Bash wrapper script implementing the User Flow above. Roughly:

```bash
#!/usr/bin/env bash
# bash-3.2 safe — macOS ships bash 3.2 at /bin/bash
set -euo pipefail

# Tool checks with curated install hints.
require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required. $2" >&2
    exit 1
  fi
}
require bun   "Install: curl -fsSL https://bun.sh/install | bash"
require lsof  "Install: typically already on macOS/Linux; on minimal containers try 'apt-get install lsof' or 'brew install lsof'."
require nc    "Install: typically already on macOS/Linux; on minimal containers try 'apt-get install ncat' or 'brew install netcat'."
require tail  "Part of coreutils — should always be present."
require mktemp "Part of coreutils — should always be present."

# Resolve PLATFORM_ROOT: the script lives at $PLATFORM_ROOT/docs-dashboard/dashboard.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UI_DIR="$PLATFORM_ROOT/docs-dashboard/ui"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

# Parse --port
BACKEND_START_PORT=4567
while [ $# -gt 0 ]; do
  case "$1" in
    --port) BACKEND_START_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Per-run log files. Defined before the trap so the trap can always clean them up.
BACKEND_LOG="$(mktemp -t sdd-dashboard-backend)"
VITE_LOG="$(mktemp -t sdd-dashboard-vite)"

BACKEND_PID=""
VITE_PID=""
cleanup() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$VITE_PID"    ] && kill "$VITE_PID"    2>/dev/null || true
  rm -f "$BACKEND_LOG" "$VITE_LOG"
}
trap cleanup EXIT INT TERM

# Find free ports.
find_free() {
  local p=$1
  while lsof -iTCP:"$p" -sTCP:LISTEN &>/dev/null; do p=$((p+1)); done
  echo "$p"
}
BACKEND_PORT=$(find_free "$BACKEND_START_PORT")
VITE_PORT=$(find_free 5173)

# First-run bun install.
if [ ! -d "$UI_DIR/node_modules" ]; then
  echo "First run — installing UI dependencies (this takes ~30s)…"
  (cd "$UI_DIR" && bun install)
fi

# Backend entrypoint: bundle in plugin installs, source in local-dev.
if [ -f "$PLATFORM_ROOT/dist/docs-dashboard.js" ]; then
  BACKEND_ENTRY="$PLATFORM_ROOT/dist/docs-dashboard.js"
else
  BACKEND_ENTRY="$PLATFORM_ROOT/docs-dashboard/src/server.ts"
fi

bun run "$BACKEND_ENTRY" --root "$PROJECT_DIR" --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# Subshell `cd` so the parent shell's PWD is preserved. `exec` avoids a useless extra layer.
(cd "$UI_DIR" && BACKEND_PORT="$BACKEND_PORT" exec bun x vite --port "$VITE_PORT" --strictPort) \
  >"$VITE_LOG" 2>&1 &
VITE_PID=$!

# Readiness — poll each port up to 30 s. On timeout, surface the log tail.
wait_port() {
  local port=$1 log=$2 tries=0
  while ! nc -z 127.0.0.1 "$port" 2>/dev/null; do
    tries=$((tries+1))
    if [ "$tries" -gt 150 ]; then
      echo "Timed out waiting for port $port — last 20 lines of log:" >&2
      tail -n 20 "$log" >&2
      return 1
    fi
    sleep 0.2
  done
}
wait_port "$BACKEND_PORT" "$BACKEND_LOG" || exit 1
wait_port "$VITE_PORT"    "$VITE_LOG"    || exit 1

cat <<EOF
Dashboard (dev) running at http://127.0.0.1:$VITE_PORT/
Backend at http://127.0.0.1:$BACKEND_PORT/ (proxied; do not open directly)
Ctrl-C or killing this process (PID $$) stops both.
EOF

# Wait for either child to exit (bash-3.2 safe — no `wait -n`).
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$VITE_PID" 2>/dev/null; do
  sleep 0.5
done
# Whichever is still alive gets killed by the EXIT trap.
```

### `src/sdd/.agent/skills/dashboard/SKILL.md` (REWRITE)

Collapses to a short file. A SKILL.md is a natural-language instruction sheet that Claude Code reads at invocation time; there is no `${BASH_SOURCE[0]}` inside it. The resolution pattern below is the same one used by the setup skill.

Frontmatter unchanged (`name`, `description`, `version`, `user_invocable: true`). Body:

```markdown
## Usage

/dashboard [--port <n>]

## Prerequisites

- `bun` — `curl -fsSL https://bun.sh/install | bash`
- `lsof`, `nc`, `tail`, `mktemp` — macOS/Linux defaults

## Algorithm

1. Resolve PLATFORM_ROOT:
   - If `${CLAUDE_PLUGIN_ROOT}` is set (running as an installed Claude plugin), use it directly.
   - Otherwise (local-dev) resolve by walking up from this SKILL.md's real path: the
     SKILL lives at `<PLATFORM_ROOT>/.agent/skills/dashboard/SKILL.md`, so `dirname`
     is `.../.agent/skills/dashboard/` — three levels up reaches PLATFORM_ROOT. Use
     `realpath` to follow symlinks first.
     ```bash
     REAL=$(realpath "${BASH_SOURCE[0]}")
     PLATFORM_ROOT=$(cd "$(dirname "$REAL")/../../.." && pwd)
     ```
2. Confirm `${PLATFORM_ROOT}/docs-dashboard/dashboard.sh` exists; abort with an actionable error if not.
3. Launch the wrapper in the background with stdout + stderr redirected to a per-run file so the banner can be observed afterwards. Using a temp file is simpler than a fifo and survives long banner delays:
   ```bash
   WRAPPER_OUT="$(mktemp -t sdd-dashboard-wrapper)"
   bash "${PLATFORM_ROOT}/docs-dashboard/dashboard.sh" ${PORT:+--port "$PORT"} \
     >"$WRAPPER_OUT" 2>&1 &
   WRAPPER_PID=$!
   ```
   Run this via the Bash tool with `run_in_background: true`. The SKILL keeps `$WRAPPER_OUT` (do not delete — the wrapper is still running) and `$WRAPPER_PID` for the subsequent steps.
4. Poll `$WRAPPER_OUT` for up to 180 seconds. The worst-case path is sequential: `bun install` on first run (≤ ~60 s on slow networks) + backend readiness poll (≤ 30 s) + Vite readiness poll (≤ 30 s) + margin. 180 s is the ceiling that covers all three in sequence. See Error Handling below for the failure mode:
   ```bash
   URL=""
   for _ in $(seq 1 900); do
     if grep -q "Dashboard (dev) running at" "$WRAPPER_OUT" 2>/dev/null; then
       URL=$(grep -o "http://127.0.0.1:[0-9]*/" "$WRAPPER_OUT" | head -1)
       break
     fi
     if ! kill -0 "$WRAPPER_PID" 2>/dev/null; then
       echo "Dashboard wrapper exited before banner — full log:" >&2
       cat "$WRAPPER_OUT" >&2
       rm -f "$WRAPPER_OUT"
       exit 1
     fi
     sleep 0.2
   done
   if [ -z "$URL" ]; then
     echo "Timed out waiting for dashboard banner — last log:" >&2
     tail -n 40 "$WRAPPER_OUT" >&2
     kill "$WRAPPER_PID" 2>/dev/null || true
     rm -f "$WRAPPER_OUT"
     exit 1
   fi
   ```
5. Print the URL to the session transcript. If the Playwright MCP is available, call `mcp__playwright__browser_navigate({ url: URL })`. Otherwise let the user open it manually.
6. Leave `$WRAPPER_OUT` on disk for the remainder of the session (it's short-lived — the OS cleans `$TMPDIR` eventually, and the wrapper's own logs are already inside the wrapper process, not in this file).
```

The bash snippet in step 1 is what Claude Code executes — SKILL.md bash code blocks are run by the harness. `${BASH_SOURCE[0]}` in that context resolves to the SKILL.md file itself because Claude Code sources the bash block with `$0` set to the SKILL path; `realpath` follows symlinks (the repo ships with `.agent -> ../src/sdd/.agent` in some layouts). The walk-up count is three because the SKILL.md sits at `.agent/skills/dashboard/SKILL.md` below PLATFORM_ROOT — three path components: `.agent/`, `skills/`, `dashboard/`. (The plugin-install case never hits this branch because `${CLAUDE_PLUGIN_ROOT}` is set there.)

### `src/sdd/docs-dashboard/ui/vite.config.ts` (EDIT)

One change: proxy targets read from `process.env.BACKEND_PORT` with a default of 4567.

```ts
const backend = `http://127.0.0.1:${process.env.BACKEND_PORT ?? 4567}`;
// ...
server: {
  port: 5173,
  proxy: {
    "/api": backend,
    "/events": backend,
  },
},
```

### `src/sdd/docs-dashboard/src/server.ts` (EDIT)

- Delete the auto-build block (lines 188–217, the `if (!process.env.CLAUDE_PLUGIN_ROOT) { ... }` / `else { ... }` in `main()`).
- Delete `handleStatic` (lines 151–177) and its call site (lines 289–291).
- Delete the `UI_DIST` constant (lines 153–155).
- Remove the imports of `existsSync` and `join` if they become unused. Remove the fallback response in `handleStatic`.
- Keep: CLI flag parsing, startup banner, SSE broker, all `/api/*` routes, `/events`, the `boot()` call, graceful shutdown.
- Any non-API request now returns a 404. The UI is served entirely by Vite.

### `src/sdd/build.sh` (EDIT)

- **Keep** step 4 (bundle dashboard server to `dist/docs-dashboard.js`). Justified in the Decisions table — the backend imports `docs-mcp` as a workspace path and must be bundled for plugin installs.
- **Delete** step 5 (build dashboard UI): no more `vite build`, no more `$OUT/dist/ui/` copy.
- **Delete** step 7 (post-process dashboard skill): SKILL is now copied as-is in step 6 since local-dev and plugin SKILLs are identical.
- **New** copy step (after step 6 "Copy skills"): copy `src/sdd/docs-dashboard/ui/` (excluding `node_modules/` and `dist/`) → `$OUT/docs-dashboard/ui/`, copy `src/sdd/docs-dashboard/dashboard.sh` → `$OUT/docs-dashboard/dashboard.sh` (chmod +x). Use `rsync --exclude='node_modules' --exclude='dist'` (or `find … | cpio` if rsync is not assumed).
- Validate-critical-files block (step 12): drop the `dist/ui/index.html` check, add `docs-dashboard/dashboard.sh` and `docs-dashboard/ui/package.json`. Keep the `dist/docs-dashboard.js` check.
- `.mcp.json` rewrite in step 7b stays as-is — unrelated to dashboard.

### `claude/sdd/skills/dashboard/SKILL.md` (AUTO)

Not edited directly — the `build.sh` heredoc that currently overwrites this file is deleted, and the source SKILL is copied unchanged into the same location.

### `claude/sdd/dist/docs-dashboard.js` (KEPT)

Still produced by `build.sh` step 4 (rebuild by running `build.sh` after this lands). No manual git action needed.

### `claude/sdd/dist/ui/` (DELETE)

No longer produced. Delete the entire tracked directory in the same commit that lands the build-script change.

### `src/sdd/docs-dashboard/tests/server-plugin-root.test.ts` (DELETE)

This file tests `resolveUiDist` (the `UI_DIST` ternary), the `handleStatic` fallback, and the auto-build guard. All three are removed by this ADR, so the test file has no subject. Delete the file.

## Data Model

No changes. Backend API, SSE payloads, DB schema all unchanged.

## Error Handling

| Condition | Behavior |
|-----------|----------|
| `bun` not on PATH | Wrapper exits non-zero with message: "bun is required. Install: curl -fsSL https://bun.sh/install \| bash". SKILL surfaces this to the user. |
| `lsof` or `nc` not on PATH | Wrapper exits non-zero with install hint. Both are in base macOS and default Linux. |
| `bun install` fails (first run) | Wrapper exits non-zero. Subsequent runs retry (no success-marker). |
| Backend readiness timeout (30 s) | Wrapper prints last 20 lines of backend log (stderr stream), exits non-zero. Trap kills Vite. |
| Vite readiness timeout (30 s) | Wrapper prints last 20 lines of Vite log, exits non-zero. Trap kills backend. |
| Backend crashes mid-session | The `kill -0` poll loop notices the dead PID, exits. EXIT trap fires: Vite killed, log files removed. Wrapper exits non-zero. User reruns `/dashboard`. |
| Vite crashes mid-session | Same, mirror of above. |
| User edits `server.ts` | Backend does NOT auto-restart. User reruns `/dashboard`. (Deferred: `bun --watch` for backend HMR.) |
| User edits `ui/**` | Vite HMR picks it up automatically. |
| User edits `vite.config.ts` | Vite auto-restarts internally. Backend unaffected. |
| Backend port scan fails (all 4567–4600 taken) | Wrapper eventually finds one by scanning upward — there's no explicit ceiling. Worst case: slow scan. |

## Security

No change. Backend binds `0.0.0.0` (ADR-0028). Vite dev binds loopback by default. Dashboard is intended for local use.

## Impact

This ADR supersedes:
- **ADR-0049** (docs-dashboard auto-builds UI on startup) — fully superseded. The server-side auto-build block is deleted; the wrapper + Vite handle all UI serving.
- **ADR-0051** (plugin build step) — **partially** superseded. The **UI bundling step (step 5)** is removed and `claude/sdd/dist/ui/` is no longer produced. The **backend bundling step (step 4)** and the **docs-mcp bundling step (step 3)** are retained — `dist/docs-dashboard.js` and `dist/docs-mcp.js` are still produced. The overall bundled-plugin packaging strategy (self-contained `claude/sdd/`) remains, with the dashboard-UI carve-out.

Specs touched in this commit:
- `src/sdd/docs/mclaude-docs-dashboard/spec-dashboard.md` — rewrite `## Runtime` to describe the wrapper + Vite + backend layout; delete references to `dist/ui/`, the server's auto-build fallback, and the `handleStatic` behavior; update `## HTTP Endpoints` to drop the `GET /` and `/assets/*` row.

Code and build changes land in a follow-up commit via `/feature-change`:
- `src/sdd/docs-dashboard/dashboard.sh` (new)
- `src/sdd/.agent/skills/dashboard/SKILL.md` (rewrite)
- `src/sdd/docs-dashboard/ui/vite.config.ts` (edit — env-var proxy target)
- `src/sdd/docs-dashboard/src/server.ts` (edit — delete static handler, UI_DIST, auto-build block)
- `src/sdd/docs-dashboard/tests/server-plugin-root.test.ts` (delete)
- `src/sdd/build.sh` (edit — drop UI bundle step, drop SKILL heredoc, add UI-source copy)
- `claude/sdd/dist/ui/` (delete entire directory — build.sh no longer produces it)
- `claude/sdd/skills/dashboard/SKILL.md` (replaced by `build.sh` copy — no manual edit, but tracked content changes)
- `claude/sdd/docs-dashboard/` (new — created by `build.sh`)

## Scope

**In v1:**
- Single wrapper script launches backend + Vite dev with HMR.
- Unified SKILL across local-dev and plugin-install.
- Build script stops producing UI and dashboard-server bundles.
- Server auto-build block removed.
- Plugin install ships UI source; first `/dashboard` after install runs `bun install`.

**Deferred:**
- Backend HMR via `bun --watch` — server edits still require rerunning `/dashboard`.
- A `--prod` or `--preview` flag for prod-parity testing via `vite preview`.
- A `--stop` subcommand — killing the wrapper handles this.
- Any fix to the `@rollup/rollup-darwin-x64` package.json mismatch — no longer reachable since the prod build path is gone.

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `src/sdd/docs-dashboard/dashboard.sh` (new) | ~60 lines | ~25k | Bash, no tests (shell integration). Dev-harness writes + validates manually. |
| `src/sdd/.agent/skills/dashboard/SKILL.md` (rewrite) | ~40 lines (down from ~75) | ~15k | Simpler than current. |
| `src/sdd/docs-dashboard/ui/vite.config.ts` (edit) | ~5 lines changed | ~10k | Single env-var read. |
| `src/sdd/docs-dashboard/src/server.ts` (edit, deletions) | ~50 lines deleted | ~25k | Remove static handler, auto-build block, UI_DIST constant; tighten imports. Existing tests need review — some may reference `handleStatic`. |
| `src/sdd/build.sh` (edit) | ~40 lines changed (30 deleted, 10 added) | ~20k | Delete three steps, add one copy step, update validation. |
| Tracked-artifact churn | N/A | ~5k | `git rm` the `claude/sdd/dist/ui/` tree; verify new `claude/sdd/docs-dashboard/` (UI source + wrapper) is committed after rerunning `build.sh`. |
| `src/sdd/docs/mclaude-docs-dashboard/spec-dashboard.md` (edit) | ~30 lines changed | (master, not harness) | Rewrite Runtime section. |

**Total estimated tokens:** ~100k.
**Estimated wall-clock:** ~1 h on a 2h budget (~50%).
