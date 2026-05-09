## Run: 2026-05-01T00:00:00Z

**ADR**: `docs/adr-0073-resilient-sse-hook.md` (status: accepted)
**Spec**: `docs/mclaude-docs-dashboard/spec-dashboard.md`

### Forward pass: ADR → Spec

| ADR (line) | ADR text | Spec location | Verdict | Direction | Notes |
|------------|----------|---------------|---------|-----------|-------|
| Decision 1 | "Track `lastDataTime` (any data including heartbeat comments). If `Date.now() - lastDataTime > 30_000`, close and reconnect." | SSE Broker → Client-side liveness | PARTIAL | ADR→FIX | ADR Decision 1 says 30s timeout on "any data including heartbeat comments", but Decision 2 establishes heartbeat comments are invisible to `EventSource` JS API, and Decision 3 refines to 45s on `onmessage` events only. Spec correctly follows Decisions 2-3 (45s, onmessage only). The ADR's Decision 1 is internally inconsistent with Decisions 2-3 — its parenthetical "(any data including heartbeat comments)" and 30s threshold are superseded. |
| Decision 2 | "Since `EventSource` swallows SSE comments (`:heartbeat`), use a periodic health-check interval instead: every 20s...Regular `onmessage` events (hello, reindex) are the only observable signal." | SSE Broker → Client-side liveness: "`lastDataTime`: timestamp of the last `onmessage` event (hello or reindex). Updated on every received message." and "health-check interval (every 20s)" | REFLECTED | — | Spec accurately captures that only onmessage events are tracked, and the interval is 20s. |
| Decision 3 | "`setInterval` every 20s inside the `useEffect`. If `readyState !== OPEN` or no `onmessage` event in 45s, close + reconnect. On reconnect, server sends `hello` which triggers full refetch (existing behavior)." | SSE Broker → Client-side liveness: "every 20s, checks whether `Date.now() - lastDataTime > 45_000` (3× the server heartbeat interval). If stale or `readyState !== OPEN`, closes the `EventSource` and creates a new one. The server sends `hello` on reconnect, which triggers a full refetch (existing behavior)." | REFLECTED | — | Exact match on all parameters: 20s interval, 45s threshold, readyState check, reconnect → hello → refetch. |
| Decision 4 | "None needed — server is local (loopback/Tailnet). Immediate reconnect on staleness detection." | SSE Broker → Client-side liveness: "**No backoff**: reconnect is immediate — acceptable for a single-user dev tool hitting localhost/Tailnet (ADR-0073)." | REFLECTED | — | Spec explicitly states no backoff and references ADR-0073. |
| Decision 5 | "The `useEffect` cleanup function calls `es.close()` and `clearInterval(healthCheck)`. This ensures Vite HMR teardown properly disposes the old connection before the new effect creates a fresh one." | SSE Broker → Client-side liveness: "the `useEffect` cleanup function calls `es.close()` and `clearInterval(healthCheck)` to ensure Vite HMR teardown properly disposes the old connection." | REFLECTED | — | Exact match. |
| Impact | "Updates `spec-dashboard.md` SSE Broker section to describe client-side liveness checking." | SSE Broker → new subsection "### Client-side liveness (`useEventSource` hook in `ui/src/App.tsx`)" | REFLECTED | — | Subsection exists under SSE Broker as specified. |
| Scope (deferred) | "Deferred: Switching from `EventSource` to a custom `fetch`-based SSE reader that can observe heartbeat comments directly." | (not in spec) | REFLECTED | — | Correctly absent from spec — deferred items should not appear. |

### Summary

- Reflected: 6
- Gap: 0
- Partial: 1

PARTIAL [ADR→FIX]: Decision 1 says "Track `lastDataTime` (any data including heartbeat comments). If `Date.now() - lastDataTime > 30_000`" but Decisions 2-3 in the same ADR establish that heartbeat comments are invisible and the threshold is 45s. The spec correctly follows the refined Decisions 2-3. The ADR's Decision 1 row has an internal inconsistency — its "including heartbeat comments" parenthetical and 30s threshold are superseded by the later decisions. Recommend updating Decision 1's text to align with the final design (45s, onmessage events only) or adding a note that Decision 3 refines Decision 1.
