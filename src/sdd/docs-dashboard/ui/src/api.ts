// Typed fetch wrappers for /api/* endpoints

export interface ListDoc {
  doc_path: string;
  title: string | null;
  category: "adr" | "spec" | "audit" | null;
  status: string | null;
  commit_count: number;
  last_status_change: string | null;
  sections: { heading: string; line_start: number; line_end: number }[];
}

export interface DocResponse {
  doc_path: string;
  title: string | null;
  category: "adr" | "spec" | "audit" | null;
  status: "draft" | "accepted" | "implemented" | "superseded" | "withdrawn" | null;
  commit_count: number;
  raw_markdown: string;
  sections: { heading: string; line_start: number; line_end: number }[];
}

export interface LineageResult {
  doc_path: string;
  doc_title: string | null;
  category: string | null;
  heading: string;
  status: string | null;
  commit_count: number;
  last_commit: string;
}

export interface SearchResult {
  doc_path: string;
  doc_title: string | null;
  category: string | null;
  heading: string;
  snippet: string;
  line_start: number;
  line_end: number;
  rank: number;
}

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
  last_commit: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(body.error ?? res.statusText), {
      status: res.status,
      body,
    });
  }
  return res.json() as Promise<T>;
}

export async function fetchAdrs(status?: string): Promise<ListDoc[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return get<ListDoc[]>(`/api/adrs${params}`);
}

export async function fetchSpecs(): Promise<ListDoc[]> {
  return get<ListDoc[]>("/api/specs");
}

export async function fetchAudits(): Promise<ListDoc[]> {
  return get<ListDoc[]>("/api/audits");
}

export async function fetchDoc(path: string): Promise<DocResponse> {
  return get<DocResponse>(`/api/doc?path=${encodeURIComponent(path)}`);
}

export async function fetchLineage(
  doc: string,
  heading?: string | null
): Promise<LineageResult[]> {
  const params = new URLSearchParams({ doc });
  if (heading) params.set("heading", heading);
  return get<LineageResult[]>(`/api/lineage?${params}`);
}

export async function fetchSearch(
  q: string,
  opts?: { limit?: number; category?: string; status?: string }
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q });
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.category) params.set("category", opts.category);
  if (opts?.status) params.set("status", opts.status);
  return get<SearchResult[]>(`/api/search?${params}`);
}

export async function fetchGraph(focus?: string): Promise<GraphResponse> {
  const params = focus ? `?focus=${encodeURIComponent(focus)}` : "";
  return get<GraphResponse>(`/api/graph${params}`);
}

// ---- Blame / Diff types (ADR-0040) ----

export interface BlameAdr {
  doc_path: string;
  title: string | null;
  status: string | null;
}

export interface BlameBlock {
  line_start: number;
  line_end: number;
  commit: string;
  author: string;
  date: string;
  summary: string;
  adrs: BlameAdr[];
}

export interface BlameResponse {
  blocks: BlameBlock[];
  uncommitted_lines: number[];
}

export interface DiffResponse {
  diff: string;
}

export async function fetchBlame(
  docPath: string,
  since?: string,
  ref?: string,
): Promise<BlameResponse> {
  const params = new URLSearchParams({ doc: docPath });
  if (since) params.set("since", since);
  if (ref) params.set("ref", ref);
  return get<BlameResponse>(`/api/blame?${params}`);
}

export async function fetchDiff(
  docPath: string,
  commit: string,
  lineStart: number,
  lineEnd: number,
): Promise<DiffResponse> {
  const params = new URLSearchParams({
    doc: docPath,
    commit,
    line_start: String(lineStart),
    line_end: String(lineEnd),
  });
  return get<DiffResponse>(`/api/diff?${params}`);
}
