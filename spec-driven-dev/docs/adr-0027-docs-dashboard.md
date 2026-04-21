# ADR: Docs Dashboard

**Status**: implemented
**Status history**:
- 2026-04-21: draft
- 2026-04-21: accepted — paired with docs/mclaude-docs-mcp/spec-docs-mcp.md (new) and docs/mclaude-docs-dashboard/spec-dashboard.md (new)
- 2026-04-21: implemented — all scope CLEAN (docs-mcp + docs-dashboard spec-evaluator)

## Overview

A local development dashboard that visualizes the mclaude ADR/spec corpus — lists every ADR and spec, shows each ADR's status (`draft | accepted | implemented | superseded | withdrawn`) at a glance, renders spec↔ADR lineage derived from git co-commits, and live-updates as files change on disk. It is a dev-only tool (no auth, loopback-only) that reuses the indexing, parsing, lineage scanning, and file watching already implemented in `mclaude-docs-mcp/src/` — the same functions the MCP server calls, so agents and humans see the same view of the corpus.

## Motivation

The docs corpus has reached 26 ADRs and ~20 specs across root + UI cluster + component subfolders. Agents can navigate it via the docs MCP (FTS5 search, `get_lineage`, `get_section`), but a human operator has no equivalent. Today the only way to see "which ADRs are still drafts," "which spec sections did ADR-0018 co-commit with," or "which parts of the spec are churning fastest" is by grepping or opening files one at a time.

A small dashboard — no auth, no deploy, just `bun run dashboard` — closes that gap. It makes the state of the design corpus legible at a glance, surfaces stuck drafts, and shows lineage visually so the operator can trace the *why* behind a spec section without reading every ADR. The force-directed graph, with node size encoding volatility, also exposes which parts of the spec are mutating quickest through development — a signal the existing MCP tools cannot produce directly.

