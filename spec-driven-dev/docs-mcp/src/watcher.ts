import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join, relative } from "path";
import { indexFile, indexAllDocs } from "./content-indexer.js";
import { runLineageScan, getHeadCommit } from "./lineage-scanner.js";

const DEBOUNCE_MS = 100;
const POLL_INTERVAL_MS = 5000;

export function startWatcher(
  db: Database,
  docsDir: string,
  repoRoot: string,
  onReindex?: (changed: string[]) => void
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHead: string | null = getHeadCommit(repoRoot);
  let stopped = false;

  const handleEvent = (event?: string, filename?: string | null) => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runReindex(event, filename);
    }, DEBOUNCE_MS);
  };

  const runReindex = (event?: string, filename?: string | null) => {
    if (stopped) return;

    const changedPaths: string[] = [];

    // If a specific .md file changed, reindex just that file
    if (filename && filename.endsWith(".md")) {
      const fullPath = join(docsDir, filename);
      try {
        const reindexed = indexFile(db, fullPath, repoRoot);
        if (reindexed) {
          changedPaths.push(relative(repoRoot, fullPath).replace(/\\/g, "/"));
        }
      } catch (err) {
        console.warn(`[docs-mcp] Error indexing ${fullPath}: ${err}`);
      }
    } else {
      // Re-stat all docs files
      try {
        const reindexed = indexAllDocs(db, docsDir, repoRoot);
        for (const p of reindexed) changedPaths.push(p);
      } catch (err) {
        console.warn(`[docs-mcp] Error during full reindex: ${err}`);
      }
    }

    // Check if HEAD moved → run lineage scan
    const currentHead = getHeadCommit(repoRoot);
    if (currentHead && currentHead !== lastHead) {
      lastHead = currentHead;
      try {
        runLineageScan(db, repoRoot);
      } catch (err) {
        console.warn(`[docs-mcp] Lineage scan error: ${err}`);
      }
    }

    // Invoke onReindex callback with deduped changed paths
    if (onReindex && changedPaths.length > 0) {
      const deduped = Array.from(new Set(changedPaths));
      onReindex(deduped);
    }
  };

  let watcher: ReturnType<typeof Bun.file> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  try {
    if (!existsSync(docsDir)) {
      console.warn(`[docs-mcp] docs/ directory not found — watching parent for creation`);
      // Watch parent directory for docs/ creation
      startPolling();
    } else {
      // Try fs.watch
      const fsWatch = require("fs").watch;
      watcher = fsWatch(docsDir, { recursive: true }, handleEvent);
    }
  } catch (err) {
    console.warn(`[docs-mcp] fs.watch unavailable (${err}) — falling back to polling`);
    startPolling();
  }

  function startPolling() {
    pollInterval = setInterval(() => {
      if (stopped) return;
      // If docs/ now exists, do a full reindex
      if (existsSync(docsDir)) {
        handleEvent();
      }
    }, POLL_INTERVAL_MS);
  }

  // Return stop function
  return () => {
    stopped = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (pollInterval) clearInterval(pollInterval);
    if (watcher && typeof (watcher as any).close === "function") {
      (watcher as any).close();
    }
  };
}
