# ADR: Fix ADR route for nested docs directories

**Status**: implemented
**Status history**:
- 2026-04-22: accepted
- 2026-04-22: implemented — all scope CLEAN

## Overview

The dashboard's ADR detail route constructs the wrong `doc_path` when the docs directory is not at the repo root. `slugToDocPath` prepends `docs/adr-` unconditionally, but the URL slug already contains the full path when `adrSlug` cannot strip those prefixes from a nested path like `spec-driven-dev/docs/adr-0031-…`.

## Motivation

Clicking any ADR in the landing page produces a "Document not found" error when the dashboard indexes a non-root docs directory (e.g., `--docs-dir spec-driven-dev/docs`). The `doc_path` stored in the DB is `spec-driven-dev/docs/adr-0031-doc-level-lineage.md`, but `slugToDocPath` produces `docs/adr-spec-driven-dev/docs/adr-0031-doc-level-lineage.md`.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| URL slug format | Use `doc_path` minus `.md` suffix directly (same as spec routes) | Eliminates the fragile strip/re-add roundtrip. Consistent with `#/spec/<path>` which already passes `doc_path` through. |
| Keep `adrSlug` for display | Retain `adrSlug` in `Landing.tsx` for `adrLabel` fallback display only | Display formatting is separate from navigation. |

## Impact

- `Landing.tsx`: navigation call uses `doc_path.replace(/\.md$/, "")` instead of `adrSlug(doc_path)`.
- `AdrDetail.tsx`: `slugToDocPath` appends `.md` only, no prefix.
- `LineagePopover.tsx`: if it constructs `#/adr/` links, same fix applies.

## Scope

v1: fix the slug roundtrip in Landing → AdrDetail navigation and any other components that construct `#/adr/` URLs. No URL format migration needed — old URLs never worked for nested dirs.
