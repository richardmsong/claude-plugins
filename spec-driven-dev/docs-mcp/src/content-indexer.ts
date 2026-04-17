import { Database } from "bun:sqlite";
import { statSync, readFileSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";
import { parseMarkdown, classifyCategory } from "./parser.js";

/**
 * Index (or reindex) a single markdown file.
 * Returns true if the file was reindexed, false if mtime was unchanged.
 */
export function indexFile(db: Database, filePath: string, repoRoot: string): boolean {
  let stat: { mtimeMs: number };
  try {
    stat = statSync(filePath);
  } catch {
    // File gone — remove from index
    removeFile(db, filePath, repoRoot);
    return false;
  }

  const mtime = stat.mtimeMs / 1000;
  const docPath = relative(repoRoot, filePath).replace(/\\/g, "/");

  // Check if mtime changed
  const existing = db
    .query<{ mtime: number }, [string]>("SELECT mtime FROM documents WHERE path = ?")
    .get(docPath);

  if (existing && Math.abs(existing.mtime - mtime) < 0.001) {
    return false; // unchanged
  }

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.warn(`[docs-mcp] Cannot read ${filePath}: ${err}`);
    return false;
  }

  const parsed = parseMarkdown(content);
  const category = classifyCategory(docPath);

  db.run("BEGIN");
  try {
    // Upsert document
    db.run(
      `INSERT INTO documents(path, category, title, mtime)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         category = excluded.category,
         title = excluded.title,
         mtime = excluded.mtime`,
      [docPath, category, parsed.title, mtime]
    );

    const docRow = db
      .query<{ id: number }, [string]>("SELECT id FROM documents WHERE path = ?")
      .get(docPath)!;

    // Delete old sections (triggers delete FTS entries)
    db.run("DELETE FROM sections WHERE doc_id = ?", [docRow.id]);

    // Insert new sections (triggers add FTS entries)
    const insertSection = db.prepare(
      `INSERT INTO sections(doc_id, heading, content, line_start, line_end)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const section of parsed.sections) {
      insertSection.run(docRow.id, section.heading, section.content, section.lineStart, section.lineEnd);
    }

    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }

  return true;
}

/**
 * Remove a document and all its sections from the index.
 */
export function removeFile(db: Database, filePath: string, repoRoot: string): void {
  const docPath = relative(repoRoot, filePath).replace(/\\/g, "/");
  db.run("DELETE FROM documents WHERE path = ?", [docPath]);
}

/**
 * Index all .md files in the docs/ directory.
 * Returns count of files reindexed.
 */
export function indexAllDocs(db: Database, docsDir: string, repoRoot: string): number {
  if (!existsSync(docsDir)) {
    console.warn(`[docs-mcp] docs/ directory not found at ${docsDir}`);
    return 0;
  }

  let count = 0;
  let files: string[];
  try {
    files = readdirSync(docsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(docsDir, f));
  } catch (err) {
    console.warn(`[docs-mcp] Cannot read docs/: ${err}`);
    return 0;
  }

  for (const file of files) {
    if (indexFile(db, file, repoRoot)) count++;
  }

  // Remove DB entries for files that no longer exist on disk
  const docPaths = files.map((f) => relative(repoRoot, f).replace(/\\/g, "/"));
  const allIndexed = db
    .query<{ path: string }, []>(
      "SELECT path FROM documents WHERE path LIKE 'docs/%.md'"
    )
    .all();

  for (const row of allIndexed) {
    if (!docPaths.includes(row.path)) {
      db.run("DELETE FROM documents WHERE path = ?", [row.path]);
      count++;
    }
  }

  return count;
}
