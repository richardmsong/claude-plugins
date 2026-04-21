import { Database } from "bun:sqlite";

export interface GraphNode {
  path: string;
  title: string | null;
  category: "adr" | "spec" | null;
  status: string | null;
  commit_count: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  count: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Global graph query: all docs as nodes, all doc-pair edges aggregated from
 * section-level lineage rows.
 *
 * Edges are canonicalized as undirected pairs via MIN/MAX on the doc path strings.
 * The caller applies sidebar filters (ADR↔spec default; optional ADR↔ADR, spec↔spec)
 * in JS by joining each edge against node categories.
 */
export function globalGraphQuery(db: Database): GraphResponse {
  const nodes = db
    .query<GraphNode, []>(
      `SELECT path, title, category, status, commit_count FROM documents`
    )
    .all();

  const rawEdges = db
    .query<{ from_path: string; to_path: string; count: number }, []>(
      `SELECT
         MIN(section_a_doc, section_b_doc) AS from_path,
         MAX(section_a_doc, section_b_doc) AS to_path,
         SUM(commit_count)                 AS count
       FROM lineage
       WHERE section_a_doc != section_b_doc
       GROUP BY MIN(section_a_doc, section_b_doc), MAX(section_a_doc, section_b_doc)`
    )
    .all();

  const edges: GraphEdge[] = rawEdges.map((r) => ({
    from: r.from_path,
    to: r.to_path,
    count: r.count,
  }));

  return { nodes, edges };
}

/**
 * Local (1-hop) graph query for a specific focus doc.
 *
 * Step 1: fetch all edges incident to focus (undirected canonicalization).
 * Step 2: build the neighbor set from the edge results in JS.
 * Step 3: fetch the focus + neighbor nodes in a single IN query.
 *
 * All edge categories are included in local mode (no sidebar filtering).
 */
export function localGraphQuery(db: Database, focus: string): GraphResponse {
  const rawEdges = db
    .query<{ from_path: string; to_path: string; count: number }, [string, string]>(
      `SELECT
         MIN(section_a_doc, section_b_doc) AS from_path,
         MAX(section_a_doc, section_b_doc) AS to_path,
         SUM(commit_count)                 AS count
       FROM lineage
       WHERE (section_a_doc = ? OR section_b_doc = ?)
         AND section_a_doc != section_b_doc
       GROUP BY MIN(section_a_doc, section_b_doc), MAX(section_a_doc, section_b_doc)`
    )
    .all(focus, focus);

  const edges: GraphEdge[] = rawEdges.map((r) => ({
    from: r.from_path,
    to: r.to_path,
    count: r.count,
  }));

  // Build neighbor set from edges
  const pathSet = new Set<string>([focus]);
  for (const e of rawEdges) {
    pathSet.add(e.from_path);
    pathSet.add(e.to_path);
  }
  const paths = Array.from(pathSet);

  // Fetch nodes: focus + all neighbors — single query (2-query pattern, not N+1)
  const placeholders = paths.map(() => "?").join(", ");
  const nodes = db
    .query<GraphNode, string[]>(
      `SELECT path, title, category, status, commit_count
       FROM documents
       WHERE path IN (${placeholders})`
    )
    .all(...paths);

  return { nodes, edges };
}
