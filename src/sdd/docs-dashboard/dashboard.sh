#!/usr/bin/env bash
# bash-3.2 safe — macOS ships bash 3.2 at /bin/bash
set -euo pipefail

# ---- Tool checks ----
require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required. $2" >&2
    exit 1
  fi
}
require bun    "Install: curl -fsSL https://bun.sh/install | bash"
require lsof   "Install: typically already on macOS/Linux; on minimal containers try 'apt-get install lsof' or 'brew install lsof'."
require nc     "Install: typically already on macOS/Linux; on minimal containers try 'apt-get install ncat' or 'brew install netcat'."
require tail   "Part of coreutils — should always be present."
require mktemp "Part of coreutils — should always be present."

# ---- Resolve PLATFORM_ROOT ----
# This script lives at $PLATFORM_ROOT/docs-dashboard/dashboard.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UI_DIR="$PLATFORM_ROOT/docs-dashboard/ui"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

# ---- Parse --port ----
BACKEND_START_PORT=4567
while [ $# -gt 0 ]; do
  case "$1" in
    --port) BACKEND_START_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ---- Per-run log files ----
# Defined before the trap so the trap can always clean them up.
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

# ---- Find free ports ----
find_free() {
  local p=$1
  while lsof -iTCP:"$p" -sTCP:LISTEN &>/dev/null; do p=$((p+1)); done
  echo "$p"
}
BACKEND_PORT=$(find_free "$BACKEND_START_PORT")
VITE_PORT=$(find_free 5173)

# ---- First-run bun install ----
if [ ! -d "$UI_DIR/node_modules" ]; then
  echo "First run — installing UI dependencies (this takes ~30s)…"
  (cd "$UI_DIR" && bun install)
fi

# ---- Backend entrypoint ----
# Bundle in plugin installs (dist/docs-dashboard.js exists); source in local-dev.
if [ -f "$PLATFORM_ROOT/dist/docs-dashboard.js" ]; then
  BACKEND_ENTRY="$PLATFORM_ROOT/dist/docs-dashboard.js"
else
  BACKEND_ENTRY="$PLATFORM_ROOT/docs-dashboard/src/server.ts"
fi

# ---- Launch backend ----
bun run "$BACKEND_ENTRY" --root "$PROJECT_DIR" --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# ---- Launch Vite ----
# --host 127.0.0.1 forces IPv4 binding so nc -z 127.0.0.1 can detect readiness.
# Subshell cd so the parent shell's PWD is preserved. exec avoids an extra layer.
(cd "$UI_DIR" && BACKEND_PORT="$BACKEND_PORT" exec bun x vite --port "$VITE_PORT" --strictPort --host 127.0.0.1) \
  >"$VITE_LOG" 2>&1 &
VITE_PID=$!

# ---- Readiness polling ----
# Poll each port up to 30 s (150 × 200 ms). On timeout, surface the log tail.
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

# ---- Banner ----
cat <<EOF
Dashboard (dev) running at http://127.0.0.1:$VITE_PORT/
Backend at http://127.0.0.1:$BACKEND_PORT/ (proxied; do not open directly)
Ctrl-C or killing this process (PID $$) stops both.
EOF

# ---- Wait for either child to exit (bash-3.2 safe — no wait -n) ----
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$VITE_PID" 2>/dev/null; do
  sleep 0.5
done
# Whichever is still alive gets killed by the EXIT trap.
