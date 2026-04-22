# ADR: SSE heartbeat keeps connection alive

**Status**: implemented
**Status history**:
- 2026-04-22: accepted
- 2026-04-22: implemented — all scope CLEAN

## Overview

The dashboard's SSE endpoint (`/events`) drops the connection after sending the initial `hello` event. Bun closes the underlying HTTP response when the `ReadableStream` has no more data to enqueue immediately after `start()`. Adding a periodic heartbeat comment (`:heartbeat\n\n` every 15 seconds) keeps the connection alive so reindex events reach the browser.

## Motivation

The browser shows `ERR_INCOMPLETE_CHUNKED_ENCODING` on the `/events` connection. The EventSource auto-reconnects, gets another `hello`, drops again — in an infinite loop. Reindex events never reach the client because the connection is always dead by the time a file changes. This breaks live updates on the Landing page.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Heartbeat format | SSE comment `:heartbeat\n\n` every 15s | SSE comments (lines starting with `:`) are ignored by the browser's EventSource API. 15s is well within typical proxy/load-balancer timeouts. |
| Implementation | `setInterval` in the `start()` callback, cleared in `cancel()` and on client removal | The interval must be per-connection and cleaned up when the client disconnects. |

## Impact

- `docs-dashboard/src/server.ts` — update `handleSSE()` to add heartbeat interval.

## Scope

**In:** Heartbeat to keep SSE alive.
**Deferred:** Switching to Bun's native WebSocket streaming (more complex, not needed for this use case).
