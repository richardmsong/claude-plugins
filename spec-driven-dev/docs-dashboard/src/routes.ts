import { Database } from "bun:sqlite";
import { listDocs, readRawDoc, getSection, getLineage, searchDocs, NotFoundError } from "mclaude-docs-mcp/tools";
import { globalGraphQuery, localGraphQuery } from "./graph-queries.js";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

function notFound(path: string): Response {
  return json({ error: "not found", path }, 404);
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

/**
 * GET /api/adrs?status=<s>
 * Returns: ListDoc[] for ADRs, optionally filtered by status.
 */
export function handleAdrs(db: Database, url: URL): Response {
  const status = url.searchParams.get("status") ?? undefined;
  const validStatuses = ["draft", "accepted", "implemented", "superseded", "withdrawn"];
  if (status && !validStatuses.includes(status)) {
    return badRequest(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`);
  }
  const docs = listDocs(db, {
    category: "adr",
    status: status as "draft" | "accepted" | "implemented" | "superseded" | "withdrawn" | undefined,
  });
  return json(docs);
}

/**
 * GET /api/specs
 * Returns: ListDoc[] for specs.
 */
export function handleSpecs(db: Database): Response {
  const docs = listDocs(db, { category: "spec" });
  return json(docs);
}

/**
 * GET /api/doc?path=<p>
 * Returns: DocResponse — metadata + raw_markdown + sections.
 */
export function handleDoc(db: Database, repoRoot: string, url: URL): Response {
  const docPath = url.searchParams.get("path");
  if (!docPath) {
    return badRequest("Missing required query param: path");
  }

  // Get doc metadata via listDocs — finds by path
  const allDocs = listDocs(db, {});
  const doc = allDocs.find((d) => d.doc_path === docPath);
  if (!doc) {
    return notFound(docPath);
  }

  // Read raw markdown
  let rawMarkdown: string;
  try {
    rawMarkdown = readRawDoc(repoRoot, docPath);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return notFound(docPath);
    }
    throw err;
  }

  const response = {
    doc_path: doc.doc_path,
    title: doc.title,
    category: doc.category,
    status: doc.status,
    commit_count: doc.commit_count,
    raw_markdown: rawMarkdown,
    sections: doc.sections,
  };

  return json(response);
}

/**
 * GET /api/lineage?doc=<p>&heading=<h>
 * Returns: LineageResult[]
 */
export function handleLineage(db: Database, url: URL): Response {
  const docPath = url.searchParams.get("doc");
  const heading = url.searchParams.get("heading");

  if (!docPath) {
    return badRequest("Missing required query param: doc");
  }
  if (!heading) {
    return badRequest("Missing required query param: heading");
  }

  try {
    const results = getLineage(db, { doc_path: docPath, heading });
    return json(results);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return notFound(docPath);
    }
    return notFound(docPath);
  }
}

/**
 * GET /api/search?q=<q>&limit=<n>&category=<c>&status=<s>
 * Returns: SearchResult[]
 */
export function handleSearch(db: Database, url: URL): Response {
  const q = url.searchParams.get("q");
  if (!q) {
    return badRequest("Missing required query param: q");
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 10;
  if (isNaN(limit) || limit <= 0) {
    return badRequest("Invalid limit param");
  }

  const category = url.searchParams.get("category") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const validCategories = ["adr", "spec"];
  if (category && !validCategories.includes(category)) {
    return badRequest(`Invalid category: ${category}`);
  }
  const validStatuses = ["draft", "accepted", "implemented", "superseded", "withdrawn"];
  if (status && !validStatuses.includes(status)) {
    return badRequest(`Invalid status: ${status}`);
  }

  try {
    const results = searchDocs(db, {
      query: q,
      limit,
      category: category as "adr" | "spec" | undefined,
      status: status as "draft" | "accepted" | "implemented" | "superseded" | "withdrawn" | undefined,
    });
    return json(results);
  } catch (err) {
    // FTS5 syntax error
    return badRequest(`Search error: ${err}`);
  }
}

/**
 * GET /api/graph?focus=<p>
 * Returns: GraphResponse — nodes + edges.
 * Global mode when focus is absent; local 1-hop mode when focus is provided.
 */
export function handleGraph(db: Database, url: URL): Response {
  const focus = url.searchParams.get("focus");

  if (focus) {
    const result = localGraphQuery(db, focus);
    return json(result);
  } else {
    const result = globalGraphQuery(db);
    return json(result);
  }
}
