import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "fs";
import { join, dirname, isAbsolute } from "path";
import { openDb } from "docs-mcp/db";
import { indexAllDocs } from "docs-mcp/content-indexer";
import { runLineageScan } from "docs-mcp/lineage-scanner";
import { runBlameScan } from "docs-mcp/blame-scanner";
import { startWatcher } from "docs-mcp/watcher";

/**
 * Resolve the docs directory for this docsRoot.
 *
 * Reads <docsRoot>/spec-driven-config.json if present:
 * - If present and parseable, uses config.spec.adr_dir (resolved relative to
 *   docsRoot when not absolute) as the docs directory — even if the resolved
 *   path does not exist on disk (honored as-given; no silent fallback).
 * - If spec.adr_dir is missing, empty, or whitespace-only: falls back to
 *   <docsRoot>/docs/.
 * - If config absent: falls back to <docsRoot>/docs/.
 * - If config present but JSON is malformed: throws an Error naming the config
 *   path and the parse failure.
 */
export function resolveDocsDir(docsRoot: string): string {
  const configPath = join(docsRoot, "spec-driven-config.json");
  if (!existsSync(configPath)) {
    return join(docsRoot, "docs");
  }

  const raw = readFileSync(configPath, "utf8");
  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const adrDir =
    config !== null &&
    typeof config === "object" &&
    "spec" in config &&
    config.spec !== null &&
    typeof config.spec === "object" &&
    "adr_dir" in config.spec
      ? (config.spec as Record<string, unknown>).adr_dir
      : undefined;

  if (typeof adrDir !== "string" || adrDir.trim() === "") {
    return join(docsRoot, "docs");
  }

  return isAbsolute(adrDir) ? adrDir : join(docsRoot, adrDir);
}

/**
 * Walk up from startDir until we find a directory containing .git.
 * Returns the git root path, or null if not found.
 */
export function findGitRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const gitDir = join(dir, ".git");
    try {
      if (existsSync(gitDir)) {
        return dir;
      }
    } catch {
      // Permission error or similar — skip
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
  gitRoot: string | null;
  db: Database;
  stopWatcher: () => void;
  docsDir: string;
}

/**
 * Initialize the dashboard:
 * 1. Open the shared SQLite index in WAL mode (dbPath may be null → defaults to
 *    <docsRoot>/.agent/.docs-index.db per ADR-0050).
 * 2. Run indexAllDocs to populate the index.
 * 3. Run lineage and blame scans.
 * 4. Start the file watcher with an onReindex callback for SSE.
 *
 * docsRoot: the already-resolved docs root (parent of docs/).
 * dbPath: explicit override for the SQLite index path; null = use default.
 *
 * Returns gitRoot (may be null if no .git found), db, and a stopWatcher function.
 */
export function boot(
  docsRoot: string,
  dbPath: string | null,
  onReindex: (changed: string[]) => void
): BootResult {
  const gitRoot = findGitRoot(docsRoot);
  if (!gitRoot) {
    console.warn(
      `[dashboard] No .git directory found walking up from ${docsRoot}; lineage and blame scanning disabled`
    );
  }

  const resolvedDbPath =
    dbPath ?? join(docsRoot, ".agent", ".docs-index.db");

  const db = openDb(resolvedDbPath);

  const docsDir = resolveDocsDir(docsRoot);

  // Initial index — run synchronously on boot
  try {
    indexAllDocs(db, docsDir, gitRoot);
  } catch (err) {
    console.error(`[dashboard] Initial index failed: ${err}`);
    // Non-fatal: continue, watcher will catch up
  }

  // Populate lineage from git log so the dashboard is self-sufficient
  // even when docs-mcp has never run against this DB (ADR-0029).
  try {
    runLineageScan(db, gitRoot, docsDir);
  } catch (err) {
    console.error(`[dashboard] Lineage scan failed: ${err}`);
    // Non-fatal: dashboard still serves docs without lineage edges
  }

  // Populate blame data for line-level lineage popover (ADR-0040).
  try {
    runBlameScan(db, gitRoot, docsDir);
  } catch (err) {
    console.error(`[dashboard] Blame scan failed: ${err}`);
    // Non-fatal: dashboard still serves docs without blame data
  }

  const stopWatcher = startWatcher(db, docsDir, gitRoot, onReindex);

  return { gitRoot, db, stopWatcher, docsDir };
}
