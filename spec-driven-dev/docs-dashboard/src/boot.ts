import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { openDb } from "docs-mcp/db";
import { indexAllDocs } from "docs-mcp/content-indexer";
import { runLineageScan } from "docs-mcp/lineage-scanner";
import { startWatcher } from "docs-mcp/watcher";

/**
 * Walk up from startDir until we find a directory containing .git.
 * Returns the repo root path, or null if not found.
 */
export function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // Reached filesystem root
      return null;
    }
    dir = parent;
  }
}

export interface BootResult {
  repoRoot: string;
  db: Database;
  stopWatcher: () => void;
}

/**
 * Initialize the dashboard:
 * 1. Walk up from cwd to find the repo root (.git directory).
 * 2. Open the shared SQLite index in WAL mode (dbPath may be null → use default).
 * 3. Run indexAllDocs to populate the index.
 * 4. Start the file watcher with an onReindex callback for SSE.
 *
 * docsDir: if provided, overrides the default `<repoRoot>/docs/` directory.
 *   Resolved relative to cwd; absolute paths accepted as-is.
 *   When null, defaults to `join(repoRoot, "docs")` (ADR-0032).
 *
 * Returns repoRoot, db, and a stopWatcher function.
 * Exits non-zero if no .git directory is found.
 */
export function boot(
  dbPath: string | null,
  onReindex: (changed: string[]) => void,
  docsDir: string | null = null
): BootResult {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    console.error(
      `Error: no .git directory found walking up from ${cwd}. Cannot operate without a repo.`
    );
    process.exit(1);
  }

  const resolvedDbPath =
    dbPath ?? join(repoRoot, ".agent", ".docs-index.db");

  const db = openDb(resolvedDbPath);

  // Resolve the docs directory. When null, fall back to <repoRoot>/docs.
  // When a relative path, resolve against cwd (consistent with --db-path).
  const resolvedDocsDir = docsDir != null ? resolve(cwd, docsDir) : join(repoRoot, "docs");

  // Initial index — run synchronously on boot
  try {
    indexAllDocs(db, resolvedDocsDir, repoRoot);
  } catch (err) {
    console.error(`[dashboard] Initial index failed: ${err}`);
    // Non-fatal: continue, watcher will catch up
  }

  // Populate lineage from git log so the dashboard is self-sufficient
  // even when docs-mcp has never run against this DB (ADR-0029).
  try {
    runLineageScan(db, repoRoot);
  } catch (err) {
    console.error(`[dashboard] Lineage scan failed: ${err}`);
    // Non-fatal: dashboard still serves docs without lineage edges
  }

  const stopWatcher = startWatcher(db, resolvedDocsDir, repoRoot, onReindex);

  return { repoRoot, db, stopWatcher };
}
