# ADR: Markdown typography styles for rendered docs

**Status**: accepted
**Status history**:
- 2026-04-22: accepted

## Overview

Add a dark-theme typography stylesheet for the `.markdown-body` container used by `MarkdownView`. Currently the rendered markdown has no spacing between headings, paragraphs, lists, tables, or code blocks — everything runs together into a wall of text.

## Motivation

ADR and spec detail pages render markdown to HTML, but the only styling is `color`, `lineHeight`, and `fontSize` on the container div. Headings, paragraphs, lists, blockquotes, tables, code blocks, and horizontal rules have no margin, padding, or visual differentiation. The result is unreadable.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Delivery method | CSS file imported by `MarkdownView.tsx` | Vite handles CSS imports natively. Inline styles can't target child elements by tag name. |
| Scope | `.markdown-body` descendant selectors (h1–h6, p, ul, ol, li, table, th, td, pre, code, blockquote, hr, img) | Scoped to the markdown container to avoid leaking into the dashboard chrome. |
| Theme | Dark theme matching existing dashboard palette (`#0d1117` backgrounds, `#e2e8f0` text, `#63b3ed` links, `#2d3748` borders) | Consistent with the existing inline styles used throughout the SPA. |

## Impact

- `docs-dashboard/ui/src/components/MarkdownView.tsx` — import the new CSS file.
- `docs-dashboard/ui/src/components/markdown-body.css` — new file with typography rules.
- `docs/mclaude-docs-dashboard/spec-dashboard.md` — document the stylesheet convention.

## Scope

**In:** Spacing, font sizes, borders, and backgrounds for all standard markdown elements inside `.markdown-body`.
**Deferred:** Syntax highlighting theme (already handled by highlight.js). Custom component styling beyond standard markdown.
