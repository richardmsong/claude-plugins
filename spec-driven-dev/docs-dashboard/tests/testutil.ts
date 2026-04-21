import { Database } from "bun:sqlite";
import { openDb } from "mclaude-docs-mcp/db";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { indexFile } from "mclaude-docs-mcp/content-indexer";

/**
 * Create a temporary in-memory-style DB for tests.
 * Uses a temp file so WAL mode works correctly.
 */
export function createTestDb(): { db: Database; cleanup: () => void } {
  const dir = join(tmpdir(), `dashboard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "test.db");
  const db = openDb(dbPath);
  return {
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Create a temporary repo structure with docs/ directory.
 * Returns repoRoot and a cleanup function.
 */
export function createTestRepo(docs: Record<string, string>): {
  repoRoot: string;
  docsDir: string;
  cleanup: () => void;
} {
  const repoRoot = join(
    tmpdir(),
    `test-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const docsDir = join(repoRoot, "docs");
  mkdirSync(docsDir, { recursive: true });
  // Create a fake .git directory so findRepoRoot works
  mkdirSync(join(repoRoot, ".git"));

  for (const [filename, content] of Object.entries(docs)) {
    const fullPath = join(docsDir, filename);
    // Ensure subdirs exist
    const dir = fullPath.split("/").slice(0, -1).join("/");
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }

  return {
    repoRoot,
    docsDir,
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true }),
  };
}

/**
 * Seed a DB with test documents. Returns the opened DB and a cleanup fn.
 */
export function seedTestDb(docs: Record<string, string>): {
  db: Database;
  repoRoot: string;
  cleanup: () => void;
} {
  const { repoRoot, docsDir, cleanup: cleanupRepo } = createTestRepo(docs);
  const dir = join(
    tmpdir(),
    `seed-db-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "test.db");
  const db = openDb(dbPath);

  // Index each doc file
  for (const filename of Object.keys(docs)) {
    const fullPath = join(docsDir, filename);
    indexFile(db, fullPath, repoRoot);
  }

  return {
    db,
    repoRoot,
    cleanup: () => {
      db.close();
      cleanupRepo();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Seed lineage rows directly into the DB (for graph query tests).
 */
export function insertLineage(
  db: Database,
  rows: {
    section_a_doc: string;
    section_a_heading: string;
    section_b_doc: string;
    section_b_heading: string;
    commit_count: number;
    last_commit: string;
  }[]
) {
  for (const row of rows) {
    db.run(
      `INSERT OR REPLACE INTO lineage(section_a_doc, section_a_heading, section_b_doc, section_b_heading, commit_count, last_commit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.section_a_doc,
        row.section_a_heading,
        row.section_b_doc,
        row.section_b_heading,
        row.commit_count,
        row.last_commit,
      ]
    );
  }
}

/**
 * Bump commit_count on documents for testing.
 */
export function setCommitCount(db: Database, path: string, count: number) {
  db.run("UPDATE documents SET commit_count = ? WHERE path = ?", [count, path]);
}
