# Spec: Docs Dashboard

## Role

`docs-dashboard` is a local development server that visualizes the ADR/spec corpus. It lists every ADR and spec, shows each ADR's status (`draft | accepted | implemented | superseded | withdrawn`) at a glance, renders spec-ADR lineage derived from git co-commits, and live-updates as files change on disk. It is a dev-only tool with no auth that reuses all indexing, parsing, lineage-scanning, and file-watching logic from `docs-mcp/src/` — the same functions the MCP server calls.

Established by ADR-0027. Extended by ADR-0028 (bind `0.0.0.0`), ADR-0029 (`runLineageScan` in boot), ADR-0030 (LineagePopover doc-collapse), ADR-0031 (doc-level lineage), ADR-0032 (`--docs-dir` CLI flag).

## Runtime

- Bun (loads `.ts` files natively; no build step).
- Entrypoint: `docs-dashboard/src/server.ts`. On boot:
  1. `findRepoRoot(cwd)` — walks up from `process.cwd()` until a `.git` directory is found; exits non-zero if not found.
  2. `openDb(resolvedDbPath)` — opens the shared SQLite index in WAL mode; path defaults to `<repoRoot>/.agent/.docs-index.db`, overridden by `--db-path`.
  3. `indexAllDocs(db, resolvedDocsDir, repoRoot)` — populates the doc index.
  4. `runLineageScan(db, repoRoot)` — populates lineage from `git log` (ADR-0029).
  5. `startWatcher(db, resolvedDocsDir, repoRoot, onReindex)` — watches `resolvedDocsDir` for changes; `onReindex` broadcasts SSE events.
