import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { openDb } from "mclaude-docs-mcp/db";
import { indexAllDocs } from "mclaude-docs-mcp/content-indexer";
import { startWatcher } from "mclaude-docs-mcp/watcher";

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
 * Returns repoRoot, db, and a stopWatcher function.
 * Exits non-zero if no .git directory is found.
 */
export function boot(
  dbPath: string | null,
  onReindex: (changed: string[]) => void
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
    dbPath ?? join(repoRoot, "mclaude-docs-mcp", ".docs-index.db");

  const db = openDb(resolvedDbPath);
  const docsDir = join(repoRoot, "docs");

  // Initial index — run synchronously on boot
  try {
    indexAllDocs(db, docsDir, repoRoot);
  } catch (err) {
    console.error(`[dashboard] Initial index failed: ${err}`);
    // Non-fatal: continue, watcher will catch up
  }

  const stopWatcher = startWatcher(db, docsDir, repoRoot, onReindex);

  return { repoRoot, db, stopWatcher };
}
