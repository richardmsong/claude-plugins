# ADR-0076: ADR Spec Impact View

**Status:** accepted  
**Date:** 2026-05-01

## Context

When working on an ADR, the user needs to see what changes to the spec it's proposing or has made. Lineage (git co-commits) is too indirect — it says "these files were committed together" but doesn't say which decision drove which section change. It also fails for draft/accepted ADRs that haven't been implemented yet.

The user needs an explicit transaction record: "this ADR decision drove this spec section change." This data should be durable (survive DB rebuilds), versionable (live in git), and machine-readable (the dashboard can render it).

## Decision

### 1. Sidecar `.impact.json` files

Each ADR that modifies specs gets a sidecar file at the same path with an `.impact.json` suffix:

```
docs/adr-0074-dashboard-audit-docs.md
docs/adr-0074-dashboard-audit-docs.impact.json
```

The file contains an array of impact records:

```json
[
  {
    "adr_section": "Decision §1",
    "spec": "docs/mclaude-docs-dashboard/spec-dashboard.md",
    "spec_section": "HTTP Endpoints",
    "summary": "Add GET /api/audits row"
  },
  {
    "adr_section": "Decision §3",
    "spec": "docs/mclaude-docs-dashboard/spec-dashboard.md",
    "spec_section": "UI Routes",
    "summary": "Add #/audits and #/audit/<path> routes"
  },
  {
    "adr_section": "Decision §1",
    "spec": "docs/mclaude-docs-mcp/spec-docs-mcp.md",
    "spec_section": "classifyCategory",
    "summary": "Accept full path, return \"audit\" for audits/ directory"
  }
]
```

Fields:
- `adr_section` — which part of the ADR drives this change. `null` for backfilled records where lineage doesn't know the originating decision. Free text when provided (H2 heading, numbered decision, or descriptive label).
- `spec` — repo-relative path to the spec file
- `spec_section` — H2 heading in the spec that was changed. Always non-null — backfill only produces records for section-level lineage matches (doc-level co-commits with no H2 match are omitted since they provide no actionable section reference).
- `summary` — one-line description of what changed or will change. `null` for backfilled records.

### 2. Written during /feature-change step 5

The master session writes the `.impact.json` file in the same commit as the ADR + spec co-commit. At that point it knows exactly which ADR decisions it's reflecting in which spec sections. The file is co-committed with the ADR and spec changes so lineage picks it up too.

For draft ADRs authored during /plan-feature, the impact file records proposed changes (what the ADR intends to change in the spec). These are updated to actuals when the ADR is implemented.

### 3. Backfill on boot — seed missing JSON from git

During boot, after `runBlameScan` (step 6 in the boot sequence) and before `startWatcher` (step 7), run the backfill:

1. Scan the `documents` table for ADRs (`category = 'adr'`).
2. For each ADR, check whether a `.impact.json` sidecar exists on disk (same path, `.md` replaced with `.impact.json`).
3. If no sidecar exists, query the `lineage` table for spec sections co-committed with this ADR:
   ```sql
   SELECT DISTINCT spec, spec_section FROM (
     SELECT l.section_b_doc AS spec, l.section_b_heading AS spec_section
     FROM lineage l
     JOIN documents d ON d.path = l.section_b_doc
     WHERE l.section_a_doc = ? AND d.category = 'spec'
     UNION
     SELECT l.section_a_doc AS spec, l.section_a_heading AS spec_section
     FROM lineage l
     JOIN documents d ON d.path = l.section_a_doc
     WHERE l.section_b_doc = ? AND d.category = 'spec'
   )
   ```
   The lineage scanner stores each ordered pair (A, B) where at least one side is an ADR. The ADR can appear as either `section_a` or `section_b`, so both directions must be queried. Both `?` parameters bind the ADR's doc_path.
4. Generate impact records with `adr_section: null` and `summary: null`.
5. Write the `.impact.json` file to disk.

Once written, the file is the source of truth — git history is never consulted again for that ADR. The generated files can be committed by the user or the master session.

