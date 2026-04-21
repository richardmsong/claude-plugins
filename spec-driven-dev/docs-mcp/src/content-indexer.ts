import { Database } from "bun:sqlite";
import { statSync, readFileSync, readdirSync, existsSync, lstatSync } from "fs";
import { join, relative } from "path";
import { parseMarkdown, classifyCategory } from "./parser.js";

/**
 * Recursively collect all *.md file paths under a directory.
 * Skips symlinked directories to avoid loops.
 */
function walkMdFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = lstatSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      // Skip symlinked directories to avoid loops; skip symlinked files too
      continue;
    }
    if (stat.isDirectory()) {
      for (const nested of walkMdFiles(fullPath)) {
        results.push(nested);
      }
    } else if (stat.isFile() && entry.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

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
    // Upsert document (commit_count is owned by the lineage scanner — not touched here)
    db.run(
      `INSERT INTO documents(path, category, title, status, last_status_change, mtime)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         category = excluded.category,
         title = excluded.title,
         status = excluded.status,
         last_status_change = excluded.last_status_change,
         mtime = excluded.mtime`,
      [docPath, category, parsed.title, parsed.status, parsed.lastStatusChange, mtime]
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
 * Returns the repo-root-relative POSIX paths of files that were actually reindexed
 * (i.e. where indexFile returned true). Callers that only need the count can read
 * result.length.
 */
export function indexAllDocs(db: Database, docsDir: string, repoRoot: string): string[] {
  if (!existsSync(docsDir)) {
    console.warn(`[docs-mcp] docs/ directory not found at ${docsDir}`);
    return [];
  }

  const changed: string[] = [];
  let files: string[];
  try {
    files = walkMdFiles(docsDir);
  } catch (err) {
    console.warn(`[docs-mcp] Cannot read docs/: ${err}`);
    return [];
  }

  for (const file of files) {
    if (indexFile(db, file, repoRoot)) {
      changed.push(relative(repoRoot, file).replace(/\\/g, "/"));
    }
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
    }
  }

  return changed;
}
