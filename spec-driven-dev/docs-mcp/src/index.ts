import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join, dirname, resolve } from "path";
import { openDb } from "./db.js";
import { indexAllDocs } from "./content-indexer.js";
import { runLineageScan } from "./lineage-scanner.js";
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

// Determine repo root: two levels up from this file (mclaude-docs-mcp/src/index.ts)
const scriptDir = dirname(new URL(import.meta.url).pathname);
const repoRoot = resolve(join(scriptDir, "..", ".."));
const docsDir = join(repoRoot, "docs");
const dbPath = join(scriptDir, "..", ".docs-index.db");

console.error(`[docs-mcp] Starting. repoRoot=${repoRoot} dbPath=${dbPath}`);

// Initialize DB
const db = openDb(dbPath);

// Initial content index
try {
  const count = indexAllDocs(db, docsDir, repoRoot);
  console.error(`[docs-mcp] Initial content index: ${count} file(s) reindexed`);
} catch (err) {
  console.error(`[docs-mcp] Initial content index error: ${err}`);
}

// Initial lineage scan
try {
  runLineageScan(db, repoRoot);
  console.error(`[docs-mcp] Initial lineage scan complete`);
} catch (err) {
  console.error(`[docs-mcp] Initial lineage scan error: ${err}`);
}

// Start file watcher
const stopWatcher = startWatcher(db, docsDir, repoRoot);

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
  "Find all sections co-modified with the given section in git history, sorted by co-commit count.",
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