New ADRs get explicit `.impact.json` files (with `adr_section` and `summary` populated) during /feature-change step 5. The backfill only covers historical ADRs.

The backfill logic lives in `docs-mcp/src/impact.ts` as `backfillImpact(db: Database, repoRoot: string | null, docsDir: string): void`. When `repoRoot` is null, the function returns immediately (no-op). This avoids TypeScript TS2345 errors at the boot.ts call sites — `gitRoot` is `string | null` from `findGitRoot()`, and the existing `runLineageScan`/`runBlameScan`/`startWatcher` callers already have latent TS2345 errors by passing nullable values to `string`-typed params. New functions introduced by this ADR accept `string | null` explicitly to avoid adding to that debt. Parameter order matches the existing convention. It needs `repoRoot` to construct absolute paths when writing `.impact.json` files (the sidecar is written at `join(repoRoot, adrPath.replace(/\.md$/, '.impact.json'))`). The dashboard's `boot.ts` calls it directly without null guard. This follows the Logic-Duplication Rule: the logic is in docs-mcp, the orchestration is in boot.ts.

### 4. Indexed into SQLite on boot

After backfill, index all `.impact.json` files into a new `adr_spec_impact` table:

```sql
CREATE TABLE adr_spec_impact (
  id INTEGER PRIMARY KEY,
  adr_path TEXT NOT NULL,      -- repo-root-relative POSIX path (same convention as documents.path)
  adr_section TEXT,            -- nullable: null for backfilled records
  spec_path TEXT NOT NULL,     -- repo-root-relative POSIX path (same convention as documents.path)
  spec_section TEXT NOT NULL,  -- H2 heading in the spec
  summary TEXT                 -- nullable: null for backfilled records
);
```

All paths use the same repo-root-relative POSIX convention as `documents.path`, enabling direct `JOIN documents ON documents.path = adr_spec_impact.adr_path` (or `spec_path`).

`SCHEMA_VERSION` bumps from `"4"` to `"5"`. Existing DBs at version `"4"` will be deleted and rebuilt on upgrade (standard `openDb` behavior).

The indexing logic lives in `docs-mcp/src/impact.ts` as `indexImpact(db: Database, repoRoot: string | null, docsDir: string): void`. When `repoRoot` is null, returns immediately (no-op) — same reasoning as `backfillImpact`. Boot.ts calls it directly without null guard. ADRs always live under `docsDir` (the `docs/` directory) per project convention — "ADRs never nest" but are always at `docs/adr-*.md`. Their sidecars are at `docs/adr-*.impact.json`, also under `docsDir`. The function truncates `adr_spec_impact` entirely (`DELETE FROM adr_spec_impact`) then re-scans all `.impact.json` files, inserting fresh rows. Called from `boot.ts` after `backfillImpact`.

Malformed `.impact.json` files (invalid JSON, missing required fields `spec` or `spec_section`) are caught and logged as warnings — non-fatal, same pattern as `indexAllDocs` parse errors. The file is skipped; no rows are inserted for it.

Rebuilt from the JSON files on every DB rebuild — the JSON is the source of truth. No runtime fallback to lineage.

### 5. Watcher integration

The watcher in `docs-mcp/src/watcher.ts` currently watches only `*.md` files. Extend the `handleEvent` callback (which receives `(event, filename)` where `filename` is relative to `docsDir`). The `.impact.json` branch is a sibling to the `.md` branch inside the truthy-filename block:

The existing watcher conditional (`if (filename && filename.endsWith(".md")) { ... } else { full reindex }`) is extended by inserting an `else if` branch between the two existing branches:

