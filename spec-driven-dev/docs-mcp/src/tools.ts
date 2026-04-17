import { Database } from "bun:sqlite";
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
  commit_count: number;
  last_commit: string;
}

interface ListDoc {
  doc_path: string;
  title: string | null;
  category: string | null;
  sections: { heading: string; line_start: number; line_end: number }[];
}

// ---- Zod schemas ----

export const SearchDocsSchema = z.object({
  query: z.string().describe("Search query (FTS5 syntax: words, phrases, AND/OR/NOT)"),
  category: z.enum(["design", "spec"]).optional().describe("Filter to design docs or specs"),
  limit: z.number().int().positive().default(10).describe("Max results (default 10)"),
});

export const GetSectionSchema = z.object({
  doc_path: z
    .string()
    .describe("Document path relative to repo root (e.g. docs/plan-k8s-integration.md)"),
  heading: z.string().describe("Section heading text (e.g. Component Changes)"),
});

export const GetLineageSchema = z.object({
  doc_path: z.string().describe("Document path"),
  heading: z.string().describe("Section heading"),
});

export const ListDocsSchema = z.object({
  category: z.enum(["design", "spec"]).optional().describe("Filter by category"),
});

// ---- Tool implementations ----

export function searchDocs(
  db: Database,
  args: z.infer<typeof SearchDocsSchema>
): SearchResult[] {
  const { query, category, limit } = args;

  let sql: string;
  let params: (string | number)[];

  if (category) {
    sql = `
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
      WHERE sections_fts MATCH ?
        AND d.category = ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [query, category, limit];
  } else {
    sql = `
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
      WHERE sections_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [query, limit];
  }

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

  // Query lineage where our section is section_a
  // Join with documents to get doc_title and category for section_b
  // Only include results where section_b's doc still exists in the index
  return db
    .query<LineageResult, [string, string]>(
      `SELECT
         l.section_b_doc AS doc_path,
         d.title AS doc_title,
         d.category,
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
  const { category } = args;

  let docs: { id: number; path: string; title: string | null; category: string | null }[];

  if (category) {
    docs = db
      .query<
        { id: number; path: string; title: string | null; category: string | null },
        [string]
      >("SELECT id, path, title, category FROM documents WHERE category = ? ORDER BY path")
      .all(category);
  } else {
    docs = db
      .query<{ id: number; path: string; title: string | null; category: string | null }, []>(
        "SELECT id, path, title, category FROM documents ORDER BY path"
      )
      .all();
  }

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
      sections,
    };
  });
}
