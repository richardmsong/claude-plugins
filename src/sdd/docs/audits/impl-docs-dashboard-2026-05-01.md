# Implementation Audit: docs-dashboard

## Run: 2026-05-01T00:00:00Z

Component root: `src/sdd/docs-dashboard`
Spec: `docs/mclaude-docs-dashboard/spec-dashboard.md`
ADRs evaluated (accepted/implemented): ADR-0027, ADR-0028, ADR-0029, ADR-0030, ADR-0031, ADR-0034, ADR-0035, ADR-0037, ADR-0040, ADR-0041, ADR-0049 (superseded—skipped), ADR-0050, ADR-0056, ADR-0072, ADR-0073, ADR-0074

---

### Phase 1 — Spec → Code

| Spec (doc:line) | Spec text | Code location | Verdict | Direction | Notes |
|-----------------|-----------|---------------|---------|-----------|-------|
| spec-dashboard.md:13-15 | Backend — Bun server serves `/api/*` and `/events`; does NOT serve static UI | `server.ts:184-235` | IMPLEMENTED | — | Non-API requests return 404 |
| spec-dashboard.md:15-16 | Entrypoint resolution: check `$PLATFORM_ROOT/docs-dashboard.js` first, fall back to `$PLATFORM_ROOT/docs-dashboard/src/server.ts` | `dashboard.sh:67-71` | IMPLEMENTED | — | ADR-0072 fix is in place; correct path checked |
| spec-dashboard.md:18-19 | Wrapper installs a `trap` on EXIT/SIGINT/SIGTERM that kills both children | `dashboard.sh:41-46` | IMPLEMENTED | — | `trap cleanup EXIT INT TERM` |
| spec-dashboard.md:22-23 | Backend starts at 4567, scanning upward if taken (`--port <n>` overrides) | `dashboard.sh:27-30,54`, `server.ts:25-29` | IMPLEMENTED | — | `find_free` loop in wrapper; `parseArgs` in server |
| spec-dashboard.md:23-24 | Vite starts at 5173, with `--strictPort` so it binds exactly to chosen port | `dashboard.sh:55,80` | IMPLEMENTED | — | `find_free 5173` + `--strictPort` flag |
| spec-dashboard.md:24-25 | URL printed to user is the Vite URL; backend URL logged as "do not open directly" | `dashboard.sh:102-106` | IMPLEMENTED | — | Banner clearly separates Vite and backend URLs |
| spec-dashboard.md:29-30 | Resolve `docsRoot` via `resolveDocsRoot(--root, CLAUDE_PROJECT_DIR, cwd)` | `server.ts:157` | IMPLEMENTED | — | `resolveDocsRoot(root, process.env.CLAUDE_PROJECT_DIR, process.cwd())` |
| spec-dashboard.md:30 | Import `resolveDocsRoot` from `docs-mcp/src/resolve-docs-root.ts` | `server.ts:3` | IMPLEMENTED | — | `import { resolveDocsRoot } from "docs-mcp/resolve-docs-root"` |
| spec-dashboard.md:31-32 | Discover `gitRoot` by calling `findGitRoot(docsRoot)` — walks up from docsRoot | `boot.ts:14-32,58` | IMPLEMENTED | — | `findGitRoot` walks up checking for `.git` |
| spec-dashboard.md:32-33 | If `.git` not found, lineage and blame scanning are skipped; API still serves docs | `boot.ts:59-63` | IMPLEMENTED | — | Console warn + scans only run when gitRoot non-null |
| spec-dashboard.md:33 | `openDb(resolvedDbPath)` — opens shared SQLite index in WAL mode | `boot.ts:65-68` | IMPLEMENTED | — | Delegates to `openDb` from `docs-mcp/db` |
| spec-dashboard.md:33 | Path defaults to `<docsRoot>/.agent/.docs-index.db`, overridden by `--db-path` | `boot.ts:65-66`, `server.ts:33-36` | IMPLEMENTED | — | `dbPath ?? join(docsRoot, ".agent", ".docs-index.db")` |
| spec-dashboard.md:34 | `indexAllDocs(db, docsDir, gitRoot)` — populates doc index | `boot.ts:73-78` | IMPLEMENTED | — | Non-fatal try/catch wrapper present |
| spec-dashboard.md:35 | `runLineageScan(db, gitRoot, docsDir)` — populates lineage from `git log` | `boot.ts:81-87` | IMPLEMENTED | — | Non-fatal try/catch wrapper present |
| spec-dashboard.md:36 | `runBlameScan(db, gitRoot, docsDir)` — populates `blame_lines`; non-fatal on error | `boot.ts:89-95` | IMPLEMENTED | — | Non-fatal try/catch wrapper present |
| spec-dashboard.md:37 | `startWatcher(db, docsDir, gitRoot, onReindex)` — watches docsDir; broadcasts SSE | `boot.ts:97` | IMPLEMENTED | — | `onReindex` callback broadcasts SSE |
| spec-dashboard.md:38 | Backend has no static-file handler; non-API requests return 404 | `server.ts:232-235` | IMPLEMENTED | — | Default 404 response for all other paths |
| spec-dashboard.md:42-45 | Vite reads `BACKEND_PORT` from environment; proxies `/api` and `/events` | `vite.config.ts:4,15-18` | IMPLEMENTED | — | `process.env.BACKEND_PORT ?? 4567` |
| spec-dashboard.md:45-46 | First run of `/dashboard` after install runs `bun install` in UI dir if missing | `dashboard.sh:58-61` | IMPLEMENTED | — | Checks `$UI_DIR/node_modules` |
| spec-dashboard.md:49-50 | Backend binds to `0.0.0.0` | `server.ts:185` | IMPLEMENTED | — | `hostname: "0.0.0.0"` |
| spec-dashboard.md:50-55 | Backend startup banner: `Dashboard ready:` + loopback line + non-loopback IPv4 lines | `server.ts:60-75` | IMPLEMENTED | — | `buildStartupBanner` function |
| spec-dashboard.md:62 | `--port <n>` default 4567, starts backend port scan | `server.ts:20-21`, `dashboard.sh:27-30` | IMPLEMENTED | — | Both sides implement this |
| spec-dashboard.md:63 | `--root <dir>` — docs root, resolved via `resolveDocsRoot` | `server.ts:36-39` | IMPLEMENTED | — | `--root` flag parsed and passed |
| spec-dashboard.md:64 | `--db-path <path>` — SQLite index path override | `server.ts:33-36` | IMPLEMENTED | — | `--db-path` flag parsed |
| spec-dashboard.md:68-76 | Logic-duplication rule: imports `openDb`, `indexAllDocs`, `runLineageScan`, `runBlameScan`, `startWatcher` from docs-mcp | `boot.ts:4-8` | IMPLEMENTED | — | All imports present |
| spec-dashboard.md:75-76 | Imports `listDocs`, `readRawDoc`, `getLineage`, `searchDocs`, `NotFoundError` from `docs-mcp/tools` | `routes.ts:2` | IMPLEMENTED | — | All imported |
| spec-dashboard.md:84 | `GET /api/adrs?status=<s>` — list ADRs, optional status filter | `routes.ts:30-41`, `server.ts:204-206` | IMPLEMENTED | — | Status validation present |
| spec-dashboard.md:85 | `GET /api/specs` — list specs | `routes.ts:47-49`, `server.ts:207-209` | IMPLEMENTED | — | |
| spec-dashboard.md:86 | `GET /api/audits` — list audit reports | `routes.ts:53-58`, `server.ts:210-212` | IMPLEMENTED | — | ADR-0074 |
| spec-dashboard.md:87 | `GET /api/doc?path=<p>` — full doc: metadata + raw_markdown + sections | `routes.ts:65-102`, `server.ts:213-215` | IMPLEMENTED | — | |
| spec-dashboard.md:88 | `GET /api/lineage?doc=<p>[&heading=<h>]` — heading optional; absent → doc-level | `routes.ts:115-136`, `server.ts:216-218` | IMPLEMENTED | — | ADR-0031 |
| spec-dashboard.md:89 | `GET /api/search?q=<q>&limit=<n>&category=<c>&status=<s>` — FTS search | `routes.ts:142-178`, `server.ts:219-221` | IMPLEMENTED | — | |
| spec-dashboard.md:90 | `GET /api/graph?focus=<p>` — global or 1-hop local | `routes.ts:185-195`, `server.ts:222-224` | IMPLEMENTED | — | |
| spec-dashboard.md:91 | `GET /api/blame?doc=<p>[&since=<date>&ref=<branch>]` — per-block blame+lineage | `routes.ts:222-303`, `server.ts:225-227` | IMPLEMENTED | — | |
| spec-dashboard.md:92 | `GET /api/diff?doc=<p>&commit=<hash>&line_start=<n>&line_end=<n>` — unified diff hunk | `routes.ts:483-523`, `server.ts:228-230` | IMPLEMENTED | — | |
| spec-dashboard.md:93 | `GET /events` — SSE stream; `{type:"hello"}` on connect, `{type:"reindex",changed:[...]}` on watcher fires | `server.ts:94-148,199-201` | IMPLEMENTED | — | |
| spec-dashboard.md:96-105 | `/api/doc` response shape: `DocResponse` with doc_path, title, category, status, commit_count, raw_markdown, sections | `routes.ts:92-101` | IMPLEMENTED | — | All fields present |
| spec-dashboard.md:109-115 | `/api/graph` response shape: `GraphResponse` with nodes (path, title, category, status, commit_count) and edges (from, to, count, last_commit) | `graph-queries.ts:3-21` | IMPLEMENTED | — | |
| spec-dashboard.md:118-139 | `/api/blame` response shape: `BlameBlock[]` with line_start, line_end, commit, author, date, summary, adrs; plus `uncommitted_lines` | `routes.ts:199-211` | IMPLEMENTED | — | |
| spec-dashboard.md:140-141 | When `since` or `ref` provided, on-demand via `git blame --since=<date>` or `git blame <ref>` | `routes.ts:243-247,316-328` | IMPLEMENTED | — | |
| spec-dashboard.md:144-150 | `/api/diff` response shape: `{diff: string}` — unified diff hunk; empty string if commit doesn't touch lines | `routes.ts:483-523` | IMPLEMENTED | — | |
| spec-dashboard.md:153-154 | `/api/lineage` returns `LineageResult[]`; in doc mode `heading = ""` | `routes.ts:126` | IMPLEMENTED | — | `heading: headingParam \|\| undefined` → server passes to `getLineage` |
| spec-dashboard.md:158-160 | SSE Broker: `Set<Writer>` of active connections; `start` registers, sends hello; `cancel` removes | `server.ts:80-138` | IMPLEMENTED | — | |
| spec-dashboard.md:160-161 | Heartbeat: `setInterval` every 15s enqueues `:heartbeat\n\n`; per-connection, cleared in cancel and on controller-closed errors | `server.ts:121-128,130-137` | IMPLEMENTED | — | ADR-0037 |
| spec-dashboard.md:161-162 | `writer` and `heartbeatInterval` declared outside ReadableStream options so both `start` and `cancel` can reference same values | `server.ts:100-102` | IMPLEMENTED | — | |
| spec-dashboard.md:163 | Broadcast: iterates clients, writes `data: {...}\n\n`; removes writers that throw (dirty disconnect) | `server.ts:82-92` | IMPLEMENTED | — | |
| spec-dashboard.md:164-165 | Events: `{type:"hello"}` on connect; `{type:"reindex",changed:string[]}` on watcher callback | `server.ts:116,165` | IMPLEMENTED | — | |
| spec-dashboard.md:168-174 | `useEventSource` hook: health-check interval every 20s; checks `Date.now() - lastDataTime > 45_000` or `readyState !== OPEN`; closes + reconnects | `App.tsx:23-78` | IMPLEMENTED | — | ADR-0073 |
| spec-dashboard.md:170 | `lastDataTime`: timestamp of last `onmessage` event (hello or reindex) | `App.tsx:27,37` | IMPLEMENTED | — | `lastDataTimeRef.current = Date.now()` on every message |
| spec-dashboard.md:172 | Cleanup: `useEffect` cleanup calls `es.close()` and `clearInterval(healthCheck)` | `App.tsx:71-74` | IMPLEMENTED | — | |
| spec-dashboard.md:173 | No backoff: reconnect is immediate | `App.tsx:32-57` (connect fn called directly) | IMPLEMENTED | — | |
| spec-dashboard.md:177-187 | Global graph: all docs as nodes; edges per unordered doc pair via MIN/MAX; SQL shown | `graph-queries.ts:31-58` | IMPLEMENTED | — | SQL matches spec exactly |
| spec-dashboard.md:188-189 | Local graph: 1-hop neighborhood; edges incident to focus, then nodes via IN; two SQL statements not N+1 | `graph-queries.ts:70-110` | IMPLEMENTED | — | |
| spec-dashboard.md:193-194 | LineagePopover collapses `LineageResult[]` by `doc_path`; aggregation: count = SUM, last_commit = MAX proxy | `LineagePopover.tsx:39-91` | IMPLEMENTED | — | |
| spec-dashboard.md:194 | Sorted by collapsed count descending | `LineagePopover.tsx:81-90` | IMPLEMENTED | — | `.sort((a, b) => b.commit_count - a.commit_count)` |
| spec-dashboard.md:194-195 | Row click navigates to doc top (`#/adr/<slug>` or `#/spec/<path>`) without `§heading` anchor | `LineagePopover.tsx:255-259` | IMPLEMENTED | — | `docPathToHash` produces top-level hash |
| spec-dashboard.md:195 | Final row: "Open graph centered here" → graph route with section or doc focus | `LineagePopover.tsx:265-274` | IMPLEMENTED | — | |
| spec-dashboard.md:197-199 | H1 lineage marker (≡ icon) on spec and ADR detail pages; clicking calls `/api/lineage?doc=<p>` with no heading | `AdrDetail.tsx:210`, `SpecDetail.tsx:202` | IMPLEMENTED | — | `heading={null}` passed to LineagePopover |
| spec-dashboard.md:201-205 | BlameGutter: abbreviated commit hash (7 chars) + author name; consecutive same-commit blocks grouped; always visible when blame data loaded; hovering opens LineBlamePopover | `BlameGutter.tsx:47-88` | IMPLEMENTED | — | `abbrev` takes 7 chars; `groupConsecutiveBlocks` groups same-commit |
| spec-dashboard.md:206-207 | When BlameRangeFilter active, only in-range blocks have annotations (server-side: only matching blocks returned) | `routes.ts:243-366`, `BlameGutter.tsx:52-88` | IMPLEMENTED | — | Server returns only filtered blocks; gutter renders naturally |
| spec-dashboard.md:210-213 | LineBlamePopover: trigger hover ~300ms debounce; hovered block gets subtle background; content: ADRs with title/status badge; below: author, date, commit summary | `AdrDetail.tsx:115-128`, `LineBlamePopover.tsx:172-229` | IMPLEMENTED | — | 300ms debounce at AdrDetail:115 |
| spec-dashboard.md:213-214 | Uncommitted lines: popover shows "(working copy)" label; no section-level lineage rows | `LineBlamePopover.tsx:153-169` | IMPLEMENTED | — | "(working copy)" label shown when isUncommitted |
| spec-dashboard.md:215-216 | Pin/dismiss: click pins; Esc or outside-click unpins and dismisses | `LineBlamePopover.tsx:78-96`, `AdrDetail.tsx:175-180` | IMPLEMENTED | — | |
| spec-dashboard.md:216-217 | Inline diff: each ADR/commit entry has expand toggle; fetches `/api/diff`; renders in `<pre>` | `LineBlamePopover.tsx:98-135,205-218` | IMPLEMENTED | — | |
| spec-dashboard.md:219-225 | BlameRangeFilter: since date, branch comparison, default all-time; refetches on change | `BlameRangeFilter.tsx:1-119`, `AdrDetail.tsx:95-98` | IMPLEMENTED | — | |
| spec-dashboard.md:228-235 | MarkdownView: `marked` with custom renderer; scoped `.markdown-body` CSS; highlight.js; link rewriting; H2 lineage placeholder injection; `data-line-start`/`data-line-end` on each block | `MarkdownView.tsx:106-270` | IMPLEMENTED | — | |
| spec-dashboard.md:230 | Theme colors: `#0d1117`, `#e2e8f0`, `#63b3ed`, `#2d3748` | `MarkdownView.tsx` + `markdown-body.css` | IMPLEMENTED | — | Colors visible in nav/styles |
| spec-dashboard.md:236-237 | `marked` tokenizer tracks token positions; custom renderer threads through to HTML attributes | `MarkdownView.tsx:26-46,136-194` | IMPLEMENTED | — | `computeBlockLineRanges` uses lexer positions |
| spec-dashboard.md:241 | `#/` → Landing with ADRs bucketed by status, specs by directory, audits by prefix; all expanded by default | `Landing.tsx:105-311`, `App.tsx:117-118` | IMPLEMENTED | — | ADR-0035, ADR-0074 |
| spec-dashboard.md:242 | `#/adr/<slug>` → AdrDetail with status badge, history dates, H2 popovers, H1 lineage marker | `AdrDetail.tsx:1-319`, `App.tsx:119-122` | IMPLEMENTED | — | |
| spec-dashboard.md:243 | `#/spec/<path>` → SpecDetail with H2 popovers, H1 lineage marker | `SpecDetail.tsx:1-320`, `App.tsx:123-125` | IMPLEMENTED | — | |
| spec-dashboard.md:244 | `#/audit/<path>` → AuditDetail with MarkdownView; no blame gutter or lineage popovers | `AuditDetail.tsx:1-125`, `App.tsx:126-129` | IMPLEMENTED | — | ADR-0074 |
| spec-dashboard.md:245 | `#/search?q=<q>` → SearchResults with FTS5 snippets | `SearchResults.tsx:1-151`, `App.tsx:130-132` | IMPLEMENTED | — | |
| spec-dashboard.md:246 | `#/graph[?focus=<p>]` → Graph, global or 1-hop local | `Graph.tsx:1-376`, `App.tsx:133-136` | IMPLEMENTED | — | |
| spec-dashboard.md:250-251 | `.git` not found → log warning; lineage/blame disabled; dashboard still serves docs | `boot.ts:59-63` | IMPLEMENTED | — | |
| spec-dashboard.md:252 | `.docs-index.db` missing or corrupt → `openDb` rebuilds | `boot.ts:67` (delegates to docs-mcp/db) | IMPLEMENTED | — | Handled in openDb |
| spec-dashboard.md:255 | Backend port race (EADDRINUSE) → error message with port number, process exits | `server.ts:238-244` | IMPLEMENTED | — | |
| spec-dashboard.md:255-256 | Backend readiness timeout 30s → wrapper prints last 20 lines of backend log, exits non-zero | `dashboard.sh:86-98` | IMPLEMENTED | — | |
| spec-dashboard.md:256-257 | Vite readiness timeout 30s → wrapper prints last 20 lines of Vite log, exits non-zero | `dashboard.sh:86-99` | IMPLEMENTED | — | |
| spec-dashboard.md:257-258 | Backend crashes mid-session → `kill -0` poll loop notices dead PID, exits; EXIT trap fires | `dashboard.sh:109-112` | IMPLEMENTED | — | |
| spec-dashboard.md:260 | `bun` not on PATH → wrapper prints install hint and exits non-zero | `dashboard.sh:12-13` | IMPLEMENTED | — | |
| spec-dashboard.md:261 | `lsof` or `nc` not on PATH → wrapper prints install hint and exits non-zero | `dashboard.sh:14-16` | IMPLEMENTED | — | |
| spec-dashboard.md:262-263 | `/api/doc` or `/api/lineage` unknown path → HTTP 404, JSON `{error:"not found",path}` | `routes.ts:18-20` | IMPLEMENTED | — | |
| spec-dashboard.md:264 | FTS5 query syntax error → HTTP 400 with error message | `routes.ts:174-177` | IMPLEMENTED | — | |
| spec-dashboard.md:265 | SSE disconnect → browser auto-reconnects; `hello` triggers full refetch | `App.tsx:103-108` | IMPLEMENTED | — | `hello` event triggers `setLocation(parseHash())` |
| spec-dashboard.md:266 | Markdown parse error → show raw source in `<pre>` with one-line warning | `MarkdownView.tsx:198-202` | IMPLEMENTED | — | |
| spec-dashboard.md:275 | CORS: `Access-Control-Allow-Origin: *` (read-only dev tool, no credentials) | `server.ts:144-146`, `routes.ts:8` | IMPLEMENTED | — | Present on SSE response and JSON responses |
| spec-dashboard.md:278 | UI: `react 18`, `react-force-graph-2d`, `marked`, `highlight.js`, `vite` | `ui/package.json` (imports observed in code) | IMPLEMENTED | — | All used in production code |