```
if (filename && filename.endsWith(".md")) {
  // ... existing incremental .md handling (unchanged) ...
} else if (filename && filename.endsWith(".impact.json")) {
  const fullPath = join(docsDir, filename);
  const adrDocPath = relative(repoRoot, fullPath).replace(/\.impact\.json$/, '.md');
  try {
    indexImpactFile(db, fullPath, repoRoot);
    // Push unconditionally — sidecar files have no mtime guard (unlike .md indexFile).
    // Any change to the sidecar warrants an SSE reindex event for the associated ADR.
    changedPaths.push(adrDocPath);
  } catch (err) {
    console.warn(`[docs-mcp] Error indexing ${fullPath}: ${err}`);
  }
} else {
  // existing full-reindex fallback — fires for null filename OR any unrecognized extension
  const reindexed = indexAllDocs(db, docsDir, repoRoot);
  for (const p of reindexed) { changedPaths.push(p); /* + blameFile as existing */ }
  indexImpact(db, repoRoot, docsDir);
}
```

The `else` branch behavior is unchanged: non-`.md`, non-`.impact.json` events (including null filename on platforms that don't provide it) still trigger a full reindex. `indexImpact(db, repoRoot, docsDir)` is added to keep the impact table consistent with the full reindex.

1. Import `indexImpactFile` from `./impact.js` — intra-package import using the `.js` extension (same convention as existing `watcher.ts` imports: `./content-indexer.js`, `./lineage-scanner.js`). No circular dependency — `impact` imports from `db` and `content-indexer`, not from `watcher`. Cross-package consumers (dashboard's `boot.ts`, `routes.ts`) use the workspace subpath `docs-mcp/impact` instead.
2. The `adrDocPath` is repo-root-relative (same convention as all paths in the reindex callback).
3. The dashboard's `ImpactView` component re-fetches on ANY `reindex` event (intentional — impact data involves sidecar files that don't correspond to a single doc path in the reindex set, so per-path filtering is not applicable here).
4. `indexImpactFile` takes `repoRoot: string` (non-nullable) — within the watcher's own callback, `repoRoot` is the value passed to `startWatcher`, typed `string` in the watcher signature. It does not need null handling here.

Backfill-generated `.impact.json` files are written before the watcher starts (step 7 < step 9), so the watcher does not see boot-time writes — no spurious SSE events on first boot. The watcher extension only handles post-boot changes (e.g., master session writing a new `.impact.json` during a /feature-change session).

### 6. Dashboard: dedicated `#/impact/<slug>` page

A new route shows the ADR's spec impact as a side-by-side view:

- **Left pane**: the ADR content, rendered with MarkdownView (reuses existing rendering, no blame gutter — lighter than AdrDetail). On `fetchDoc` 503, renders a "Repository not available" placeholder in place of the markdown.
- **Right pane**: the impacted spec sections. For each unique spec in the impact records, fetch the full doc via `GET /api/doc?path=<spec>`. The response includes `raw_markdown` and `sections: { heading, line_start, line_end }[]`. For each impacted `spec_section` heading, find the matching entry in `sections` (by heading string equality), extract the substring `raw_markdown.split('\n').slice(line_start - 1, line_end).join('\n')`, and render it with MarkdownView. Group rendered sections by spec file.
  - If `fetchDoc(specPath)` returns 503, render a "Repository not available" placeholder for that spec group (same as left pane).
  - If `fetchDoc(specPath)` returns 404 (spec deleted from index), render a "Spec not found" placeholder for that spec group.
  - If the `spec_section` heading is not found in the `sections` array (renamed or deleted), render the section heading as a label with the note "(Section not found in current spec)" — do not fail or omit the record.
- **Navigation**: a "Spec impact" button on the AdrDetail page links to `#/impact/<slug>`

**Slug convention**: same as `#/adr/<slug>`. The slug is the doc_path without the `.md` extension (e.g., `docs/adr-0074-dashboard-audit-docs`). The ImpactView component derives the ADR path as `${slug}.md` and calls `GET /api/impact?adr=${slug}.md`.

**Scroll linking**: deferred to v2. In v1, the right pane shows all impacted spec sections in a scrollable list grouped by spec file; no scroll synchronization with the left pane.

The mapping from the `.impact.json` file drives which spec sections appear in the right pane and which ADR sections they correspond to. For backfilled records where `adr_section` is null, the right pane shows the spec section without an ADR section label — the link is at the document level ("this ADR co-committed with this spec section") rather than decision level.

### 7. API endpoint

`GET /api/impact?adr=<path>` — returns the impact records for an ADR. Underlying function: `getImpact(db, {adr})` from `docs-mcp/impact`.

```sql
SELECT i.adr_path, d.title AS adr_title, i.adr_section, i.spec_path AS spec, i.spec_section, i.summary
FROM adr_spec_impact i
JOIN documents d ON d.path = i.adr_path
WHERE i.adr_path = ?
```

Response:

```ts
interface ImpactRecord {
  adr_path: string;
  adr_title: string | null;
  adr_section: string | null;
  spec: string;
  spec_section: string;
  summary: string | null;
}
```

When called with `adr` param, `adr_path` and `adr_title` are the same for all records (redundant but keeps the shape uniform with the reverse lookup). Returns `[]` if no `.impact.json` exists for the ADR.

**Error handling**: if neither `adr` nor `spec` is provided, return HTTP 400 (`"Missing required query param: adr or spec"`). If both are provided, `adr` takes precedence (spec is ignored).

### 8. Reverse lookup

`GET /api/impact?spec=<path>` — returns all impact records pointing at a given spec, across all ADRs. Underlying function: `getImpact(db, {spec})` from `docs-mcp/impact`.

```sql
SELECT i.adr_path, d.title AS adr_title, i.adr_section, i.spec_path AS spec, i.spec_section, i.summary
FROM adr_spec_impact i
JOIN documents d ON d.path = i.adr_path
WHERE i.spec_path = ?
```

Each record includes `adr_path` and `adr_title` so the dashboard can link back to the originating ADR. Same `ImpactRecord` response shape as §7.

Useful for the SpecDetail page to show "which ADRs shaped this spec."

## Impact

| Component | Files |
|-----------|-------|
| docs-mcp | `src/impact.ts` (new — backfill + index + query), `src/db.ts` (schema v5), `src/watcher.ts` (watch .impact.json), `package.json` (new `"./impact"` export) |
| docs-mcp (spec) | `spec-docs-mcp.md` (schema version bump to "5", new `adr_spec_impact` table, watcher `.impact.json` handling, new `"./impact"` export in package exports) |
| docs-dashboard (backend) | `src/routes.ts` (new `handleImpact`), `src/server.ts` (route), `src/boot.ts` (call backfillImpact + indexImpact) |
| docs-dashboard (UI) | `ui/src/routes/ImpactView.tsx` (new), `ui/src/routes/AdrDetail.tsx` (link button), `ui/src/App.tsx` (route), `ui/src/api.ts` (fetchImpact) |
| docs-dashboard (spec) | `spec-dashboard.md` (boot sequence steps, HTTP Endpoints row, UI Routes row) |
| skills | `skills/feature-change/SKILL.md` (step 5: write .impact.json), `skills/plan-feature/SKILL.md` (write .impact.json on spec update) |

## Component Changes

### docs-mcp

- `src/db.ts`: Add `adr_spec_impact` table to `SCHEMA_SQL`. Bump `SCHEMA_VERSION` from `"4"` to `"5"`.
- `src/impact.ts` (new): Four exported functions:
  - `backfillImpact(db, repoRoot: string | null, docsDir)` — no-ops when `repoRoot` is null. Scans ADRs without sidecars, generates `.impact.json` from lineage, writes to disk. Each ADR's write is wrapped in its own try/catch — a failure to write one sidecar is caught and logged as a warning; processing continues for remaining ADRs. Parameter order matches `runLineageScan`/`runBlameScan`. Called by boot.ts without null guard; the null check is internal.
  - `indexImpact(db, repoRoot: string | null, docsDir)` — no-ops when `repoRoot` is null. Truncates `adr_spec_impact` entirely (`DELETE FROM adr_spec_impact`), then scans all `.impact.json` files under `docsDir` and re-inserts. The truncate-before-scan ensures deleted sidecar files don't leave orphan rows. Uses its own recursive directory walk (same pattern as the private `walkMdFiles` in `content-indexer.ts` — `readdirSync` + recurse on directories + filter by `.impact.json` extension, skipping symlinks) since `walkMdFiles` is not exported. Called by boot.ts without null guard; the null check is internal.
  - `indexImpactFile(db, jsonPath: string, repoRoot: string)` — indexes a single `.impact.json` file. Derives `adr_path` from the JSON path (`relative(repoRoot, jsonPath).replace(/\.impact\.json$/, '.md')`). Deletes all existing `adr_spec_impact` rows for that `adr_path`, then re-inserts from the parsed JSON (same delete-all + re-insert pattern as `blameFile`). Used by the watcher for incremental updates; `repoRoot` is always `string` in this context (watcher only starts when `gitRoot` is non-null).
  - `getImpact(db, {adr?: string, spec?: string}): ImpactRecord[]` — query function. When `adr` is provided, returns all impact records for that ADR. When `spec` is provided, returns all impact records targeting that spec across all ADRs. JOINs `documents` for `adr_title`. See §7 and §8 for exact SQL.
- `src/watcher.ts`: Extend file-change detection to include `.impact.json` files. On change, call `indexImpactFile` and include the ADR path in the reindex callback.
- `package.json`: Add `"./impact": "./src/impact.ts"` to exports map. Must land in the same commit as `src/impact.ts` and the `boot.ts` changes — the dashboard imports `docs-mcp/impact` which resolves via this export.

### docs-dashboard

- `src/boot.ts`: After `runBlameScan` (step 6), call `backfillImpact` and `indexImpact` in their own try/catch blocks — same calling convention as `runLineageScan` and `runBlameScan` (no `if (gitRoot)` guard; `gitRoot` is passed directly):
  ```
  try {
    backfillImpact(db, gitRoot, docsDir);
  } catch (err) {
    console.error(`[dashboard] Impact backfill failed: ${err}`);
  }
  try {
    indexImpact(db, gitRoot, docsDir);
  } catch (err) {
    console.error(`[dashboard] Impact index failed: ${err}`);
  }
  ```
  `gitRoot` is `string | null` (from `findGitRoot`). Both functions are typed `repoRoot: string | null` and no-op internally when null, so no guard is needed at the call site and no TypeScript error is produced. These become boot steps 7 and 8; `startWatcher` moves to step 9.

### docs-dashboard (spec update)

Update `spec-dashboard.md`:

**Backend boot sequence** — insert two new steps after step 6 (`runBlameScan`):
- Step 7: `backfillImpact(db, gitRoot, docsDir)` — generates `.impact.json` sidecars for ADRs missing them, using lineage data. Non-fatal on error (wrapped in try/catch same as lineage/blame steps).
- Step 8: `indexImpact(db, gitRoot, docsDir)` — populates `adr_spec_impact` table from all `.impact.json` files. Non-fatal on error.
- Step 9: `startWatcher(...)` (renumbered from 7).

**HTTP Endpoints table** — add new row:
`| GET | /api/impact?adr=<p> or ?spec=<p> | Impact records: ADR→spec section mappings. | getImpact from docs-mcp/impact |`

**UI Routes table** — add new row:
`| #/impact/<slug> | ImpactView.tsx | Side-by-side ADR decisions + impacted spec sections. Slug = doc_path without .md (ADR-0076). |`
- `src/routes.ts`: `handleImpact(db: Database, url: URL): Response` — reads `adr` or `spec` query param from `url.searchParams`, calls `getImpact(db, {adr})` or `getImpact(db, {spec})` from `docs-mcp/impact`, returns `json(records)` using the module-local `json()` helper (same as all other handlers — adds `Access-Control-Allow-Origin: *` CORS header). No `repoRoot` in the signature — `getImpact` is DB-only. Returns `badRequest("Missing required query param: adr or spec")` (the module-local helper) if neither param is present.
- `src/server.ts`: Register `GET /api/impact` → `handleImpact`.
- `ui/src/api.ts`: Add `export interface ImpactRecord { adr_path: string; adr_title: string | null; adr_section: string | null; spec: string; spec_section: string; summary: string | null; }` and `fetchImpact(adr?: string, spec?: string): Promise<ImpactRecord[]>` (mirrors the server-side type in §7).
- `ui/src/routes/ImpactView.tsx` (new): Side-by-side ADR + spec sections page.
  - Props: `{ slug: string; navigate: (href: string) => void; lastEvent: SSEEvent | null }` — same shape as AdrDetail. Derives `adrPath = ${slug}.md`. On mount and on `lastEvent?.type === "reindex"`, calls both `fetchDoc(adrPath)` (for the left pane ADR content) and `fetchImpact(adrPath)` (for the right pane records) in parallel. `fetchDoc` returns `DocResponse` (the type exported from `ui/src/api.ts`, which includes `raw_markdown`, `title`, and `sections`); on 503 (repoRoot null), renders a "Repository not available" placeholder in the left pane.
  - Left pane: ADR `raw_markdown` rendered with MarkdownView (no blame gutter).
  - Right pane: impacted spec sections grouped by spec file. For each unique spec, calls `fetchDoc(specPath)` to get `raw_markdown` and `sections`; slices the spec section markdown by `line_start`/`line_end` from `sections`; renders with MarkdownView.
  - Empty state: when `fetchImpact` returns `[]`, renders a message "No impact records found for this ADR." (does not show the two-pane layout). This covers both the missing-sidecar case and the invalid-slug case (the SQL JOIN means unknown ADR paths also return `[]`).
- `ui/src/routes/AdrDetail.tsx`: "Spec impact" button in the header area, linking to `#/impact/<slug>`. The button renders unconditionally (does not pre-check for records) — navigating to ImpactView will show the empty state if needed.
- `ui/src/App.tsx`: Add `#/impact/<slug>` route — dispatch condition: `route.startsWith("/impact/")`, extract `slug = route.slice("/impact/".length)`, render `<ImpactView slug={slug} navigate={navigate} lastEvent={lastEvent} />`.

### docs-mcp (spec update)

Update `spec-docs-mcp.md`:

**Data Model section** — add `adr_spec_impact` table description after the existing table list. Specify: schema version bumps from `"4"` to `"5"`, new table `adr_spec_impact` with columns `(id, adr_path, adr_section, spec_path, spec_section, summary)` as in §4, all paths repo-root-relative POSIX (same convention as `documents.path`).

**Exports section** — add `"./impact"` entry to the package exports table:
`| "./impact" | src/impact.ts | backfillImpact, indexImpact, indexImpactFile, getImpact |`

**Watcher section** — add a sub-bullet or note: "Also watches `.impact.json` files under `docsDir`; on change, calls `indexImpactFile` and pushes the associated ADR path into the reindex callback."

### skills

- `skills/feature-change/SKILL.md`: Add a new substep between step 4b (spec-evaluator loop) and step 5 (commit). The instruction:
  ```
  Step 4c — Write .impact.json sidecar

  After spec edits pass the spec-evaluator (step 4b), write a sidecar file
  at the same path as the ADR with `.impact.json` suffix. The file is a JSON
  array of records, one per spec section changed:

    { "adr_section": "<H2 heading or decision label>",
      "spec": "<repo-relative spec path>",
      "spec_section": "<H2 heading in the spec>",
      "summary": "<one-line description of the change>" }

  Include one record for every spec section you edited in step 4. Stage the
  .impact.json alongside the ADR and spec files for the step 5 co-commit.

  Skip this step for class A (bug fix) and class D (refactor) ADRs that have
  no spec changes — no sidecar is needed.
  ```
- `skills/plan-feature/SKILL.md`: Same instruction after spec edits, before commit.
