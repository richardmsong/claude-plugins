# Docs MCP Server

**Status**: implemented
**Status history**:
- 2026-04-17: accepted
- 2026-04-22: implemented — retroactive promotion, all scope verified


> **Note:** The `Category Classification` section of this ADR is superseded by `adr-0021-docs-plan-spec-refactor.md`. Current classifier: `adr-*` → `'adr'`, `spec-*` → `'spec'`, `feature-list*` → `'spec'`, everything else → `null`. The `'design'` category has been renamed to `'adr'`.

## Overview

An MCP server that indexes the `docs/` directory into a SQLite + FTS5 database, exposing structured search, section retrieval, and git-derived lineage queries. Agents can ask "what design decisions led to this spec section?" or "find everything about NATS security" without grepping through 20+ markdown files. No LLM, no vectors — just structured indexing and full-text search over the doc corpus with relationship tracking derived from git history.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (bun) | Same `@modelcontextprotocol/sdk` as mclaude-mcp. Bun runtime (not Node) for native `bun:sqlite` with FTS5. Separate package with its own tsconfig targeting Bun. |
| Transport | stdio | Standard MCP pattern. Registered in `.mcp.json`, auto-enabled by `enableAllProjectMcpServers`. |
| Search engine | SQLite FTS5 with BM25 ranking | No external dependencies. FTS5 is built into bun:sqlite. BM25 gives relevance-ranked results out of the box. |
| Doc categorization | Filename prefix convention | `plan-*`, `design-*` → design docs. `spec-*`, `schema-*`, `ui-spec*` → specs. No frontmatter needed. Aligns with planned doc reorganization. |
| Section granularity | `##` (H2) level | Primary structural unit in all design docs. Each H2 section becomes one searchable row with its own lineage. Sub-headings (###, ####) are included in the parent section's content. |
| Content reindex trigger | `fs.watch` on `docs/` | Always reflects what's on disk, even uncommitted changes. Agent sees current file state in real time. |
| Lineage reindex trigger | Git log scan on startup + on new commits detected | Lineage is historical (co-committed changes). Rebuilt when the server starts, then incrementally when the file watcher fires and `HEAD` has changed since the last scan. |
| DB location | `mclaude-docs-mcp/.docs-index.db` | Co-located with server code. Gitignored via `mclaude-docs-mcp/.gitignore` (pattern: `.docs-index.db`). Also add `*.db` to repo root `.gitignore`. Rebuilt from scratch if deleted. |
| Server directory | `mclaude-docs-mcp/` | Separate package from mclaude-mcp (different concern: doc knowledge vs session management). |

## Data Model

### SQLite Schema

```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,    -- relative to repo root: docs/adr-YYYY-MM-DD-foo.md
  category TEXT,                -- 'design' | 'spec' | null
  title TEXT,                   -- H1 heading (first # line)
  mtime REAL NOT NULL           -- file mtime at last index
);

CREATE TABLE sections (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  heading TEXT NOT NULL,        -- the ## heading text (without ##)
  content TEXT NOT NULL,        -- full section content including sub-headings
  line_start INTEGER NOT NULL,  -- 1-based starting line in file
  line_end INTEGER NOT NULL     -- 1-based ending line (inclusive)
);

CREATE VIRTUAL TABLE sections_fts USING fts5(
  heading,
  content,
  content='sections',
  content_rowid='id'
);

-- Triggers to keep FTS in sync with sections table
CREATE TRIGGER sections_ai AFTER INSERT ON sections BEGIN
  INSERT INTO sections_fts(rowid, heading, content)
  VALUES (new.id, new.heading, new.content);
END;

CREATE TRIGGER sections_ad AFTER DELETE ON sections BEGIN
  INSERT INTO sections_fts(sections_fts, rowid, heading, content)
  VALUES ('delete', old.id, old.heading, old.content);
END;

CREATE TRIGGER sections_au AFTER UPDATE ON sections BEGIN
  INSERT INTO sections_fts(sections_fts, rowid, heading, content)
  VALUES ('delete', old.id, old.heading, old.content);
  INSERT INTO sections_fts(rowid, heading, content)
  VALUES (new.id, new.heading, new.content);
END;

-- Lineage: co-committed section relationships
CREATE TABLE lineage (
  section_a_doc TEXT NOT NULL,     -- doc path (docs/adr-YYYY-MM-DD-foo.md)
  section_a_heading TEXT NOT NULL, -- heading text
  section_b_doc TEXT NOT NULL,
  section_b_heading TEXT NOT NULL,
  commit_count INTEGER NOT NULL DEFAULT 1,
  last_commit TEXT NOT NULL,       -- most recent commit hash
  PRIMARY KEY (section_a_doc, section_a_heading, section_b_doc, section_b_heading)
);
```

Lineage uses doc path + heading as the key (not section IDs) because section IDs change on every reindex. When the content reindexes, lineage survives. When lineage reindexes, it rebuilds from git history regardless of current section IDs.

### Category Classification

```
Filename matches          → Category
plan-*, design-*          → 'design'
spec-*, schema-*, ui-spec → 'spec'
feature-list*             → 'spec'
everything else           → null
```

Applied during document indexing. Category is stored on the `documents` row, not the section.

## MCP Tools

### `search_docs`

Full-text search across all indexed sections.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query (FTS5 syntax: words, phrases, AND/OR/NOT) |
| `category` | `'design' \| 'spec'` | no | Filter to only design docs or only specs |
| `limit` | number | no | Max results (default 10) |

Returns: array of `{ doc_path, doc_title, category, heading, snippet, line_start, line_end, rank }` sorted by BM25 relevance.

The `snippet` is a FTS5 snippet (highlighted match context, ~32 tokens / ~200 chars, bracketed highlights). For the full section content, use `get_section`.

### `get_section`

Retrieve the full content of a specific section.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `doc_path` | string | yes | Document path relative to repo root (e.g. `docs/adr-0003-k8s-integration.md`) |
| `heading` | string | yes | Section heading text (e.g. `Component Changes`) |

Returns: `{ doc_path, doc_title, category, heading, content, line_start, line_end }` or error if not found.

### `get_lineage`

Given a section, find all sections that have been co-modified with it in git history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `doc_path` | string | yes | Document path |
| `heading` | string | yes | Section heading |

Returns: array of `{ doc_path, doc_title, category, heading, commit_count, last_commit }` sorted by `commit_count` descending (strongest relationships first).

The query joins `lineage` with `documents` (on `section_*_doc = documents.path`) to populate `doc_title` and `category`. If a lineage-referenced doc no longer exists in the index (file was deleted), that lineage entry is omitted from results.

Use case: "I'm looking at the NATS security spec — what design sections informed it?"

### `list_docs`

List all indexed documents with their sections (table of contents view).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | `'design' \| 'spec'` | no | Filter by category |

Returns: array of `{ doc_path, title, category, sections: [{ heading, line_start, line_end }] }`.

## Indexing

### Content Indexing (file watcher)

On startup and on `fs.watch` events for `docs/*.md`:

```
1. Stat the file → get mtime
2. If mtime unchanged from DB → skip
3. Read file content
4. Parse: extract H1 title, split on ## headings
5. Classify category from filename
6. BEGIN TRANSACTION
7. Upsert document row
8. Delete old sections for this doc
9. Insert new sections (triggers update FTS)
10. COMMIT
```

Steps 7–9 are wrapped in a single transaction. A crash between delete and insert cannot leave the FTS external content table out of sync.

Section parsing splits on lines matching `^## ` (H2). Each section runs from its `## ` line to the line before the next `## ` (or EOF). The H1 line and any preamble before the first `##` are stored as the document title but not as a section.

File deletions (detected by `fs.watch` or by missing file on reindex) remove the document and all its sections (CASCADE).

### Lineage Indexing (git-derived)

On startup and when new commits are detected:

```
1. Get last processed commit hash from DB (metadata table, key 'last_lineage_commit')
   - If null (first run): scan full git history — use the empty-tree SHA as the base:
     git log --reverse --format=%H -- docs/*.md
2. Otherwise: git log <last_commit>..HEAD --reverse --format=%H -- docs/*.md
   (Lists commit hashes between last processed and HEAD that touch docs/)
3. For each commit hash:
   a. Get the list of modified files:
      git diff-tree --no-commit-id -r --name-only <commit> -- docs/*.md
      For root commits (no parent): git diff-tree --no-commit-id -r --name-only --root <commit> -- docs/*.md
   b. If fewer than 2 files modified → skip (no cross-doc lineage possible)
   c. For each modified file: git show <commit>:<file> to get the file at that commit
   d. Parse each file into ## sections (same parser as content indexing) to get section boundaries at that point in history
   e. Get the diff hunks:
      - Normal commits: git diff <commit>~1..<commit> -- docs/*.md
      - Root commit (no parent): git diff-tree -p --root <commit> -- docs/*.md
   f. Map each hunk to the section it falls within (by line range overlap)
   g. For every cross-doc pair of (doc_a.section_x, doc_b.section_y) modified in this commit:
      - Upsert lineage row, increment commit_count, update last_commit
4. Store current HEAD as last processed commit
```

Section boundaries are derived from the file at the commit's version (`git show <commit>:<path>`), not from the current on-disk version. This ensures hunk-to-section mapping is accurate even when sections have moved or been renamed since that commit.

Root commit handling: the repository's first commit has no parent. `git diff-tree --root` and `git diff-tree -p --root` handle this case by treating the empty tree as the parent. Detect root commits by checking if `<commit>~1` resolves (or by checking `git rev-list --parents -1 <commit>` for a single hash with no parent).

Single-doc commits produce no lineage edges — lineage only captures cross-doc relationships.

### Metadata Table

```sql
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Stores: last_lineage_commit, schema_version
```

## File Watcher

The server uses `fs.watch` (Bun built-in) on the `docs/` directory with `recursive: true`. On macOS (primary target), this uses FSEvents and is reliable. On Linux, `recursive: true` may not be supported — if `fs.watch` throws on setup, fall back to polling (stat all `docs/*.md` files every 5 seconds). Events are debounced (100ms) to batch rapid saves.

On each debounced event:
1. Re-stat all `docs/*.md` files
2. Reindex any with changed mtime (content indexing)
3. Check if `HEAD` has moved since last lineage scan → if yes, run lineage indexing

The watcher runs for the lifetime of the MCP server process (started on connect, stopped on disconnect).

## Registration

Create `.mcp.json` at repo root (does not currently exist — no existing server registrations to preserve):

```json
{
  "mcpServers": {
    "docs": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "mclaude-docs-mcp/src/index.ts"]
    }
  }
}
```

Claude Code runs stdio MCP servers from the project root directory by default (the directory containing `.mcp.json`), so no `cwd` field is needed.

`enableAllProjectMcpServers: true` in the user's Claude Code settings auto-enables all servers in `.mcp.json`.

## Error Handling

| Failure | Behavior |
|---------|----------|
| `docs/` directory doesn't exist | Server starts with empty index. Logs warning. Watches parent for `docs/` creation. |
| SQLite DB corrupt or schema mismatch | Delete DB file, rebuild from scratch. All data is derived — nothing is lost. |
| Git not available (no `.git/`) | Content indexing works normally. Lineage indexing is skipped (no git history). Logs info message. |
| `fs.watch` not supported | Falls back to polling (stat all files every 5s). Logs warning. |
| FTS5 query syntax error | Return error message to the agent with the invalid query. Don't crash. |
| File read error during reindex | Skip the file, log warning, continue with other files. Retry on next watch event. |

## Scope

**In scope (v1):**
- SQLite + FTS5 search over `docs/*.md`
- H2 section-level indexing
- Git-derived lineage (co-committed cross-doc sections)
- File watcher for live content updates
- 4 MCP tools: `search_docs`, `get_section`, `get_lineage`, `list_docs`
- Filename-based category classification
- `.mcp.json` registration

**Deferred:**
- Recursive subdirectory watching (e.g. `docs/design/`, `docs/spec/`) — add when doc reorganization happens
- Cross-reference parsing (explicit `docs/adr-*.md` links in text) — git lineage covers most cases
- Section-level diff display in lineage results — just knowing the relationship exists is enough for now
- MCP resources (browsable doc list) — tools are sufficient, agents query when needed
- Webhook/API for external indexing triggers — file watcher covers the local use case

## Implementation Plan

| Component | New/changed lines (est.) | Dev-harness tokens (est.) | Notes |
|-----------|--------------------------|---------------------------|-------|
| `mclaude-docs-mcp/` package setup | 20 | ~30k | package.json, tsconfig, gitignore |
| SQLite schema + migration | 40 | included above | Tables, FTS5, triggers, metadata |
| Markdown parser | 60 | ~60k | Split file into H2 sections, extract title, classify category |
| Git lineage scanner | 100 | ~80k | Parse git log + diff, map hunks to sections, upsert lineage |
| File watcher | 40 | included above | fs.watch with debounce, mtime check, trigger reindex |
| MCP tool handlers | 120 | ~60k | 4 tools with FTS5 queries, lineage joins, list queries |
| Server entry point | 30 | included above | McpServer setup, stdio transport, connect watcher |
| `.mcp.json` registration | 5 | ~10k | Create/update project MCP config |
| Tests | 100 | included above | Unit tests for parser, lineage, FTS queries |

**Total estimated lines:** ~515
**Total estimated tokens:** ~240k
**Estimated wall-clock:** <1h