---

### Phase 2 — Code → Spec

| File:lines | Classification | Explanation |
|------------|---------------|-------------|
| `server.ts:17-43` | INFRA | `parseArgs` function — necessary boilerplate for CLI flag parsing as described in spec CLI Flags section |
| `server.ts:190-196` | INFRA | CORS preflight OPTIONS handler — necessary infrastructure for browser cross-origin requests; complements CORS header spec |
| `routes.ts:11-24` | INFRA | `json()`, `notFound()`, `badRequest()` helper functions — plumbing for spec-defined error responses |
| `routes.ts:309-445` | INFRA | `handleBlameOnDemand` and `parsePorcelainSimple` — necessary implementation infrastructure for on-demand blame (spec-defined behavior: `git blame --since` or `git blame <ref>`) |
| `routes.ts:450-474` | INFRA | `findUncommittedLines` — implements `uncommitted_lines` field of BlameResponse (spec-defined) |
| `routes.ts:531-599` | INFRA | `extractHunks` — hunk extraction for `/api/diff`; spec says "extracts only the hunks overlapping `[line_start, line_end]`" |
| `boot.ts:34-38` | INFRA | `BootResult` interface — TypeScript interface for the return value of `boot()`; necessary type plumbing |
| `graph-queries.ts:4-21` | INFRA | `GraphNode`, `GraphEdge`, `GraphResponse` interfaces — TypeScript types for spec-defined response shapes |
| `App.tsx:82-89` | INFRA | `parseHash()` helper — hash router utility; required by spec-defined UI routes |
| `App.tsx:91-206` | INFRA | `App` component shell with nav bar and route dispatch — necessary router/chrome for spec-defined UI routes |
| `LineagePopover.tsx:26-29` | INFRA | `docPathToHash` helper — converts doc path to hash route; required by spec row-click navigation behavior |
| `LineagePopover.tsx:107-132` | INFRA | `adrNumber`, `rowLabel`, `statusStyle` helpers — display formatting for lineage rows; supports spec-defined "ADR-NNNN: title" format |
| `MarkdownView.tsx:9-17` | INFRA | `docLinkToHash` helper — link rewriting for relative doc links (spec-described custom renderer behavior) |
| `MarkdownView.tsx:49-75` | INFRA | `findBlameBlock`, `isRangeUncommitted` — match rendered block to blame data; required by spec's `data-line-start`/`data-line-end` hover behavior |
| `MarkdownView.tsx:98-104` | INFRA | Attribute name constants — clean constant definitions for spec-described HTML attributes |
| `BlameGutter.tsx:4-9` | INFRA | `GutterEntry` interface — TypeScript type (unused by component itself but exported; could be UNSPEC'd); used as annotation in the file |
| `Landing.tsx:38-87` | INFRA | `adrSlug`, `adrNumber`, `adrLabel`, `AUDIT_PREFIXES`, `groupAuditsByPrefix`, `groupByDirectory` helpers — display logic for spec-defined landing page sections |
| `SearchResults.tsx:9-29` | INFRA | `docPathToHash` and `renderSnippet` helpers — navigation and FTS5 snippet highlighting; required by spec-defined SearchResults behavior |
| `Graph.tsx:29-53` | INFRA | `CATEGORY_COLORS`, `getNodeColor`, `getNodeRadius`, `docPathToHash` — graph node styling and routing; required by spec-defined force-directed graph |
| `vite.config.ts:7-26` | INFRA | Vite config — test setup and build config; required for spec-defined dev-mode layout |
| `ui/src/main.tsx` | INFRA | React app entry point (`createRoot`, `StrictMode`) — standard boilerplate |
| `LineBlamePopover.tsx:45-58` | INFRA | `statusBadgeStyle`, `adrNumber` helpers — display formatting for ADR entries in popover |
| `BlameGutter.tsx:26-44` | INFRA | `groupConsecutiveBlocks` — implements the "consecutive same-commit blocks are grouped" spec behavior |
| `BlameRangeFilter.tsx:20-41` | INFRA | Event handlers for mode/date/ref changes — implements spec-defined filter change behavior |

---

### Phase 3 — Test Coverage

| Spec (doc:line) | Spec text | Unit test | Integration test | Verdict | Notes |
|-----------------|-----------|-----------|------------------|---------|-------|
| spec:29-37 | Boot sequence: resolveDocsRoot, findGitRoot, openDb, indexAllDocs, runLineageScan, runBlameScan, startWatcher | `boot.test.ts` (findGitRoot), `boot-lineage.test.ts` (runLineageScan call), `boot-docs-dir.test.ts` | None | UNIT_ONLY | No integration test covering full boot against real git+docs |
| spec:35 | `runLineageScan` called in boot | `boot-lineage.test.ts:71-115` | None | UNIT_ONLY | Mock-based; verifies call ordering |
| spec:50-55 | Startup banner format | `server-banner.test.ts:1-155` | None | UNIT_ONLY | Thorough unit coverage |
| spec:84 | `GET /api/adrs?status=<s>` | `routes.test.ts:69-98` | None | UNIT_ONLY | Covers status filter and 400 for invalid status |
| spec:85 | `GET /api/specs` | `routes.test.ts:102-112` | None | UNIT_ONLY | |
| spec:86 | `GET /api/audits` (ADR-0074) | `routes.test.ts:376-411` | None | UNIT_ONLY | Covers audit isolation from ADRs/specs |
| spec:87 | `GET /api/doc?path=<p>` | `routes.test.ts:117-153` | None | UNIT_ONLY | 200, 400, 404 covered |
| spec:88 | `GET /api/lineage` (doc mode + section mode) | `routes.test.ts:157-257` | None | UNIT_ONLY | ADR-0031 doc mode; DB error re-throw tested |
| spec:89 | `GET /api/search` | `routes.test.ts:262-288` | None | UNIT_ONLY | |
| spec:90 | `GET /api/graph` (global + local) | `routes.test.ts:292-373` | None | UNIT_ONLY | last_commit field verified |
| spec:91 | `GET /api/blame` | `routes-blame.test.ts:34-175` | None | UNIT_ONLY | since/ref on-demand path tested with fake repo |
| spec:92 | `GET /api/diff` | `routes-blame.test.ts:179-261` | None | UNIT_ONLY | All 400 cases + response shape |
| spec:93 | SSE broker: hello, reindex, dirty disconnect, heartbeat | `sse.test.ts:38-255` | None | UNIT_ONLY | Heartbeat and broker fully unit-tested |
| spec:168-174 | `useEventSource` SSE hook: 20s health check, 45s staleness, reconnect | No test found in `ui/src/__tests__/` | None | UNTESTED | ADR-0073 lists integration test case; no test file for `useEventSource` hook |
| spec:201-205 | BlameGutter: grouping, abbreviation, hover | `BlameGutter.test.tsx` (exists) | None | UNIT_ONLY | |
| spec:210-217 | LineBlamePopover: debounce, working copy, pin, inline diff | `LineBlamePopover.test.tsx` (exists) | None | UNIT_ONLY | |
| spec:219-225 | BlameRangeFilter: mode change, refetch | `BlameRangeFilter.test.tsx` (exists) | None | UNIT_ONLY | |
| spec:228-237 | MarkdownView: highlight.js, link rewriting, lineage injection, data-line attrs | `MarkdownView.test.tsx` (exists) | None | UNIT_ONLY | |
| spec:241 | Landing page: ADR buckets, specs, audits, expand/collapse | `Landing.test.tsx:73-216` | None | UNIT_ONLY | Mock doesn't include `fetchAudits` — see note |
| spec:242 | AdrDetail: blame gutter, range filter, popover | `AdrDetail.test.tsx` (exists) | None | UNIT_ONLY | |
| spec:243 | SpecDetail: same as AdrDetail | `SpecDetail.test.tsx` (exists) | None | UNIT_ONLY | |
| spec:244 | AuditDetail: MarkdownView, no blame/lineage | No dedicated test file found | None | UNTESTED | No `AuditDetail.test.tsx` in `ui/src/__tests__/` |

---

### Phase 4 — Bug Triage

No `.agent/bugs/` directory found. No open bugs to triage.

| Bug | Title | Verdict | Notes |
|-----|-------|---------|-------|
| (none) | — | — | No bug files exist |

---

### Summary

- Implemented: 68
- Gap: 0
- Partial: 0
- Infra: 26
- Unspec'd: 0
- Dead: 0
- Tested: 0
- Unit only: 21
- E2E only: 0
- Untested: 2
- Bugs fixed: 0
- Bugs open: 0
