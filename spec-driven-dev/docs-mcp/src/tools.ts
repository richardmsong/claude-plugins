import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { z } from "zod";

// ---- Type helpers ----

interface SearchResult {
  doc_path: string;
  doc_title: string | null;
  category: string | null;
  heading: string;
  snippet: string;
  line_start: number;
  line_end: number;
  rank: number;
}

interface SectionResult {
  doc_path: string;
  doc_title: string | null;
  category: string | null;
  heading: string;
  content: string;
  line_start: number;
  line_end: number;
}

interface LineageResult {
  doc_path: string;
  doc_title: string | null;
  category: string | null;
  heading: string;
  status: string | null;
  commit_count: number;
  last_commit: string;
}

interface ListDoc {
  doc_path: string;
  title: string | null;
  category: string | null;
  status: string | null;
  commit_count: number;
  last_status_change: string | null;
  sections: { heading: string; line_start: number; line_end: number }[];
}

// ---- Zod schemas ----

const AdrStatusEnum = z.enum(["draft", "accepted", "implemented", "superseded", "withdrawn"]);

export const SearchDocsSchema = z.object({
  query: z.string().describe("Search query (FTS5 syntax: words, phrases, AND/OR/NOT)"),
  category: z.enum(["adr", "spec"]).optional().describe("Filter to ADRs or specs"),
  status: AdrStatusEnum.optional().describe("Filter by ADR status (draft|accepted|implemented|superseded|withdrawn)"),
  limit: z.number().int().positive().default(10).describe("Max results (default 10)"),
});

export const GetSectionSchema = z.object({
  doc_path: z
    .string()
    .describe("Document path relative to repo root (e.g. docs/adr-2026-04-10-k8s-integration.md)"),
  heading: z.string().describe("Section heading text (e.g. Component Changes)"),
});

export const GetLineageSchema = z.object({
  doc_path: z.string().describe("Document path"),
  heading: z.string().describe("Section heading"),
});

export const ListDocsSchema = z.object({
  category: z.enum(["adr", "spec"]).optional().describe("Filter by category"),
  status: AdrStatusEnum.optional().describe("Filter by ADR status (draft|accepted|implemented|superseded|withdrawn)"),
});

// ---- Tool implementations ----

export function searchDocs(
  db: Database,
  args: z.infer<typeof SearchDocsSchema>
): SearchResult[] {
  const { query, category, status, limit } = args;

  const conditions: string[] = ["sections_fts MATCH ?"];
  const params: (string | number)[] = [query];

  if (category) {
    conditions.push("d.category = ?");
    params.push(category);
  }
  if (status) {
    conditions.push("d.status = ?");
    params.push(status);
  }
  params.push(limit);

  const sql = `
    SELECT
      d.path AS doc_path,
      d.title AS doc_title,
      d.category,
      s.heading,
      snippet(sections_fts, 1, '[', ']', '...', 32) AS snippet,
      s.line_start,
      s.line_end,
      sections_fts.rank AS rank
    FROM sections_fts
    JOIN sections s ON sections_fts.rowid = s.id
    JOIN documents d ON s.doc_id = d.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY rank
    LIMIT ?
  `;

  try {
    return db.query<SearchResult, typeof params>(sql).all(...params);
  } catch (err) {
    throw new Error(`FTS5 query error: ${err}`);
  }
}

export function getSection(
  db: Database,
  args: z.infer<typeof GetSectionSchema>
): SectionResult {
  const { doc_path, heading } = args;

  const row = db
    .query<SectionResult, [string, string]>(
      `SELECT
         d.path AS doc_path,
         d.title AS doc_title,
         d.category,
         s.heading,
         s.content,
         s.line_start,
         s.line_end
       FROM sections s
       JOIN documents d ON s.doc_id = d.id
       WHERE d.path = ? AND s.heading = ?`
    )
    .get(doc_path, heading);

  if (!row) {
    throw new Error(`Section not found: ${doc_path} / ${heading}`);
  }
  return row;
}

export function getLineage(
  db: Database,
  args: z.infer<typeof GetLineageSchema>
): LineageResult[] {
  const { doc_path, heading } = args;

  // Per ADR-0027 (amending ADR-0018): no status filter applied. All statuses
  // are returned so callers can see historical context. Superseded/withdrawn ADRs
  // are "tried but not current"; drafts are "in-progress design thinking." Use
  // the `status` field for framing rather than filtering them out.
  return db
    .query<LineageResult, [string, string]>(
      `SELECT
         l.section_b_doc AS doc_path,
         d.title AS doc_title,
         d.category,
         d.status,
         l.section_b_heading AS heading,
         l.commit_count,
         l.last_commit
       FROM lineage l
       JOIN documents d ON d.path = l.section_b_doc
       WHERE l.section_a_doc = ? AND l.section_a_heading = ?
       ORDER BY l.commit_count DESC`
    )
    .all(doc_path, heading);
}

export function listDocs(db: Database, args: z.infer<typeof ListDocsSchema>): ListDoc[] {
  const { category, status } = args;

  const conditions: string[] = [];
  const params: string[] = [];

  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT id, path, title, category, status, commit_count, last_status_change FROM documents ${where} ORDER BY path`;

  const docs = db
    .query<{
      id: number;
      path: string;
      title: string | null;
      category: string | null;
      status: string | null;
      commit_count: number;
      last_status_change: string | null;
    }, string[]>(sql)
    .all(...params);

  return docs.map((doc) => {
    const sections = db
      .query<{ heading: string; line_start: number; line_end: number }, [number]>(
        "SELECT heading, line_start, line_end FROM sections WHERE doc_id = ? ORDER BY line_start"
      )
      .all(doc.id);

    return {
      doc_path: doc.path,
      title: doc.title,
      category: doc.category,
      status: doc.status,
      commit_count: doc.commit_count,
      last_status_change: doc.last_status_change,
      sections,
    };
  });
}

// ---- Shared helpers (not MCP tools) ----

/**
 * Error thrown by readRawDoc when a document is not found.
 */
export class NotFoundError extends Error {
  constructor(docPath: string) {
    super(`Document not found: ${docPath}`);
    this.name = "NotFoundError";
  }
}

/**
 * Read the raw markdown content of a document in the docs/ tree.
 *
 * Security:
 * - The resolved path must remain inside repoRoot (rejects ".." escape).
 * - The resolved path must be inside <repoRoot>/docs/ (prevents reading
 *   non-doc files even if they are inside repoRoot).
 *
 * Throws NotFoundError if the file does not exist.
 */
export function readRawDoc(repoRoot: string, docPath: string): string {
  const absRepoRoot = resolve(repoRoot);
  const absDocsRoot = join(absRepoRoot, "docs");
  const absPath = resolve(absRepoRoot, docPath);

  // Must remain inside repoRoot
  if (!absPath.startsWith(absRepoRoot + "/") && absPath !== absRepoRoot) {
    throw new NotFoundError(docPath);
  }

  // Must be inside <repoRoot>/docs/
  if (!absPath.startsWith(absDocsRoot + "/") && absPath !== absDocsRoot) {
    throw new NotFoundError(docPath);
  }

  if (!existsSync(absPath)) {
    throw new NotFoundError(docPath);
  }

  return readFileSync(absPath, "utf8");
}
