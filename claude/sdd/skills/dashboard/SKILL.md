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
