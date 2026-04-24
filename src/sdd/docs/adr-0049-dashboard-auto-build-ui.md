# ADR: docs-dashboard auto-builds UI on startup

**Status**: implemented
**Status history**:
- 2026-04-24: accepted
- 2026-04-24: implemented — all scope CLEAN

## Overview

When the docs-dashboard server starts and `ui/dist/` does not exist (or is missing `index.html`), it runs `bun run build` in the `ui/` directory automatically before serving. This eliminates the manual build step that currently shows a placeholder page.

## Motivation

Starting the dashboard currently shows "UI not built. Run: cd ui && bun run build" if the SPA hasn't been pre-built. This is a poor developer experience — the server already knows where the UI source lives and has `bun` available. There's no reason to require a manual step.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| When to build | On boot, before starting the HTTP server, if `ui/dist/index.html` is missing | Simple check, runs once, no runtime overhead after boot |
| Build command | `Bun.spawn(["bun", "run", "build"], { cwd: uiDir })` | Same command the developer would run manually; uses the `ui/package.json` build script |
| Failure handling | Log error and continue — serve the placeholder as today | Build failure shouldn't prevent the API from working |

## Impact

Updates `spec-dashboard.md` (Runtime section — boot sequence). Affects `docs-dashboard` component only.

## Scope

- docs-dashboard `server.ts`: add auto-build step in `main()` before starting the HTTP server
- Remove the "UI not built" placeholder message guidance (replace with build-failure fallback)