- Default port `4567`; overridden by `--port <n>`.
- Binds to `0.0.0.0` (all interfaces, ADR-0028) — reachable from Tailnet peers.
- The startup banner prints:
  ```
  Dashboard ready:
    http://127.0.0.1:<port>/
    http://<non-loopback-ipv4>:<port>/   (one line per non-loopback IPv4 interface)
  ```

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--port <n>` | `4567` | HTTP listen port. Fails fast if in use. |
| `--db-path <path>` | `<repoRoot>/.agent/.docs-index.db` | SQLite index path. |
| `--docs-dir <path>` | `<repoRoot>/docs` | Directory to index. Resolved relative to `cwd`; absolute paths accepted. (ADR-0032) |

## Logic-Duplication Rule

The dashboard must not reimplement parsing, indexing, lineage scanning, watching, or tool-layer queries. It imports from `docs-mcp/src/` via workspace subpaths:

- `openDb` from `docs-mcp/db`
- `indexAllDocs` from `docs-mcp/content-indexer`
- `runLineageScan` from `docs-mcp/lineage-scanner`
- `startWatcher` from `docs-mcp/watcher`
- `listDocs`, `readRawDoc`, `getLineage`, `searchDocs`, `NotFoundError` from `docs-mcp/tools`

HTTP handlers are thin wrappers: unmarshal parameters, call the function, JSON-encode the response.

## HTTP Endpoints

| Method | Path | Description | Underlying function |
|--------|------|-------------|---------------------|
| GET | `/api/adrs?status=<s>` | List ADRs, optional status filter. | `listDocs({category: "adr", status: s})` |
| GET | `/api/specs` | List specs. | `listDocs({category: "spec"})` |
| GET | `/api/doc?path=<p>` | Full doc: metadata + raw_markdown + sections. | `listDocs` + `readRawDoc` |
| GET | `/api/lineage?doc=<p>[&heading=<h>]` | Co-committed sections. `heading` optional (ADR-0031): absent/empty → doc-level aggregation; present → section-level. | `getLineage` |
| GET | `/api/search?q=<q>&limit=<n>&category=<c>&status=<s>` | FTS search with snippets. | `searchDocs` |
| GET | `/api/graph?focus=<p>` | Graph nodes + edges. Omit `focus` for global; provide for 1-hop local. | `graph-queries.ts` |
| GET | `/events` | SSE stream; emits `{type:"hello"}` on connect and `{type:"reindex",changed:[...]}` on watcher fires. | SSE broker in `server.ts` |
| GET | `/` and `/assets/*` | Static SPA bundle from `ui/dist/`. | Bun static file serving |

### `/api/doc` Response Shape

```ts
interface DocResponse {
  doc_path: string;
  title: string | null;
  category: "adr" | "spec" | null;
  status: "draft" | "accepted" | "implemented" | "superseded" | "withdrawn" | null;
  commit_count: number;
  raw_markdown: string;
  sections: { heading: string; line_start: number; line_end: number }[];
}
```

### `/api/graph` Response Shape

```ts
interface GraphResponse {
  nodes: { path: string; title: string | null; category: "adr" | "spec" | null; status: string | null; commit_count: number }[];
  edges: { from: string; to: string; count: number; last_commit: string }[];
}
```

### `/api/lineage` Response Shape

Returns `LineageResult[]` (same shape as `docs-mcp`'s `get_lineage`). In doc mode (no heading), `heading = ""` per ADR-0031.

## SSE Broker

Lives in `src/server.ts`. Manages a `Set<Writer>` of active client connections.

- **Connect**: `ReadableStream` with `start` (registers writer, sends `hello`) and `cancel` (removes writer). `writer` and `heartbeatInterval` are declared in the enclosing function scope so both `start` and `cancel` can reference the same values.
- **Heartbeat**: `start()` creates a `setInterval` that enqueues `:heartbeat\n\n` (an SSE comment, ignored by `EventSource`) every 15 seconds. This keeps the connection alive — without it, Bun closes the `ReadableStream` response when there is no more data to enqueue. The interval is per-connection and cleared in `cancel()` and on controller-closed errors (ADR-0037).
- **Broadcast**: iterates `clients`, writes `data: {...}\n\n`; removes writers that throw (dirty disconnect).
- **Events**: `{type:"hello"}` on connect; `{type:"reindex",changed:string[]}` on watcher callback.
- Browser `EventSource` auto-reconnects; on reconnect the client receives a `hello` and triggers a full refetch.

## Graph Queries (`src/graph-queries.ts`)

Deliberate exception to the logic-duplication rule: `docs-mcp` has no doc-level aggregation helper. The dashboard writes these queries directly.

**Global** — every doc as a node; one aggregated edge per unordered doc pair (canonicalized via `MIN`/`MAX` on doc paths):
```sql
-- Nodes
SELECT path, title, category, status, commit_count FROM documents;
-- Edges
SELECT MIN(section_a_doc,section_b_doc) AS from_path, MAX(section_a_doc,section_b_doc) AS to_path,
       SUM(commit_count) AS count, MAX(last_commit) AS last_commit
FROM lineage WHERE section_a_doc != section_b_doc
GROUP BY MIN(section_a_doc,section_b_doc), MAX(section_a_doc,section_b_doc);
```

**Local** (`?focus=<p>`) — 1-hop neighborhood: edges incident to the focus, then nodes fetched via `IN` from the edge result set. Two SQL statements, not N+1.

## LineagePopover (`ui/src/components/LineagePopover.tsx`)

Collapses the `LineageResult[]` response from `/api/lineage` by `section_b_doc` before rendering (ADR-0030). One row per co-committed document. Aggregation: `count = SUM(commit_count)`, `last_commit = MAX` (proxy: row with highest `commit_count`; tie → first row). Sorted by collapsed `count` descending. Row click navigates to the doc top (`#/adr/<slug>` or `#/spec/<path>`) without `§heading` anchor. Final row: "Open graph centered here" → `#/graph?focus=<doc_path>&section=<heading>` (section-level) or `#/graph?focus=<doc_path>` (doc-level, ADR-0031).

### H1 lineage marker (ADR-0031)

A `≡` icon is rendered next to the H1 title on every spec and ADR detail page, in addition to the per-H2 icons. Clicking/hovering calls `/api/lineage?doc=<p>` with no heading, returning doc-level aggregated rows. Popover row format is identical to the H2 collapsed row.

## MarkdownView (`ui/src/components/MarkdownView.tsx`)

Renders raw markdown to styled HTML using `marked` with a custom renderer. Scoped by a `.markdown-body` CSS class with a dark-theme typography stylesheet (`ui/src/components/markdown-body.css`) that provides spacing, font sizes, borders, and backgrounds for all standard markdown elements (h1–h6, p, ul, ol, li, table, th, td, pre, code, blockquote, hr, img). The stylesheet uses descendant selectors scoped to `.markdown-body` to avoid leaking into the dashboard chrome. Theme colors match the existing dashboard palette (`#0d1117` backgrounds, `#e2e8f0` text, `#63b3ed` links, `#2d3748` borders) (ADR-0039).

The custom renderer also:
- Applies `highlight.js` to fenced code blocks.
- Rewrites relative `adr-*.md` and `spec-*.md` links to internal `#/adr/` and `#/spec/` hash routes.
- Injects `LineagePopover` placeholders into H2 headings (hydrated after render via `createRoot`).

## UI Routes

| Hash route | Component | Description |
|------------|-----------|-------------|
| `#/` | `Landing.tsx` | ADRs bucketed by status (Drafts, Accepted, Implemented, Superseded, Withdrawn, Unspecified). Each bucket collapsible; all expanded by default (ADR-0035). Right column: specs grouped by directory. |
| `#/adr/<slug>` | `AdrDetail.tsx` | Rendered ADR with status badge + history dates. H2 popovers. H1 lineage marker (ADR-0031). |
| `#/spec/<path>` | `SpecDetail.tsx` | Rendered spec. H2 popovers. H1 lineage marker (ADR-0031). |
| `#/search?q=<q>` | `SearchResults.tsx` | FTS5 results with snippets. |
| `#/graph[?focus=<p>]` | `Graph.tsx` | Force-directed graph, global or 1-hop local mode. |

## Error Handling

| Failure | Behavior |
|---------|----------|
| `.git` not found walking up from cwd | Print error and exit non-zero. |
| `.docs-index.db` missing or corrupt | `openDb` rebuilds; UI shows "Indexing…" until index returns. |
| Schema version mismatch | `openDb` deletes and rebuilds; same flow. |
| `fs.watch` throws | Fall back to polling every 5 s; show "Live updates via polling" in footer. |
| Port in use | Fail fast: `Error: port <n> is in use. Use --port <n> or stop the other process.` |
| `/api/doc` or `/api/lineage` unknown path | HTTP 404, JSON `{error:"not found",path}`. |
| FTS5 query syntax error | HTTP 400 with error message. |
| SSE disconnect | Browser auto-reconnects; `hello` triggers full refetch. |
| Markdown parse error | Show raw source in `<pre>` with one-line warning. |
| `indexAllDocs` throws during boot | Catch-and-log, non-fatal; watcher catches up. |
| `runLineageScan` throws during boot | Catch-and-log, non-fatal; dashboard still serves docs. |

## Security

- Binds to `0.0.0.0` (ADR-0028); access control delegated to host network (Tailnet ACL / host firewall).
- No authentication layer.
- No write endpoints in v1 — read-only.
- CORS: `Access-Control-Allow-Origin: *` (read-only dev tool, no credentials).

## Dependencies

- `docs-mcp` (workspace) — all indexing, parsing, lineage, watching, and tool logic.
- `bun:sqlite` — via `docs-mcp/db`.
- Bun standard library — `fs`, `path`, `os` (network interfaces for startup banner).
- UI: `react 18`, `react-force-graph-2d`, `marked`, `highlight.js`, `vite`.
