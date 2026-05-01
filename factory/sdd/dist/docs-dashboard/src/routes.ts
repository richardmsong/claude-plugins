import { Database } from "bun:sqlite";
import { listDocs, readRawDoc, getLineage, searchDocs, NotFoundError } from "docs-mcp/tools";
import { globalGraphQuery, localGraphQuery } from "./graph-queries.js";
import { spawnSync } from "child_process";

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
 * GET /api/audits
 * Returns: ListDoc[] for audit reports (ADR-0074).
 */
export function handleAudits(db: Database): Response {
  const docs = listDocs(db, { category: "audit" });
  return json(docs);
}

/**
 * GET /api/doc?path=<p>
 * Returns: DocResponse — metadata + raw_markdown + sections.
 */
export function handleDoc(db: Database, repoRoot: string | null, url: URL): Response {
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
  if (!repoRoot) {
    return json({ error: "git root not available; cannot read doc" }, 503);
  }
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
 * GET /api/lineage?doc=<p>[&heading=<h>]
 *
 * When heading is omitted (or empty), returns doc-level lineage: one row per
 * co-committed document, aggregated across all sections of the queried doc
 * (ADR-0031). When heading is provided, returns section-level lineage for that
 * heading (existing behaviour).
 *
 * Returns: LineageResult[]
 */
export function handleLineage(db: Database, url: URL): Response {
  const docPath = url.searchParams.get("doc");
  // heading is optional per ADR-0031: absent/empty -> doc mode
  const headingParam = url.searchParams.get("heading");
  const heading = headingParam || undefined;

  if (!docPath) {
    return badRequest("Missing required query param: doc");
  }

  try {
    const results = getLineage(db, { doc_path: docPath, heading });
    return json(results);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return notFound(docPath);
    }
    // Any other error (DB error, SQL error, etc.) is a real server error -- re-throw
    // so Bun.serve's error handler emits a 500. Masking it as a 404 would hide bugs.
    throw err;
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

  const validCategories = ["adr", "spec", "audit"];
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
      category: category as "adr" | "spec" | "audit" | undefined,
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
 * Returns: GraphResponse -- nodes + edges.
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

// ---- Blame types ----

interface BlameBlock {
  line_start: number;
  line_end: number;
  commit: string;
  author: string;
  date: string;
  summary: string;
  adrs: {
    doc_path: string;
    title: string | null;
    status: string | null;
  }[];
}

/**
 * GET /api/blame?doc=<p>[&since=<date>&ref=<branch>]
 *
 * Returns per-block blame + lineage data. Reads from the blame_lines table and
 * self-joins on commit hash to find ADR docs co-modified in the same commit.
 *
 * When since or ref params are provided, blame is computed on demand via
 * git blame instead of reading from the cached table.
 */
export function handleBlame(db: Database, repoRoot: string | null, url: URL): Response {
  const docPath = url.searchParams.get("doc");
  if (!docPath) {
    return badRequest("Missing required query param: doc");
  }

  const since = url.searchParams.get("since") ?? null;
  const ref = url.searchParams.get("ref") ?? null;

  // Look up the document in the DB
  const docRow = db
    .query<{ id: number }, [string]>("SELECT id FROM documents WHERE path = ?")
    .get(docPath);

  if (!docRow) {
    return notFound(docPath);
  }

  const docId = docRow.id;

  // When since or ref is provided, compute blame on demand from git
  if (since || ref) {
    if (!repoRoot) {
      return json({ blocks: [], uncommitted_lines: [] });
    }
    return handleBlameOnDemand(db, repoRoot, docPath, docId, since, ref);
  }

  // Read from blame_lines table, self-join on commit to find co-modified ADRs.
  // "commit" is a reserved word in SQLite -- must be quoted.
  const blameRows = db
    .query<
      {
        line_start: number;
        line_end: number;
        commit: string;
        author: string;
        date: string;
        summary: string;
      },
      [number]
    >(
      `SELECT line_start, line_end, "commit", author, date, summary
       FROM blame_lines
       WHERE doc_id = ?
       ORDER BY line_start`
    )
    .all(docId);

  const blocks: BlameBlock[] = [];

  for (const row of blameRows) {
    // Self-join: find other docs modified in the same commit
    const coModified = db
      .query<
        { doc_path: string; title: string | null; status: string | null },
        [string, number]
      >(
        `SELECT d.path AS doc_path, d.title, d.status
         FROM blame_lines bl
         JOIN documents d ON d.id = bl.doc_id
         WHERE bl."commit" = ? AND bl.doc_id != ?
         GROUP BY d.id`
      )
      .all(row.commit, docId);

    blocks.push({
      line_start: row.line_start,
      line_end: row.line_end,
      commit: row.commit,
      author: row.author,
      date: row.date,
      summary: row.summary,
      adrs: coModified,
    });
  }

  // Determine uncommitted lines: lines not present in blame_lines.
  const uncommittedLines = repoRoot ? findUncommittedLines(repoRoot, docPath, blameRows) : [];

  return json({ blocks, uncommitted_lines: uncommittedLines });
}

/**
 * On-demand blame (when since or ref params are provided).
 * Runs git blame with the appropriate filter and builds the response.
 */
function handleBlameOnDemand(
  db: Database,
  repoRoot: string,
  docPath: string,
  docId: number,
  since: string | null,
  ref: string | null
): Response {
  const absPath = `${repoRoot}/${docPath}`;
  const gitArgs: string[] = ["blame", "--porcelain"];
  if (since) gitArgs.push(`--since=${since}`);
  if (ref) {
    // git blame <ref> -- <file>
    gitArgs.push(ref, "--");
  }
  gitArgs.push(absPath);

  const result = spawnSync("git", gitArgs, {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    // git not available or file not tracked -- return empty
    return json({ blocks: [], uncommitted_lines: [] });
  }

  const parsed = parsePorcelainSimple(result.stdout);
  const blocks: BlameBlock[] = [];

  for (const row of parsed) {
    // Join against DB to find co-modified ADRs
    const coModified = db
      .query<
        { doc_path: string; title: string | null; status: string | null },
        [string, number]
      >(
        `SELECT d.path AS doc_path, d.title, d.status
         FROM blame_lines bl
         JOIN documents d ON d.id = bl.doc_id
         WHERE bl."commit" = ? AND bl.doc_id != ?
         GROUP BY d.id`
      )
      .all(row.commit, docId);

    blocks.push({
      line_start: row.lineStart,
      line_end: row.lineEnd,
      commit: row.commit,
      author: row.author,
      date: row.date,
      summary: row.summary,
      adrs: coModified,
    });
  }

  return json({ blocks, uncommitted_lines: [] });
}

/**
 * Minimal porcelain parser for on-demand blame (returns grouped ranges).
 */
function parsePorcelainSimple(
  output: string
): { lineStart: number; lineEnd: number; commit: string; author: string; date: string; summary: string }[] {
  const lines = output.split("\n");
  const rawLines: { lineNum: number; commit: string; author: string; date: string; summary: string }[] = [];
  const commitCache = new Map<string, { author: string; date: string; summary: string }>();

  let i = 0;
  let currentCommit = "";
  let currentAuthor = "";
  let currentDate = "";
  let currentSummary = "";

  while (i < lines.length) {
    const line = lines[i];
    const headerMatch = line.match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/);
    if (headerMatch) {
      currentCommit = headerMatch[1];
      const resultLine = parseInt(headerMatch[2], 10);

      if (commitCache.has(currentCommit)) {
        const cached = commitCache.get(currentCommit)!;
        currentAuthor = cached.author;
        currentDate = cached.date;
        currentSummary = cached.summary;
        i++;
        while (i < lines.length && !lines[i].startsWith("\t")) i++;
        if (i < lines.length && lines[i].startsWith("\t")) {
          rawLines.push({ lineNum: resultLine, commit: currentCommit, author: currentAuthor, date: currentDate, summary: currentSummary });
        }
        i++;
        continue;
      }

      currentAuthor = "";
      currentDate = "";
      currentSummary = "";
      i++;

      while (i < lines.length && !lines[i].startsWith("\t")) {
        const meta = lines[i];
        if (meta.startsWith("author ")) currentAuthor = meta.slice("author ".length).trim();
        else if (meta.startsWith("author-time ")) {
          const ts = parseInt(meta.slice("author-time ".length).trim(), 10);
          currentDate = new Date(ts * 1000).toISOString().slice(0, 10);
        } else if (meta.startsWith("summary ")) currentSummary = meta.slice("summary ".length).trim();
        i++;
      }

      commitCache.set(currentCommit, { author: currentAuthor, date: currentDate, summary: currentSummary });

      if (i < lines.length && lines[i].startsWith("\t")) {
        rawLines.push({ lineNum: resultLine, commit: currentCommit, author: currentAuthor, date: currentDate, summary: currentSummary });
      }
      i++;
      continue;
    }
    i++;
  }

  rawLines.sort((a, b) => a.lineNum - b.lineNum);

  const grouped: { lineStart: number; lineEnd: number; commit: string; author: string; date: string; summary: string }[] = [];
  for (const raw of rawLines) {
    const last = grouped[grouped.length - 1];
    if (last && last.commit === raw.commit && last.lineEnd === raw.lineNum - 1) {
      last.lineEnd = raw.lineNum;
    } else {
      grouped.push({ lineStart: raw.lineNum, lineEnd: raw.lineNum, commit: raw.commit, author: raw.author, date: raw.date, summary: raw.summary });
    }
  }

  return grouped;
}

/**
 * Determine line numbers not covered by blame_lines (uncommitted/working-copy lines).
 */
function findUncommittedLines(
  repoRoot: string,
  docPath: string,
  blameRows: { line_start: number; line_end: number }[]
): number[] {
  const absPath = `${repoRoot}/${docPath}`;
  const result = spawnSync("wc", ["-l", absPath], { encoding: "utf-8" });
  if (result.status !== 0) return [];

  const lineCount = parseInt(result.stdout.trim().split(/\s+/)[0], 10);
  if (isNaN(lineCount) || lineCount <= 0) return [];

  const blamed = new Set<number>();
  for (const row of blameRows) {
    for (let l = row.line_start; l <= row.line_end; l++) {
      blamed.add(l);
    }
  }

  const uncommitted: number[] = [];
  for (let l = 1; l <= lineCount; l++) {
    if (!blamed.has(l)) uncommitted.push(l);
  }
  return uncommitted;
}

/**
 * GET /api/diff?doc=<p>&commit=<hash>&line_start=<n>&line_end=<n>
 *
 * Runs git show <commit> -- <file> and extracts only the diff hunks that
 * overlap the requested [line_start, line_end] range.
 * Returns: { diff: string }
 */
export function handleDiff(repoRoot: string | null, url: URL): Response {
  const docPath = url.searchParams.get("doc");
  const commit = url.searchParams.get("commit");
  const lineStartParam = url.searchParams.get("line_start");
  const lineEndParam = url.searchParams.get("line_end");

  if (!docPath) return badRequest("Missing required query param: doc");
  if (!commit) return badRequest("Missing required query param: commit");
  if (!lineStartParam) return badRequest("Missing required query param: line_start");
  if (!lineEndParam) return badRequest("Missing required query param: line_end");

  const lineStart = parseInt(lineStartParam, 10);
  const lineEnd = parseInt(lineEndParam, 10);
  if (isNaN(lineStart) || isNaN(lineEnd) || lineStart < 1 || lineEnd < lineStart) {
    return badRequest("Invalid line_start or line_end");
  }

  // Validate commit hash (must be hex string)
  if (!/^[0-9a-f]{4,40}$/i.test(commit)) {
    return badRequest("Invalid commit hash");
  }

  if (!repoRoot) {
    return json({ diff: "" });
  }

  const absPath = `${repoRoot}/${docPath}`;
  const result = spawnSync("git", ["show", commit, "--", absPath], {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    // Commit not found or git not available
    return json({ diff: "" });
  }

  const extractedDiff = extractHunks(result.stdout, lineStart, lineEnd);
  return json({ diff: extractedDiff });
}

/**
 * Extract diff hunks from git show output that overlap [lineStart, lineEnd].
 *
 * A hunk overlaps [lineStart, lineEnd] if its new-file range intersects it:
 * new_start <= lineEnd && (new_start + new_count - 1) >= lineStart
 */
function extractHunks(gitShowOutput: string, lineStart: number, lineEnd: number): string {
  const diffLines = gitShowOutput.split("\n");

  // Find the start of the diff section (after the commit header)
  let diffStart = 0;
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].startsWith("diff --git")) {
      diffStart = i;
      break;
    }
  }

  const outputLines: string[] = [];
  let inHunk = false;
  let includeHunk = false;
  let hunkLines: string[] = [];

  for (let i = diffStart; i < diffLines.length; i++) {
    const line = diffLines[i];

    // Diff header lines (diff --git, index, ---, +++)
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ")
    ) {
      // Flush any previous hunk
      if (inHunk && includeHunk && hunkLines.length > 0) {
        outputLines.push(...hunkLines);
      }
      inHunk = false;
      includeHunk = false;
      hunkLines = [];
      outputLines.push(line);
      continue;
    }

    // Hunk header: @@ -old_start[,old_count] +new_start[,new_count] @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      // Flush previous hunk
      if (inHunk && includeHunk && hunkLines.length > 0) {
        outputLines.push(...hunkLines);
      }

      const newStart = parseInt(hunkMatch[1], 10);
      const newCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      const newEnd = newStart + newCount - 1;

      // Overlap check: does this hunk's new-file range intersect [lineStart, lineEnd]?
      includeHunk = newStart <= lineEnd && newEnd >= lineStart;
      inHunk = true;
      hunkLines = [line];
      continue;
    }

    if (inHunk) {
      hunkLines.push(line);
    }
  }

  // Flush last hunk
  if (inHunk && includeHunk && hunkLines.length > 0) {
    outputLines.push(...hunkLines);
  }

  return outputLines.join("\n");
}

