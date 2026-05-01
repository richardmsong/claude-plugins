# ADR: Resilient client-side SSE hook with staleness detection

**Status**: implemented
**Status history**:
- 2026-05-01: accepted
- 2026-05-01: implemented — all scope CLEAN

## Overview

Make the dashboard's `useEventSource` React hook resilient to stale connections by adding a heartbeat-based liveness check and explicit reconnection logic. The server already sends `:heartbeat` comments every 15 seconds (ADR-0037); the client now tracks when it last received an `onmessage` event and tears down + reconnects the `EventSource` if no event arrives for 45 seconds. This guarantees the SSE connection never silently dies — particularly after Vite HMR module replacement, which can orphan the `onmessage` closure.

## Motivation

The dashboard's doc-reindex hot reload stops working after the page has been open for a while. Investigation shows:
- The server-side SSE broker, heartbeat, and watcher all function correctly — `curl` to `/events` always receives heartbeats and reindex events.
- The browser's `EventSource` initially connects fine and receives the `hello` event.
- After some time (possibly triggered by Vite HMR replacing the `App` module), the `onmessage` handler stops being called even though the connection appears open (`readyState === 1`).
- A hard page reload fixes it every time.

The `EventSource` spec says the browser auto-reconnects on connection drop, but it does not handle the case where the connection appears open but the handler is orphaned. A client-side liveness check closes this gap.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Staleness detection | Track `lastDataTime` — the timestamp of the last `onmessage` event (hello or reindex). SSE comments (`:heartbeat`) are invisible to the `EventSource` JS API and do not update this timestamp. If `Date.now() - lastDataTime > 45_000`, close and reconnect. | 45s = 3x server heartbeat interval. Allows for transient delays. Simple, no new server changes. |
| Health-check approach | `setInterval` every 20s inside the `useEffect`. If `readyState !== OPEN` or no `onmessage` event in 45s, close + reconnect. On reconnect, server sends `hello` which triggers full refetch (existing behavior). | 20s check interval catches staleness within one cycle after the 45s threshold. Reconnect is cheap (new TCP + hello). |
| Reconnect backoff | None needed — server is local (loopback/Tailnet). Immediate reconnect on staleness detection. | No rate-limiting concern for a single-user dev tool hitting localhost. |
| HMR compatibility | The `useEffect` cleanup function calls `es.close()` and `clearInterval(healthCheck)`. This ensures Vite HMR teardown properly disposes the old connection before the new effect creates a fresh one. | Existing code already does `es?.close()` in cleanup; adding the interval cleanup is the only addition. |

## Impact

Updates `spec-dashboard.md` SSE Broker section to describe client-side liveness checking. Affects `docs-dashboard` UI component only (`ui/src/App.tsx`).

## Scope

**In v1:** Health-check interval in `useEventSource` hook. Close + reconnect on staleness.

**Deferred:** Switching from `EventSource` to a custom `fetch`-based SSE reader that can observe heartbeat comments directly.

## Integration Test Cases

| Test case | What it verifies | Components exercised |
|-----------|------------------|----------------------|
| SSE hook reconnects after 45s of no events | Health-check detects stale connection, closes it, creates new `EventSource`, receives `hello`, triggers refetch | `ui/src/App.tsx` useEventSource hook |