This is explicitly *not* a production feature. It is not shipped to end-users, not exposed on Tailscale, not deployed to K8s. It runs on the developer's laptop, reads the working-tree filesystem, and exits when the terminal closes.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment | New sibling package `mclaude-docs-dashboard/`. Imports parser/indexer/scanner/watcher/tool modules directly from `mclaude-docs-mcp/src/`. Separate process from the MCP. | MCP stdio lifetime ≠ dev session lifetime; port contention when multiple MCP clients run; mixing agent-stdio and human-HTTP bloats concerns. Sibling package gets shared logic without those downsides. |
| Logic-duplication rule (LOAD-BEARING) | The dashboard **must not reimplement** parsing, indexing, lineage scanning, watching, or the tool-layer queries. It imports `parseMarkdown`, `classifyCategory`, `indexFile`, `indexAllDocs`, `runLineageScan`, `startWatcher`, `openDb`, `searchDocs`, `getSection`, `getLineage`, `listDocs`, `readRawDoc` from `mclaude-docs-mcp/src/`. HTTP handlers are thin wrappers — parameter unmarshalling, call the function, JSON-encode. New functions added to docs-mcp to satisfy the dashboard (e.g. `readRawDoc`, graph query helpers) become part of the shared surface. | Any drift between MCP results and dashboard results is a bug, not a feature. A single source of truth prevents agents and humans seeing different views of the same corpus. |
| Lineage filter semantics (AMENDS ADR-0018) | `getLineage` is changed to return **all** co-committed sections regardless of ADR status. The draft/superseded/withdrawn filter in the current WHERE clause is removed. Every returned row now includes the linked doc's `status` field. The MCP tool description is updated to instruct agents to use `status` for framing (treat `superseded` and `withdrawn` as "tried but not current"; treat `draft` as "in-progress design thinking"). | Historical context is load-bearing for both humans and agents. An agent editing a spec section benefits from seeing "this approach was superseded by adr-NNNN" just as much as it benefits from seeing the current decision. ADR-0018's filter removed that context. This ADR partially supersedes ADR-0018's "Tooling filters" decision line: lineage is no longer status-filtered. `list_docs` and `search_docs` still accept a status filter parameter (unchanged). |
| Extended `ListDoc` shape | `ListDoc` (returned by `listDocs`) gains `status: string \| null`, `commit_count: number`, `last_status_change: string \| null`. The `listDocs` SQL is extended to SELECT these columns. | Required for the landing page (sort by date, bucket by status) and graph (node radius by `commit_count`). Without this extension, the dashboard would have to re-query per doc, which is both N+1 and duplicative. |
| Extended `LineageResult` shape | `LineageResult` gains `status: string \| null` (the linked doc's status). Returned on every row. | Lets the hover popover tag each row with its status (e.g. render superseded rows in a muted tone) and the graph label draft neighbors correctly. |
| Runtime | Bun (same as docs-mcp). Native `Bun.serve` for HTTP + SSE. Vite + React 18 for the SPA (matching mclaude-web's stack). | Bun.serve is built in; Hono not required for 7 routes. Keeps the dependency footprint minimal. |
| Shared index DB | Open the existing `mclaude-docs-mcp/.docs-index.db` in WAL mode. Accept a `--db-path <path>` CLI flag so the plugin version of the dashboard can point elsewhere. | Reuses the exact schema ADR-0015 established. SQLite WAL supports one writer + many readers; two writers serialize but do not corrupt. Because both processes call the same `indexFile` (idempotent upsert keyed on path) with the same inputs, concurrent writes converge to the same state. |
| Repo root detection | Walk up from `process.cwd()` until a `.git` directory is found, or the filesystem root. Error out if no `.git` found. | Matches ADR-0026's plugin discovery model. Keeps the dashboard source free of mclaude-specific path assumptions. |
| Indexing ownership | Dashboard runs its own `indexAllDocs` on boot and `startWatcher` for the lifetime of the process, writing to the shared DB. | The MCP process may not be running when the dashboard is (or vice versa). Running both is safe for the reasons above. |
| Live update channel | Server-Sent Events (SSE) at `GET /events`. On every watcher-triggered reindex, the server emits `{type: "reindex", changed: [<doc_path>, ...]}`. Browser uses the native `EventSource` API. | One-way push fits the use case exactly; no ping/pong, no WS dependency; browser auto-reconnects. |
| Search | Full FTS bar in the top nav. Typing debounces 150 ms, then `GET /api/search?q=…` which calls `searchDocs` directly. Results page at `#/search?q=…` shows FTS5 snippets (with `[…]` highlight markers), doc path, heading, click-to-navigate. | Same query syntax as the MCP (`searchDocs` handles FTS5 AND/OR/NOT/quotes). No client-side re-ranking. |
| Markdown rendering | `marked` + `highlight.js`. A renderer extension rewrites relative links — `docs/adr-*.md` → `#/adr/<slug>`, `docs/**/spec-*.md` → `#/spec/<path>` — so clicks navigate inside the dashboard. | `marked` is ~30 KB, fast, extension API is simple. `highlight.js` covers every language we use. |
| Portability | Designed to ship inside the `spec-driven-dev` plugin (ADR-0026). No mclaude-specific paths, component names, or branding in dashboard source. Repo root via walk-up-to-`.git`; DB path via `--db-path` with a sensible default. | When ADR-0026 lands, the dashboard slots in as a plugin binary with zero rewrite. |
| Landing page | Two-column overview at `#/`. Left: ADRs bucketed by status (Drafts, Accepted, Implemented, Superseded, Withdrawn), each bucket a collapsible list sorted by most recent status-history date, descending. Right: specs grouped by directory (`docs/`, `docs/ui/`, `docs/<component>/`). | Directly answers the primary user ask: "see which ADRs are draft / accepted / implemented at a glance." Specs stay discoverable alongside but don't dominate. |
| Lineage surfaces | Two surfaces: (a) a hover/click popover on each H2 heading of doc detail views, showing ranked related sections; (b) a dedicated force-directed graph page at `#/graph`. Both call the same `getLineage` code path. | Hover = precise, section-scoped ("what informed this paragraph?"). Graph = bird's-eye ("what's the shape of the corpus?"). |
| Popover trigger | A small icon (e.g. `≡`) rendered at the end of each H2 heading line by the markdown renderer extension. Hover OR click opens the popover. Click pins it (lets the cursor leave without dismissing). Esc or outside-click dismisses. | Icon is a visible, focusable affordance. Pure-hover on the heading text misfires during scroll and offers no signal that lineage exists. |
| Popover content | Ranked list of related sections: `<commit_count>× <doc_path> §<heading>`, sorted by `commit_count` desc. Each row clickable → navigate to that section. Final row: "Open graph centered here" — opens `#/graph?focus=<doc_path>&section=<heading>`. | Compact, read-one-glance. The graph entry point is contextual to the section the user is looking at. |
| Graph page | `#/graph` with query-string-driven scope. Two modes: **global** (no `focus` param) and **local** (`focus=<doc_path>`). Nodes = docs; edges = co-commit counts. Clicking a node navigates to its detail page. A sidebar exposes filters. | One component, two data queries. Same rendering code handles both. |
| Global graph defaults | Render every doc as a node. Render only ADR↔spec edges by default. Sidebar toggles: "Show ADR↔ADR edges", "Show spec↔spec edges". | 26+ ADRs × 20+ specs with full edges risks a hairball; ADR↔spec is the most informative subset. Toggles preserve full fidelity on demand. |
| Local graph scope | 1-hop: focus doc centered; every doc with a lineage edge touching it rendered as a neighbor; only edges incident to the focus shown. All edge categories (ADR↔ADR, ADR↔spec, spec↔spec) included — the local view is already small, no hairball risk. | Keeps the neighborhood readable without needing the filter sidebar. |
| Node encoding | **Fill color** = category (ADR one hue, spec another). **Border + fill tone** = status (for ADRs only): solid border + normal fill for `accepted` and `implemented`; dashed border for `draft`; dim/translucent fill for `superseded`; grey fill for `withdrawn`. **Node radius** ∝ √(`documents.commit_count`). | Color channel stays clean for category; status rides border + tone. Radius-by-volatility answers "what's churning?" at a glance. Square-root keeps one-commit vs ten-commit differences visible without dominating. |
| Edge encoding | Line thickness ∝ `commit_count`. On hover, show tooltip with exact commit count and last-commit short hash. | Thickness maps directly to "how tightly coupled are these two docs?" |
| Graph library | `react-force-graph` (specifically `react-force-graph-2d`, canvas-based). ~150 KB. | Built-in zoom/pan/drag/hover; scales past 50 nodes; React-idiomatic. Customizable enough for the node/edge encodings above. |
| Volatility data (NEW DB COLUMN) | Add `documents.commit_count INTEGER NOT NULL DEFAULT 0` to the docs-mcp schema. In `processCommitForLineage`, tally `commit_count` for **every** modified file BEFORE the existing `modifiedFiles.length < 2` early-return. Solo commits still produce no lineage edges (there's nothing to pair), but they do increment the per-doc commit counter. | Volatility = total edits to a doc. The scanner must count solo commits too or the graph's node radius misrepresents docs edited frequently in single-file commits. Early-return moves below the tally loop, preserving existing pairing behavior. |
| Watcher callback (API CHANGE) | Extend `startWatcher` signature: `startWatcher(db, docsDir, repoRoot, onReindex?: (changed: string[]) => void): () => void`. Two paths feed the callback: (a) single-file events — the watcher calls `indexFile` and includes the path in the sweep if `indexFile` returned `true`; (b) full-rescan events — `indexAllDocs` signature changes from `(db, docsDir, repoRoot): number` to `(db, docsDir, repoRoot): string[]`, returning the doc_paths that were actually reindexed (same truthy-return condition, now collected instead of counted). The watcher concatenates both paths' results, dedupes, and invokes `onReindex(changed)` once per sweep (or omits the call if the list is empty). The existing MCP entrypoint (`mclaude-docs-mcp/src/index.ts`) does not pass a callback and ignores `indexAllDocs`'s new return value — zero behavior change there. The dashboard passes a callback that feeds the SSE broker. | SSE needs to know *which* docs changed to decide what to invalidate in the UI. `indexFile`'s existing return value already carries that signal; extending `indexAllDocs` to return the same list keeps full-rescan and single-file paths symmetric. Backwards compatible: new callback param is optional, and `indexAllDocs`'s old `number` callers can read `result.length`. |
| Status-date column (NEW DB COLUMN) | Add `documents.last_status_change TEXT` (ISO date, e.g. `"2026-04-19"`) to the schema. Populated by the parser: scan the `Status history:` list and take the date of the most recent line. Null for non-ADR docs. | Landing page sorts ADR buckets by "most recent status change, desc" — needs a sort key that is not `mtime` (which mutates on every typo fix). Extracting the date during parse keeps the logic single-sourced. Same schema-version bump as `commit_count` covers this. |
| Null-status fallback | Parser returns `null` if no `**Status**:` line present. Landing page groups such ADRs under an "Unspecified" bucket at the bottom. The current corpus has zero nulls post-ADR-0018, but the fallback makes the UI robust to future user error. | Defensive default; zero extra cost. |
| Workspace model | Convert the repo root to a Bun workspace (`workspaces: ["mclaude-docs-mcp", "mclaude-docs-dashboard"]` in a new root `package.json`). Both packages declare each other as workspace deps. | Lets `mclaude-docs-dashboard` import `from "mclaude-docs-mcp/src/parser.js"` without path juggling. Bun handles workspace resolution natively. |
| Port | Default `4567`. Overridable via `--port <n>`. If in use, fail fast with a clear error. | Arbitrary but memorable; no conflict with Vite (5173) or common dev servers. |
| Auth | None — binds to `127.0.0.1` only. | Dev-only. Loopback is the sandbox. Docs are already on the filesystem. |
| Editing | Read-only in v1. | Dashboard is a viewer. Status flips and section edits stay in the CLI + skills. |

## User Flow

1. Developer runs `bun run dashboard` from the repo root. Console prints `Dashboard ready: http://127.0.0.1:4567/`.
2. Browser opens to the landing page — ADRs grouped by status on the left, specs grouped by directory on the right. Drafts are expanded by default; other buckets collapsed with counts.
3. Developer clicks `adr-0015-docs-mcp` → detail page renders the ADR as formatted markdown. The status badge (`implemented`, teal) appears next to the title along with the status history dates. Each H2 heading has a small `≡` icon.
4. Developer hovers `≡` next to "Data Model" → popover appears listing:
   ```
   3× docs/spec-state-schema.md §Session KV
   2× docs/mclaude-docs-mcp/spec-docs-mcp.md §Schema
   Open graph centered here
   ```
5. Developer clicks the spec-state-schema row → navigates to `#/spec/docs/spec-state-schema.md` scrolled to "Session KV". Internal links inside the rendered markdown also work — clicking `[ADR-0024](docs/adr-0024-typed-slugs.md)` takes them to `#/adr/0024-typed-slugs`.
6. Developer clicks "Graph" in the top nav → global force-directed graph renders. A dense hub emerges around `spec-state-schema.md` (large node, many edges). A faded node with dashed border shows `adr-0027-docs-dashboard` is still draft.
7. Developer clicks a node → detail page for that doc. From its popover they can re-enter the graph centered on this doc.
8. Developer edits a file in their editor. Within ~1 s the browser receives an SSE reindex event; the affected views refetch and re-render without manual refresh.

## Component Changes

### New: `mclaude-docs-dashboard/`

```
mclaude-docs-dashboard/
├── package.json          # depends on mclaude-docs-mcp (workspace), marked, highlight.js
├── tsconfig.json
├── src/
│   ├── server.ts         # Bun.serve entry, CLI flag parsing, SSE broker
│   ├── routes.ts         # HTTP handlers (thin wrappers over docs-mcp functions)
│   ├── boot.ts           # repoRoot walk-up, DB open, initial index, watcher start
│   └── graph-queries.ts  # SQL for /api/graph (nodes + edges) — uses same DB
└── ui/
    ├── index.html
    ├── vite.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx       # hash router + SSE subscription
    │   ├── routes/
    │   │   ├── Landing.tsx       # status-grouped ADRs + spec index
    │   │   ├── AdrDetail.tsx
    │   │   ├── SpecDetail.tsx
    │   │   ├── SearchResults.tsx
    │   │   └── Graph.tsx         # react-force-graph, global + local modes
    │   ├── components/
    │   │   ├── MarkdownView.tsx  # marked + highlight.js + link rewriting
    │   │   ├── LineagePopover.tsx
    │   │   ├── StatusBadge.tsx
    │   │   └── SearchBar.tsx
    │   └── api.ts                # typed fetch wrappers for /api/*
    └── ...
```

### HTTP endpoints

| Method | Path | Purpose | Underlying function |
|--------|------|---------|---------------------|
| GET | `/api/adrs?status=<s>` | List ADRs, optional status filter | `listDocs({category: "adr", status: s})` |
| GET | `/api/specs` | List specs with per-doc section count | `listDocs({category: "spec"})` |
| GET | `/api/doc?path=<p>` | Full doc: metadata + rendered-source + sections | `listDocs` + `getSection` per section |
| GET | `/api/lineage?doc=<p>&heading=<h>` | Ranked related sections | `getLineage` |
| GET | `/api/search?q=<q>&limit=<n>&category=<c>&status=<s>` | FTS search with snippets | `searchDocs` |
| GET | `/api/graph?focus=<p>` | Graph nodes + edges. Omit `focus` for global; provide for 1-hop local. | `graph-queries.ts` (direct SQL; returns `{nodes: [{path, category, status, commit_count}], edges: [{from, to, count}]}`) |
| GET | `/events` | SSE; emits `{type: "reindex", changed: [...]}` on watcher fires | Bun.serve streaming body |
| GET | `/` and `/assets/*` | Static SPA bundle from `ui/dist/` | Bun static file serving |

### `mclaude-docs-mcp/`

- **Schema change**: add `commit_count INTEGER NOT NULL DEFAULT 0` to `documents`. Bump `SCHEMA_VERSION` from `"2"` to `"3"`; the existing corrupt/mismatch handler in `db.ts` triggers a full rebuild on first boot. No migration code required.
- **Lineage scanner change**: inside `processCommitForLineage`, after computing `modifiedFiles`, increment `commit_count` on each modified `documents` row (`UPDATE documents SET commit_count = commit_count + 1 WHERE path = ?`). Include this in the incremental scan too — the metadata `last_lineage_commit` already gates "commits already counted."
- **No MCP tool change**: the four tools (`search_docs`, `get_section`, `get_lineage`, `list_docs`) are unaffected. Agents continue working unchanged.
- **New shared helper `readRawDoc`**: docs-mcp gains `readRawDoc(repoRoot: string, docPath: string): string` in `mclaude-docs-mcp/src/tools.ts`. Implementation: join `repoRoot + docPath`, verify the resolved path remains inside `repoRoot` (prevent `..` escape), verify the resolved path is inside `repoRoot/docs/`, `fs.readFileSync(path, "utf8")`, throw a `NotFoundError` if the file is missing. The dashboard's `/api/doc` handler calls it to populate `raw_markdown`. It is also available to the MCP layer but no MCP tool calls it today — adding a future `get_raw_doc` tool is out of scope. The helper is on the shared list in the Logic-duplication decision, so the dashboard must not reimplement file reads.
- **Package boundary**: docs-mcp exports the functions named in the Logic-duplication decision. The dashboard imports them as a workspace dependency.

### Workspace setup

The repo root has no `package.json` today (it uses `go.work` for Go modules). This ADR introduces one at the root purely to declare a Bun workspace:

```json
{
  "name": "mclaude-workspace",
  "private": true,
  "workspaces": ["mclaude-docs-mcp", "mclaude-docs-dashboard"]
}
```

This file is additive — it does not change how the Go workspace resolves, and existing npm/bun commands inside each package continue to work as before.

`mclaude-docs-mcp/package.json` gains an `exports` map exposing the source modules the dashboard imports. TypeScript source files are published directly (both packages run under Bun, which loads `.ts` without a compile step):

```json
{
  "exports": {
    "./parser": "./src/parser.ts",
    "./db": "./src/db.ts",
    "./content-indexer": "./src/content-indexer.ts",
    "./lineage-scanner": "./src/lineage-scanner.ts",
    "./watcher": "./src/watcher.ts",
    "./tools": "./src/tools.ts"
  }
}
```

No barrel file. Each module is a separate subpath so imports are explicit (`import { parseMarkdown } from "mclaude-docs-mcp/parser"`). `tools.ts` exports `searchDocs`, `getSection`, `getLineage`, `listDocs`, `readRawDoc` (added above). The `.ts` file extension in the `exports` map is deliberate — Bun resolves it natively; Node users would need a build step, which is out of scope since both packages are Bun-only.

### `docs/` layout

- **New**: `docs/mclaude-docs-dashboard/spec-dashboard.md` — component-local spec for the dashboard (per ADR-0025).
- **New**: `docs/mclaude-docs-mcp/spec-docs-mcp.md` — component-local spec for docs-mcp (it has none today; creating it is mandated by ADR-0025 for any component that receives a change). Must describe the current v1 behavior (per ADR-0015 and ADR-0018) plus the new `commit_count` column.

## Data Model

### Schema change (docs-mcp)

The new shape of the `documents` table:

```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  category TEXT,
  title TEXT,
  status TEXT,
  commit_count INTEGER NOT NULL DEFAULT 0,          -- NEW
  last_status_change TEXT,                           -- NEW, ISO date e.g. "2026-04-19"
  mtime REAL NOT NULL
);
```

The change is applied via schema-version bump (`"2"` → `"3"`), which triggers a full DB rebuild per ADR-0015. No hand-written migration. But the bump alone is not sufficient — **four files must be edited together in the same commit** or the rebuild produces a schema that doesn't match the new columns, or the watcher cannot surface which paths were reindexed:

| File | Edit |
|------|------|
| `mclaude-docs-mcp/src/db.ts` | Update `SCHEMA_SQL` (the constant used by the rebuild path) to include `commit_count INTEGER NOT NULL DEFAULT 0` and `last_status_change TEXT`. Bump `SCHEMA_VERSION` from `"2"` to `"3"`. |
| `mclaude-docs-mcp/src/parser.ts` | Add `lastStatusChange: string \| null` to `ParsedDoc` and populate it via the history-list scan (above). |
| `mclaude-docs-mcp/src/content-indexer.ts` | (a) Extend the `indexFile` upsert: add `last_status_change` to both the `INSERT` column list and the `DO UPDATE SET` clause. `commit_count` is **not** touched by `indexFile` — it is owned by the lineage scanner and defaults to 0 for new rows. The existing `mtime`-skip optimization stays unchanged. (b) Change `indexAllDocs` return type from `number` to `string[]`: collect the doc_path of each file where `indexFile` returned `true`, return the array. Callers that only want the count can read `.length`. |
| `mclaude-docs-mcp/src/watcher.ts` | Add optional 4th parameter `onReindex?: (changed: string[]) => void` to `startWatcher`. After each debounced sweep, dedupe the list of paths collected from single-file `indexFile` results and full-rescan `indexAllDocs` results, and invoke `onReindex(changed)` if non-empty. |

The lineage scanner change (next section) is the fifth file — but since it writes only `commit_count`, it is independent of the schema-version bump's column layout and can land in the same commit without further coordination.

### Parser addition

`parseMarkdown` (in `mclaude-docs-mcp/src/parser.ts`) extends `ParsedDoc`:

```ts
interface ParsedDoc {
  title: string | null;
  status: string | null;
  lastStatusChange: string | null;  // NEW
  sections: ParsedSection[];
}
```

After the `**Status**:` line, the parser matches the bolded history marker and scans the following bullet list:

```ts
// Matches the marker line exactly, allowing the real-corpus format.
const STATUS_HISTORY_MARKER_RE = /^\*\*Status history\*\*:\s*$/i;

// Each history bullet: "- YYYY-MM-DD: <rest>"
const HISTORY_LINE_RE = /^\s*-\s*(\d{4}-\d{2}-\d{2}):/;
```

Parser walks from the line after the marker; for each consecutive line that matches `HISTORY_LINE_RE`, it collects the captured date. The most recent date (max via string compare — ISO dates sort lexically) becomes `lastStatusChange`. Null if marker absent, list empty, or no matched dates. Every ADR in the current corpus uses the bold form (`**Status history**:`), so the marker regex must require the bold asterisks — a plain-text `Status history:` variant is not supported. The parser stops the history sweep on the first non-matching line (typically blank or the `## Overview` heading).

### New API payload shapes

```ts
// /api/doc response
interface DocResponse {
  doc_path: string;
  title: string | null;
  category: "adr" | "spec" | null;
  status: "draft" | "accepted" | "implemented" | "superseded" | "withdrawn" | null;
  commit_count: number;
  raw_markdown: string;     // for client-side rendering via marked
  sections: {
    heading: string;
    line_start: number;
    line_end: number;
  }[];
}

// /api/graph response
interface GraphResponse {
  nodes: {
    path: string;
    title: string | null;
    category: "adr" | "spec" | null;
    status: string | null;
    commit_count: number;
  }[];
  edges: {
    from: string;           // doc_path
    to: string;             // doc_path
    count: number;          // aggregated commit_count across section-pair edges
  }[];
}
```

### Graph SQL

The `/api/graph` endpoint's SQL is the one deliberate exception to the Logic-duplication rule: docs-mcp has no doc-level aggregation helper today, and the dashboard writes these two queries in `mclaude-docs-dashboard/src/graph-queries.ts`. Both queries canonicalize each undirected edge by ordering the two doc paths — `LEAST(a, b), GREATEST(a, b)` via `MIN`/`MAX` — so the section-level rows `(A, B)` and `(B, A)` (if the scanner ever writes both orderings) collapse into one edge.

**Global query** — every doc as a node + one aggregated edge per unordered doc pair:

```sql
-- Nodes
SELECT path, title, category, status, commit_count
FROM documents;

-- Edges, aggregated from the section-level lineage table
SELECT
  MIN(section_a_doc, section_b_doc) AS from_path,
  MAX(section_a_doc, section_b_doc) AS to_path,
  SUM(commit_count)                 AS count
FROM lineage
WHERE section_a_doc != section_b_doc
GROUP BY MIN(section_a_doc, section_b_doc), MAX(section_a_doc, section_b_doc);
```

The server-side handler then applies sidebar filters (ADR↔spec default; optional ADR↔ADR and spec↔spec) by joining each edge's two paths against `documents.category` in a single loop — no second SQL round trip.

**Local query** (`?focus=<p>`) — 1-hop neighborhood of the focus doc. Two statements:

```sql
-- Edges incident to the focus doc
SELECT
  MIN(section_a_doc, section_b_doc) AS from_path,
  MAX(section_a_doc, section_b_doc) AS to_path,
  SUM(commit_count)                 AS count
FROM lineage
WHERE (section_a_doc = :focus OR section_b_doc = :focus)
  AND section_a_doc != section_b_doc
GROUP BY MIN(section_a_doc, section_b_doc), MAX(section_a_doc, section_b_doc);

-- Nodes: the focus + the neighbor set derived from the edge list above
SELECT path, title, category, status, commit_count
FROM documents
WHERE path IN (/* focus + every from_path/to_path from the edge query */);
```

The handler builds the `IN` list from the edge query result set in JS and executes the nodes query as a second statement — this is a 2-query pattern, not N+1. All local edges are shown regardless of category (no sidebar filtering in local mode, per the Local graph scope decision).

### SSE event shape

```ts
// /events
{ type: "reindex", changed: string[] }   // doc_paths that were reindexed
{ type: "hello" }                        // sent on connect so the client knows it's live
```

### SSE broker design

The broker lives in `mclaude-docs-dashboard/src/server.ts`. It manages the set of active client connections and fans out reindex events from the watcher callback to every connected client.

**Client set**: a module-level `Set<WritableStreamDefaultWriter<Uint8Array>>`. Each entry is the writer end of the `ReadableStream` returned from the `/events` handler. `Set` is chosen over `Array` because client disconnects remove entries by identity — a set gives O(1) removal.

**Connect path** (Bun.serve streaming body API):

```ts
// Inside the server's /events route handler
const encoder = new TextEncoder();

// `writer` must be declared OUTSIDE the ReadableStream options object.
// `start` and `cancel` are sibling callbacks — neither closes over locals
// declared inside the other. Hoisting `writer` to this shared scope
// lets `cancel` remove the exact same reference `start` registered.
let writer: { write: (chunk: string) => void; close: () => void } | null = null;

const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    writer = {
      write: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
      close: () => { try { controller.close(); } catch {} },
    };
    clients.add(writer);
    // Send the hello immediately so the client knows it's connected.
    writer.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
  },
  cancel() {
    // Fires when the client disconnects (tab close, network drop, Bun detects EPIPE on next write).
    if (writer) clients.delete(writer);
  },
});
return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  },
});
```

The `writer` object is a minimal shim the broker stores a reference to. Declaring it in the enclosing function scope (not inside `start`) is load-bearing — `start` and `cancel` are sibling properties on the options object, so a `const writer` inside `start` is invisible to `cancel` and would cause a `ReferenceError` on every clean disconnect. The same reference is what the broadcast loop iterates.

**Broadcast path**: the watcher callback (see "Watcher callback" decision) hands a deduped `changed: string[]` to `broker.broadcast(event)`:

```ts
function broadcast(event: { type: string; changed?: string[] }): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const writer of clients) {
    try {
      writer.write(payload);
    } catch {
      // Stream closed between the cancel handler firing and now; remove defensively.
      clients.delete(writer);
    }
  }
}
```

**Disconnect detection**: `ReadableStream`'s `cancel` fires when the browser closes the connection cleanly. For dirty disconnects (network drop), the next `writer.write` throws — the `try/catch` in the broadcast loop catches it and removes the stale entry on the spot. No separate heartbeat ping is needed; the existing `reindex` stream is already the liveness signal when files are changing, and EventSource's 5 s auto-reconnect on the client side bounds how long a stale server-side entry could persist silently.

**Event flow end-to-end**: watcher detects file change → debounces 100 ms → calls `indexFile` on each touched path, collecting paths where `indexFile` returned `true` → invokes `onReindex(changed)` once per sweep → handler calls `broker.broadcast({type: "reindex", changed})` → each client writer emits `data: {...}\n\n` → browser `EventSource` fires `onmessage`.

## Error Handling

| Failure | Behavior |
|---------|----------|
| `.git` not found walking up from cwd | Print error naming the cwd and exit non-zero. Cannot operate without a repo. |
| `.docs-index.db` missing or corrupt | Dashboard calls `openDb` (rebuilds per ADR-0015's contract) then `indexAllDocs`. UI shows "Indexing…" overlay until first index returns. |
| DB schema version mismatch | `openDb` already deletes and rebuilds; same flow as above. |
| File watcher dead (`fs.watch` throws) | Fall back to polling every 5 s (same pattern as docs-mcp `startWatcher`). Show a subtle "Live updates via polling" indicator in the footer. |
| Port `4567` in use | Fail fast: `Error: port 4567 is in use. Use --port <n> or stop the other process.` Do not auto-increment. |
| `/api/doc` or `/api/lineage` called with unknown path | HTTP 404, JSON body `{error: "not found", path}`. UI renders an inline error in that pane; rest of the page stays intact. |
| FTS5 query syntax error | `searchDocs` throws; handler returns HTTP 400 with the error message. UI displays it inline under the search box. |
| SSE connection dropped | Browser `EventSource` auto-reconnects. On reconnect, the server sends `{type: "hello"}` and the client triggers a full refetch (covers events missed while disconnected). |
| Markdown parse error | `marked` is permissive; on catastrophic failure, show raw source in a `<pre>` with a one-line warning. |

## Security

- Binds to `127.0.0.1` only. No remote access, no Tailscale exposure.
- No authentication layer. The only content served is the filesystem's `docs/` tree, already readable by any local process the developer is running.
- No write endpoints in v1 — cannot mutate the filesystem or DB state from the browser.
- CORS is wide-open (`Access-Control-Allow-Origin: *`) since the server is loopback-only. Not a concern.

## Impact

Files created/edited in the ADR+spec co-commit:

- **New**: `docs/mclaude-docs-dashboard/spec-dashboard.md` — full component-local spec for the dashboard, describing endpoints, UI routes, SSE semantics, graph queries, error handling.
- **New**: `docs/mclaude-docs-mcp/spec-docs-mcp.md` — component-local spec for docs-mcp (previously missing). Describes v1 behavior (parser, indexer, scanner, watcher, the four MCP tools) per ADR-0015, plus the `status` column per ADR-0018, plus the new `commit_count` column from this ADR.
- **Unchanged**: `docs/spec-doc-layout.md` (dashboard consumes the existing layout rules), `docs/spec-state-schema.md` (no NATS/KV/K8s changes), `docs/spec-tailscale-dns.md` (loopback only).

Components implementing the change:

- `mclaude-docs-mcp/` — schema column + scanner tally (~10 added lines, no API change).
- `mclaude-docs-dashboard/` — new package, ~1000 lines production code + tests.

## Scope

**In v1:**
- Landing page (ADRs grouped by status + spec index).
- ADR detail view with rendered markdown + status history + H2 popovers.
- Spec detail view with rendered markdown + H2 popovers.
- FTS search bar + search results page.
- Force-directed graph: global mode and 1-hop local mode. Node size by volatility, edge width by co-commit count, status-encoded borders/tone.
- SSE live-update.
- `--port`, `--db-path` CLI flags; `127.0.0.1` bind; fail-fast on port conflict.
- `commit_count` schema column + scanner tally in docs-mcp.
- Component-local specs for both `mclaude-docs-dashboard/` and `mclaude-docs-mcp/`.

**Deferred:**
- Editing (status flips, section edits) — dashboard is read-only.
- 2-hop / N-hop local graph with a hop slider.
- Graph filtering UI beyond the ADR↔spec default toggles (e.g. per-status filter, per-component filter).
- Per-section volatility heatmap (requires aggregating `lineage` by section).
- Commit diff viewer (show the diff of the commit that produced a lineage edge).
- Packaging into `spec-driven-dev` plugin — handled by ADR-0026 when it lands; this ADR only keeps the dashboard portable.
- Multi-repo (viewing multiple projects in one dashboard instance).

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `mclaude-docs-mcp/` schema + scanner tally | ~15 | ~40k | Schema column, version bump, scanner increment, update existing scanner tests. Small but triggers full reindex. |
| `mclaude-docs-mcp/` package exports | ~10 | included above | Add `exports` field to package.json so the dashboard can import. |
| `docs/mclaude-docs-mcp/spec-docs-mcp.md` | ~150 | ~30k | Transcribe v1 behavior + ADR-0018 status + new commit_count. Written before code work, during this ADR's co-commit. |
| `mclaude-docs-dashboard/` package scaffold | ~40 | ~30k | package.json, tsconfig, vite.config.ts, .gitignore. |
| `src/boot.ts` (repo root walk-up, DB open, index, watcher) | ~80 | ~60k | All reuse of docs-mcp functions. |
| `src/server.ts` + `src/routes.ts` (Bun.serve, 7 routes, SSE broker) | ~200 | ~100k | Thin handlers; SSE broker needs care (broadcast to all connected clients). |
| `src/graph-queries.ts` (SQL for global + local graph) | ~80 | ~50k | Two queries: full graph aggregate, focused 1-hop. |
| `ui/` Vite + React scaffold + hash router + SSE hook | ~150 | ~60k | Boilerplate + router + single `useEventSource` hook. |
| `ui/routes/Landing.tsx` | ~120 | ~60k | Two-column layout, collapsible status buckets, spec directory grouping. |
| `ui/routes/AdrDetail.tsx` + `SpecDetail.tsx` + `MarkdownView.tsx` | ~180 | ~80k | Shared markdown renderer with link-rewriting extension; the two route components differ mainly in header (status history for ADRs). |
| `ui/components/LineagePopover.tsx` | ~100 | ~60k | Icon injection via marked extension; popover positioning; click-to-pin, Esc-to-dismiss. |
| `ui/routes/Graph.tsx` (react-force-graph wrapper, global + local modes, toggles) | ~200 | ~100k | Node/edge encoding, sidebar filters, navigate-on-click. |
| `ui/routes/SearchResults.tsx` + `SearchBar.tsx` | ~100 | ~50k | Debounced fetch, ranked list, snippet rendering. |
| `ui/components/StatusBadge.tsx` + styling tokens | ~40 | ~20k | Color/border encoding per the Node encoding decision. |
| Tests: server routes, graph queries, SSE broker | ~250 | ~120k | Unit + integration. Reuses docs-mcp's test DB setup. |
| Tests: UI (render, navigation, popover, search) | ~200 | ~80k | Vitest + Testing Library. |
| `docs/mclaude-docs-dashboard/spec-dashboard.md` | ~250 | ~40k | Full spec authored alongside this ADR. |

**Total estimated lines:** ~2000
**Total estimated tokens:** ~950k
**Estimated wall-clock:** 2h of 5h budget (40%)
