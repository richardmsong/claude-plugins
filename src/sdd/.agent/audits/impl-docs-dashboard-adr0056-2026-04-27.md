# Implementation Audit: ADR-0056 (Dashboard dev mode with Vite HMR)

**Component**: docs-dashboard  
**ADR**: `src/sdd/docs/adr-0056-dashboard-dev-mode-hmr.md` (Status: accepted)  
**Spec**: `src/sdd/docs/mclaude-docs-dashboard/spec-dashboard.md`  
**Component root**: `src/sdd/docs-dashboard/`  
**Auditor**: implementation-evaluator  

## Run: 2026-04-27T00:00:00Z

---

### Phase 1 — Spec → Code

| Spec (doc:line) | Spec text | Code location | Verdict | Direction | Notes |
|-----------------|-----------|---------------|---------|-----------|-------|
| ADR-0056 Decisions: Dev mode default | `/dashboard` with no flags launches HMR mode; no `--preview`/`--prod` in v1 | `dashboard.sh:1-end`, `SKILL.md:all` | IMPLEMENTED | — | dashboard.sh only starts Vite dev; no preview mode exists |
| ADR-0056 Decisions: Plugin-install dashboard | Same as local-dev — runs `vite dev` + backend; no prebuilt UI in `claude/sdd/dist/ui/` | `build.sh:step6b`, `dashboard.sh:all` | PARTIAL | CODE→FIX | build.sh correctly drops dist/ui/ production step; dashboard.sh correctly launches Vite dev. BUT `claude/sdd/dist/ui/` still exists on disk with stale pre-built assets (not git-removed). See Gap 1. |
| ADR-0056 Decisions: SKILL unification | Single SKILL file at `src/sdd/.agent/skills/dashboard/SKILL.md`, copied unchanged by build.sh | `build.sh:step6`, `src/sdd/.agent/skills/dashboard/SKILL.md:all` | IMPLEMENTED | — | build.sh step 6 loops skills and copies without a heredoc rewrite; single SKILL file exists |
| ADR-0056 Decisions: Process supervision | Single bash wrapper, trap on EXIT/SIGINT/SIGTERM, kills both children, wait loop | `dashboard.sh:47-53` (trap), `dashboard.sh:99-102` (wait loop) | IMPLEMENTED | — | trap cleanup kills BACKEND_PID and VITE_PID, removes log files; wait loop uses kill -0 poll |
| ADR-0056 Decisions: UI source in plugin install | build.sh copies `ui/` (excl. node_modules, dist) + dashboard.sh to `$OUT/docs-dashboard/` | `build.sh:53-59` (step 6b) | PARTIAL | CODE→FIX | build.sh step 6b is correct; but `claude/sdd/docs-dashboard/` does not exist — build.sh has not been re-run and artifacts not committed. See Gap 2. |
| ADR-0056 Decisions: Vite BACKEND_PORT wiring | `ui/vite.config.ts` reads `process.env.BACKEND_PORT` (default 4567) | `ui/vite.config.ts:3` | IMPLEMENTED | — | `const backend = \`http://127.0.0.1:${process.env.BACKEND_PORT ?? 4567}\`` |
| ADR-0056 Decisions: Port scanning | Wrapper picks both ports before launching; `lsof` scan from 4567 for backend, 5173 for Vite; Vite uses `--strictPort` | `dashboard.sh:56-63` (find_free), `dashboard.sh:84-85` (Vite launch) | IMPLEMENTED | — | find_free() uses lsof; Vite launched with --strictPort |
| ADR-0056 Decisions: `--port <n>` SKILL arg | Starting port for backend scan; Vite always scans from 5173 | `SKILL.md:step2`, `dashboard.sh:34-38` | IMPLEMENTED | — | SKILL.md step 2 passes --port; dashboard.sh parses it |
| ADR-0056 Decisions: Readiness detection | Polls `nc -z 127.0.0.1 $PORT`; 200ms loop; 30s timeout; prints last 20 lines on timeout | `dashboard.sh:88-100` (wait_port) | IMPLEMENTED | — | wait_port: 150 tries × 200ms = 30s; tail -n 20 on timeout |
| ADR-0056 Decisions: Shell requirement | `#!/usr/bin/env bash`; bash-3.2-safe (no `wait -n`, `[[ -v ]]`, `${var,,}`); kill -0 poll at 0.5s | `dashboard.sh:1-end` | IMPLEMENTED | — | Shebang correct; no bash4+ idioms; kill -0 poll with sleep 0.5 |
| ADR-0056 Decisions: URL printed | Vite URL to user; backend URL marked "do not open directly" | `dashboard.sh:103-107` (banner) | IMPLEMENTED | — | Matches spec exactly |
| ADR-0056 Decisions: ADR-0049 superseded | Delete `if (!process.env.CLAUDE_PLUGIN_ROOT) { ... bun run build ... }` block from server.ts | `src/server.ts:all` | IMPLEMENTED | — | No auto-build block exists in server.ts |
| ADR-0056 Decisions: `handleStatic` deleted | Delete handleStatic; any non-API request returns 404 | `src/server.ts:all` | IMPLEMENTED | — | No handleStatic; fallback returns 404 JSON |
| ADR-0056 Decisions: `UI_DIST` deleted | Delete UI_DIST constant and related imports | `src/server.ts:all` | IMPLEMENTED | — | No UI_DIST, no existsSync or join imported for static serving |
| ADR-0056 Decisions: build.sh step 5 deleted | Delete `vite build`, `ui/dist` copy, and `dist/ui/index.html` validation | `build.sh:all` | IMPLEMENTED | — | No vite build step; no dist/ui copy; validation doesn't check dist/ui/index.html |
| ADR-0056 Decisions: build.sh step 7 heredoc rewrite deleted | No more SKILL heredoc post-processing | `build.sh:all` | IMPLEMENTED | — | Step 6 copies SKILL as-is; no heredoc rewrite for dashboard SKILL |
| ADR-0056 Decisions: build.sh validation updated | Validation drops dist/ui/index.html; adds docs-dashboard/dashboard.sh and docs-dashboard/ui/package.json; keeps dist/docs-dashboard.js | `build.sh:84-91` | IMPLEMENTED | — | Validation list matches spec exactly |
| ADR-0056 Component Changes: server-plugin-root.test.ts deleted | File tests `resolveUiDist`, `handleStatic`, auto-build guard — all removed; file should be deleted | `src/sdd/docs-dashboard/tests/` (absent) | IMPLEMENTED | — | File not present in tests directory |
| spec-dashboard.md §Runtime: Two-process layout | Backend is pure API + SSE; no static serving; Vite serves UI | `src/server.ts:all`, `dashboard.sh:all` | IMPLEMENTED | — | server.ts has no static handler; dashboard.sh launches both processes |
| spec-dashboard.md §Runtime: Ports | Backend at 4567+, Vite at 5173+, --strictPort | `dashboard.sh:56-63`, `dashboard.sh:84-85` | IMPLEMENTED | — | find_free from 4567/5173; --strictPort passed to vite |
| spec-dashboard.md §Runtime: Backend boot sequence (7 steps) | resolveDocsRoot → findGitRoot → openDb → indexAllDocs → runLineageScan → runBlameScan → startWatcher | `src/server.ts:139-163` (main), `src/boot.ts:all` | IMPLEMENTED | — | All 7 steps present; each non-fatal on error |
| spec-dashboard.md §Runtime: Backend has no static-file handler | Non-/api/*, non-/events returns 404 | `src/server.ts:210-213` (fallback) | IMPLEMENTED | — | `return new Response(JSON.stringify({ error: "not found" }), { status: 404 })` |
| spec-dashboard.md §Runtime: Vite proxies /api and /events via BACKEND_PORT | `process.env.BACKEND_PORT ?? 4567` | `ui/vite.config.ts:3,12-15` | IMPLEMENTED | — | proxy correctly set |
| spec-dashboard.md §Runtime: First run bun install | If ui/node_modules/ missing, run bun install | `dashboard.sh:66-69` | IMPLEMENTED | — | Correct condition and command |
| spec-dashboard.md §Runtime: Backend entrypoint resolution | dist/docs-dashboard.js (plugin) or docs-dashboard/src/server.ts (local-dev) | `dashboard.sh:73-78` | IMPLEMENTED | — | if/else on existence of dist/docs-dashboard.js |
| spec-dashboard.md §Runtime: Backend bind 0.0.0.0 + startup banner | Binds 0.0.0.0; banner with loopback + non-loopback IPv4 | `src/server.ts:48-60` (buildStartupBanner), `src/server.ts:218` (Bun.serve hostname) | IMPLEMENTED | — | hostname: "0.0.0.0"; banner iterates networkInterfaces() |
| spec-dashboard.md §CLI Flags: --port | Starting port for backend scan | `src/server.ts:16-31` (parseArgs), `dashboard.sh:34-38` | IMPLEMENTED | — | Both wrapper and backend parse --port |
| spec-dashboard.md §CLI Flags: --root | Docs root via resolveDocsRoot(--root, CLAUDE_PROJECT_DIR, cwd) | `src/server.ts:139-140` | IMPLEMENTED | — | `resolveDocsRoot(root, process.env.CLAUDE_PROJECT_DIR, process.cwd())` |
| spec-dashboard.md §CLI Flags: --db-path | SQLite index path override | `src/server.ts:16-31`, `src/boot.ts:57-59` | IMPLEMENTED | — | Parsed and passed to boot() → openDb |
| spec-dashboard.md §Logic-Duplication Rule | Import openDb, indexAllDocs, runLineageScan, runBlameScan, startWatcher from docs-mcp | `src/boot.ts:4-8` | IMPLEMENTED | — | All 5 imports from docs-mcp workspace subpaths |
| spec-dashboard.md §HTTP Endpoints: all routes | GET /api/adrs, /api/specs, /api/doc, /api/lineage, /api/search, /api/graph, /api/blame, /api/diff, /events | `src/server.ts:170-210` | IMPLEMENTED | — | All routes present and dispatch to handlers |
| spec-dashboard.md §SSE Broker: connect/cancel/heartbeat/broadcast | ReadableStream with writer+heartbeatInterval in enclosing scope; 15s heartbeat; broadcast iterates clients | `src/server.ts:70-130` (handleSSE) | IMPLEMENTED | — | writer and heartbeatInterval declared outside stream callbacks; 15_000ms interval; dirty disconnect removes writer |
| spec-dashboard.md §Error Handling: Backend port race | Backend exits with "Error: port N is in use..." | `src/server.ts:222-228` (error handler) | IMPLEMENTED | — | EADDRINUSE check in Bun.serve error handler |
| spec-dashboard.md §Security: bind 0.0.0.0, no auth, CORS * | As stated | `src/server.ts:218`, `src/server.ts:230` (OPTIONS), `src/server.ts:126` (SSE headers) | IMPLEMENTED | — | hostname 0.0.0.0; CORS headers in SSE and OPTIONS |
| ADR-0056 User Flow: SKILL resolves PLATFORM_ROOT | CLAUDE_PLUGIN_ROOT if set; else walk up 3 dirs from SKILL.md via realpath | `SKILL.md:step1` | IMPLEMENTED | — | bash block in SKILL.md step 1 matches exactly |
| ADR-0056 User Flow: SKILL polls banner up to 180s | 900 × 0.2s loop; wrapper-exited early detection; timeout fallback | `SKILL.md:step3` | IMPLEMENTED | — | bash block in SKILL.md step 3 matches |
| ADR-0056 User Flow: SKILL opens browser | Playwright MCP if available, else manual | `SKILL.md:step4` | IMPLEMENTED | — | step 4 describes conditional mcp__playwright__browser_navigate |

---

### Phase 2 — Code → Spec

| File:lines | Classification | Explanation |
|------------|---------------|-------------|
| `src/server.ts:1-11` (imports) | INFRA | Standard imports for os, bun:sqlite, boot, routes, resolve-docs-root |
| `src/server.ts:13-41` (parseArgs) | INFRA | CLI argument parsing — serves --port, --root, --db-path spec'd flags |
| `src/server.ts:43-62` (buildStartupBanner export) | INFRA | Exported for testing; spec'd behavior (banner with non-loopback IPs) |
| `src/server.ts:64-67` (clients Set, broadcast) | INFRA | SSE broker data structure, spec'd in §SSE Broker |
| `src/server.ts:140-165` (main: boot + graceful shutdown) | INFRA | Boot sequence + SIGINT/SIGTERM handlers — spec'd |
| `src/server.ts:167-213` (Bun.serve fetch handler) | INFRA | All routes spec'd in §HTTP Endpoints |
| `src/server.ts:214-233` (Bun.serve error handler) | INFRA | EADDRINUSE handling spec'd in §Error Handling |
| `src/server.ts:235-239` (import.meta.main guard) | INFRA | Standard entrypoint guard, allows `server.ts` to be imported in tests |
| `src/boot.ts:1-9` (imports) | INFRA | All 5 docs-mcp imports spec'd in §Logic-Duplication Rule |
| `src/boot.ts:12-36` (findGitRoot) | INFRA | Spec'd in §Runtime boot step 2 |
| `src/boot.ts:38-50` (BootResult interface, boot signature) | INFRA | Spec'd |
| `src/boot.ts:52-100` (boot implementation) | INFRA | All 7 boot steps spec'd |
| `ui/vite.config.ts:1-21` (entire file) | INFRA | Vite config with BACKEND_PORT env var proxy — spec'd in §Runtime |
| `dashboard.sh:1-120` (entire file) | INFRA | All sections spec'd in ADR-0056 Component Changes and User Flow |
| `SKILL.md:all` | INFRA | All steps spec'd in ADR-0056 Component Changes (SKILL.md section) |

---

### Phase 3 — Test Coverage

| Spec (doc:line) | Spec text | Unit test | E2E test | Verdict |
|-----------------|-----------|-----------|----------|---------|
| spec-dashboard.md §Runtime: Backend boot sequence | resolveDocsRoot → openDb → indexAllDocs → runLineageScan → runBlameScan → startWatcher | `tests/boot.test.ts`, `tests/boot-docs-dir.test.ts`, `tests/boot-lineage.test.ts` | None | UNIT_ONLY |
| spec-dashboard.md §Runtime: Backend startup banner | loopback + non-loopback IPv4 banner format | `tests/server-banner.test.ts` | None | UNIT_ONLY |
| spec-dashboard.md §HTTP Endpoints: all routes | GET /api/adrs, /api/specs, /api/doc, /api/lineage, /api/search, /api/graph, /api/blame, /api/diff | `tests/routes.test.ts`, `tests/routes-blame.test.ts` | None | UNIT_ONLY |
| spec-dashboard.md §Graph Queries | Global and local (1-hop) queries | `tests/graph-queries.test.ts` | None | UNIT_ONLY |
| spec-dashboard.md §SSE Broker | connect, heartbeat, broadcast, dirty disconnect | `tests/sse.test.ts` | None | UNIT_ONLY |
| ADR-0056: dashboard.sh wrapper | Tool checks, port scanning, process launch, trap, readiness poll, banner | None (shell script) | None | UNTESTED |
| ADR-0056: SKILL.md | PLATFORM_ROOT resolution, launch, poll, browser open | None (natural language instructions) | None | UNTESTED |
| ui/vite.config.ts BACKEND_PORT proxy | `process.env.BACKEND_PORT ?? 4567` proxy target | None | None | UNTESTED |

---

### Phase 4 — Bug Triage

No `.agent/bugs/` directory found. No open bugs to triage.

| Bug | Title | Verdict | Notes |
|-----|-------|---------|-------|
| — | — | — | No bugs directory exists |

---

### Summary

- Implemented: 33
- Gap: 0
- Partial: 2
- Infra: 15
- Unspec'd: 0
- Dead: 0
- Tested: 0
- Unit only: 5
- E2E only: 0
- Untested: 3
- Bugs fixed: 0
- Bugs open: 0

---

## Findings

### PARTIAL items (CODE→FIX)

**PARTIAL [CODE→FIX]**: "No prebuilt UI in `claude/sdd/dist/ui/`" → `claude/sdd/dist/ui/` still exists on disk with stale pre-built assets (`assets/` and `index.html`). ADR says to delete the entire tracked directory in the same commit that lands the build-script change. build.sh no longer produces it, but git-rm was not performed.  
**Location**: `claude/sdd/dist/ui/` (filesystem)  
**Action**: `git rm -rf claude/sdd/dist/ui/` and commit.

**PARTIAL [CODE→FIX]**: "build.sh copies UI source + dashboard.sh → `$OUT/docs-dashboard/`" → `claude/sdd/docs-dashboard/` does not exist. build.sh step 6b is correctly implemented, but build.sh has not been re-run and the outputs have not been committed.  
**Location**: `claude/sdd/docs-dashboard/` (filesystem — absent)  
**Action**: Run `src/sdd/build.sh` and commit the new `claude/sdd/docs-dashboard/` tree.

### UNTESTED items

- `dashboard.sh`: Shell wrapper has no automated test. Shell integration testing is acknowledged in ADR-0056 ("Bash, no tests (shell integration). Dev-harness writes + validates manually.") — acceptable.
- `SKILL.md`: Natural-language instructions for Claude Code; not unit-testable by conventional means.
- `ui/vite.config.ts` BACKEND_PORT proxy: No test for the env-var proxy wiring. Low risk (single line).

### Overall verdict

**NOT CLEAN** — 2 PARTIAL gaps (both CODE→FIX, both artifact/deployment gaps):
1. `claude/sdd/dist/ui/` must be git-removed.
2. `build.sh` must be re-run and `claude/sdd/docs-dashboard/` committed.

All source code changes (dashboard.sh, SKILL.md, vite.config.ts, server.ts, build.sh) are correctly implemented per ADR-0056 and spec-dashboard.md. The gaps are purely build artifact/deployment hygiene.
