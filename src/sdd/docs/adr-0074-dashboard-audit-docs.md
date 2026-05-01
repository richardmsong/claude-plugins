# ADR-0074: Dashboard Audit Docs

**Status:** accepted  
**Date:** 2026-05-01

## Context

Evaluator agents (design-evaluator, spec-evaluator, implementation-evaluator) produce audit reports in `docs/audits/`. These files are markdown and are already indexed by `docs-mcp`'s `indexAllDocs` (which recursively walks `docs/`). However, the dashboard has no UI for viewing them, and `classifyCategory` misclassifies audit files named `spec-*.md` as actual specs (it checks only the basename, not the directory path).

The user needs visibility into audit output during feature-change loops to understand what evaluator agents are finding and what changes they're driving.

## Decision

### 1. Fix `classifyCategory` to detect `audits/` path

`classifyCategory` currently receives only the basename. Change it to receive the full repo-relative path and check for the `audits/` directory segment before filename-based classification.

If the path contains `/audits/` as a directory component, return `"audit"` regardless of filename. This prevents `docs/audits/spec-*.md` files from being misclassified as specs.

The return type changes from `"adr" | "spec" | null` to `"adr" | "spec" | "audit" | null`.

### 2. Update `ListDocsSchema` to accept `"audit"` category

Add `"audit"` to the `z.enum` in `ListDocsSchema` so `listDocs({category: "audit"})` works.

### 3. Add `/api/audits` endpoint to the dashboard

Thin wrapper: `listDocs(db, { category: "audit" })`. Same response shape as `/api/specs`.

### 4. Add "Audits" section to the landing page

Third column (or section below specs) on the landing page. Audit docs grouped by type prefix:
- `design-*` — Design audit reports
- `spec-*` — Spec alignment reports
- `impl-*` — Implementation compliance reports
- `adr-*` — ADR-specific audit rounds

Each audit doc is clickable and navigates to a detail view.

### 5. Add audit detail route

`#/audit/<path>` route renders the audit markdown using the existing `MarkdownView` component. Reuses the `/api/doc?path=<p>` endpoint (audit docs are already in the `documents` table).

### 6. Update `SearchDocsSchema`

Add `"audit"` to the category enum in `SearchDocsSchema` so audits are searchable by category filter.

## Impact

| Component | Files |
|-----------|-------|
| docs-mcp | `src/parser.ts` (`classifyCategory`), `src/tools.ts` (`ListDocsSchema`, `SearchDocsSchema`) |
| docs-dashboard (backend) | `src/routes.ts` (new `handleAudits`) , `src/server.ts` (route registration) |
| docs-dashboard (UI) | `ui/src/api.ts` (`fetchAudits`), `ui/src/routes/Landing.tsx` (audits section), `ui/src/routes/AuditDetail.tsx` (new), `ui/src/App.tsx` (route) |

## Component Changes

### docs-mcp

- `src/parser.ts`: `classifyCategory(path)` — accept full repo-relative path, check for `/audits/` directory segment, return `"audit"` for matches. Return type becomes `"adr" | "spec" | "audit" | null`.
- `src/tools.ts`: `ListDocsSchema.category` enum adds `"audit"`. `SearchDocsSchema.category` enum adds `"audit"`.

### docs-dashboard

- `src/routes.ts`: `handleAudits(db)` — `listDocs(db, {category: "audit"})`, returns JSON.
- `src/server.ts`: Register `GET /api/audits` → `handleAudits`.
- `ui/src/api.ts`: `fetchAudits(): Promise<ListDoc[]>` — `GET /api/audits`.
- `ui/src/routes/Landing.tsx`: Third section for audits, grouped by filename prefix (`design-`, `spec-`, `impl-`, `adr-`). Each group collapsible, expanded by default.
- `ui/src/routes/AuditDetail.tsx`: New route component. Fetches `/api/doc?path=<p>` and renders with `MarkdownView`. Minimal chrome — title + rendered markdown.
- `ui/src/App.tsx`: Add `#/audit/<path>` route dispatching to `AuditDetail`.
