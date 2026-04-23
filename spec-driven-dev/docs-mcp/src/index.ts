import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join, dirname } from "path";
import { existsSync, mkdirSync, statSync } from "fs";
import { openDb } from "./db.js";
import { indexAllDocs } from "./content-indexer.js";
import { runLineageScan } from "./lineage-scanner.js";
import { runBlameScan } from "./blame-scanner.js";
import { startWatcher } from "./watcher.js";
import {
  SearchDocsSchema,
  GetSectionSchema,
  GetLineageSchema,
  ListDocsSchema,
  searchDocs,
  getSection,
  getLineage,
  listDocs,
} from "./tools.js";

// ---- Determine docs root and git root ----

/**
 * Parse --root <path> from process.argv.
 * Returns the path if found, otherwise null.
 */
function parseRootArg(): string | null {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return null;
}

/**
 * Walk up from startDir looking for a .git directory.
 * Returns the directory containing .git, or null if none found.
 */
function findGitRoot(startDir: string): string | null {
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

// docsRoot: parent of docs/ — comes from --root or cwd fallback
const docsRoot: string = parseRootArg() ?? process.cwd();

// gitRoot: actual git root discovered by walking up from docsRoot
const gitRoot: string | null = findGitRoot(docsRoot);

if (!gitRoot) {
  console.error(
    `[docs-mcp] No .git directory found walking up from ${docsRoot}; lineage scanning disabled`
  );
}

const docsDir = join(docsRoot, "docs");

// Ensure .agent/ directory exists for the DB (always under docsRoot)
const agentDir = join(docsRoot, ".agent");
mkdirSync(agentDir, { recursive: true });
const dbPath = join(agentDir, ".docs-index.db");

console.error(
  `[docs-mcp] Starting. docsRoot=${docsRoot} gitRoot=${gitRoot ?? "(none)"} dbPath=${dbPath}`
);

// Initialize DB
const db = openDb(dbPath);

// Initial content index — use gitRoot as repoRoot so stored paths are git-root-relative
try {
  const changed = indexAllDocs(db, docsDir, gitRoot ?? docsRoot);
  console.error(`[docs-mcp] Initial content index: ${changed.length} file(s) reindexed`);
} catch (err) {
  console.error(`[docs-mcp] Initial content index error: ${err}`);
}

// Initial lineage scan — skipped if no git root
if (gitRoot) {
  try {
    runLineageScan(db, gitRoot, docsDir);
    console.error(`[docs-mcp] Initial lineage scan complete`);
  } catch (err) {
    console.error(`[docs-mcp] Initial lineage scan error: ${err}`);
  }

  // Initial blame scan — runs after lineage scan, requires git root
  try {
    runBlameScan(db, gitRoot, docsDir);
    console.error(`[docs-mcp] Initial blame scan complete`);
  } catch (err) {
    console.error(`[docs-mcp] Initial blame scan error: ${err}`);
  }
}

// Start file watcher — pass gitRoot (or docsRoot fallback) as repoRoot
const stopWatcher = startWatcher(db, docsDir, gitRoot ?? docsRoot);

// Create MCP server
const server = new McpServer({
  name: "docs",
  version: "1.0.0",
});

// Tool: search_docs
server.tool(
  "search_docs",
  "Full-text search across all indexed doc sections. Returns sections ranked by BM25 relevance.",
  SearchDocsSchema.shape,
  async (args) => {
    try {
      const results = searchDocs(db, SearchDocsSchema.parse(args));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err}` }],
        isError: true,
      };
    }
  }
);

// Tool: get_section
server.tool(
  "get_section",
  "Retrieve the full content of a specific section by doc path and heading.",
  GetSectionSchema.shape,
  async (args) => {
    try {
      const result = getSection(db, GetSectionSchema.parse(args));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err}` }],
        isError: true,
      };
    }
  }
);

// Tool: get_lineage
server.tool(
  "get_lineage",
  "Find documents or sections co-modified with a given doc/section in git history, sorted by co-commit count. " +
  "When `heading` is omitted or empty, returns doc-level lineage: one row per co-committed document, aggregated " +
  "across all sections of the queried doc — answers 'which ADRs shaped this whole spec?' in a single call. " +
  "When `heading` is provided, returns section-level lineage for that specific H2 section. " +
  "Returned rows may include superseded or withdrawn ADRs — treat those as 'tried but not current' historical context. " +
  "Drafts are 'in-progress design thinking.' Use the `status` field for framing.",
  GetLineageSchema.shape,
  async (args) => {
    try {
      const results = getLineage(db, GetLineageSchema.parse(args));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err}` }],
        isError: true,
      };
    }
  }
);

// Tool: list_docs
server.tool(
  "list_docs",
  "List all indexed documents with their sections (table of contents view). Optional category filter.",
  ListDocsSchema.shape,
  async (args) => {
    try {
      const results = listDocs(db, ListDocsSchema.parse(args));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err}` }],
        isError: true,
      };
    }
  }
);

// Connect transport
const transport = new StdioServerTransport();

process.on("SIGINT", () => {
  stopWatcher();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopWatcher();
  process.exit(0);
});

await server.connect(transport);
console.error("[docs-mcp] Server ready");
