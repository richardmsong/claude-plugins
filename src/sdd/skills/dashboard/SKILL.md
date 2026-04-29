---
name: dashboard
description: Start the docs dashboard server. Builds the UI if needed and launches the Bun server on port 4567.
version: 1.0.0
user_invocable: true
---

# Dashboard

Start the docs dashboard server for browsing ADRs, specs, lineage graphs, and blame data.

## Usage

```
/dashboard [--port <n>]
```

## Prerequisites

- `bun` — `curl -fsSL https://bun.sh/install | bash`
- `lsof`, `nc`, `tail`, `mktemp` — macOS/Linux defaults

## Algorithm

```
1. Resolve PLATFORM_ROOT
2. Launch dashboard.sh wrapper
3. Poll for ready banner
4. Open in browser (if Playwright MCP available)
```

---

## Step 1 — Resolve PLATFORM_ROOT

```bash
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  PLATFORM_ROOT="$CLAUDE_PLUGIN_ROOT"
else
  REAL=$(realpath "${BASH_SOURCE[0]}")
  PLATFORM_ROOT=$(cd "$(dirname "$REAL")/../../.." && pwd)
fi
```

If `${CLAUDE_PLUGIN_ROOT}` is set (running as an installed Claude plugin), use it directly.
Otherwise (local-dev) resolve by walking up from this SKILL.md's real path: the SKILL lives at
`<PLATFORM_ROOT>/.agent/skills/dashboard/SKILL.md`, so three `dirname` levels up reaches PLATFORM_ROOT.
Use `realpath` to follow symlinks first.

---

## Step 2 — Confirm wrapper exists and launch

Confirm `${PLATFORM_ROOT}/docs-dashboard/dashboard.sh` exists; abort with an actionable error if not.

Launch the wrapper in the background with stdout + stderr redirected to a per-run temp file so the
banner can be observed afterwards:

```bash
WRAPPER_OUT="$(mktemp -t sdd-dashboard-wrapper)"
PORT_ARG=""
[ -n "${PORT:-}" ] && PORT_ARG="--port $PORT"
bash "${PLATFORM_ROOT}/docs-dashboard/dashboard.sh" $PORT_ARG \
  >"$WRAPPER_OUT" 2>&1 &
WRAPPER_PID=$!
```

Run this via the Bash tool with `run_in_background: true`. Keep `$WRAPPER_OUT` and `$WRAPPER_PID`
for the subsequent steps.

If the user passed `--port <n>`, set `PORT=<n>` before this block so `$PORT_ARG` is populated.

---

## Step 3 — Poll for ready banner

Poll `$WRAPPER_OUT` for up to 180 seconds (900 × 0.2 s). The worst-case path is sequential:
`bun install` on first run (≤ ~60 s) + backend readiness poll (≤ 30 s) + Vite readiness poll (≤ 30 s) + margin.

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

Print the URL to the session transcript.

---

## Step 4 — Open in browser (optional)

If the Playwright MCP is available, navigate to the Vite URL:

```
mcp__playwright__browser_navigate({ url: "<URL>" })
```

If Playwright is not available, just print the URL and let the user open it manually.

Leave `$WRAPPER_OUT` on disk for the remainder of the session (short-lived; the OS cleans `$TMPDIR`
eventually, and the wrapper's own per-child logs are managed inside the wrapper process).
