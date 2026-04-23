import { Database } from "bun:sqlite";
import { spawnSync } from "child_process";
import { relative } from "path";

/**
 * Run a git command and return stdout, or null on failure.
 */
function git(repoRoot: string, args: string[]): string | null {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

interface BlameLine {
  lineStart: number;
  lineEnd: number;
  commitHash: string;
  author: string;
  date: string;
  summary: string;
}

/**
 * Parse `git blame --porcelain` output into grouped line ranges.
 * Consecutive lines with the same commit are collapsed into a single range.
 */
function parsePorcelain(output: string): BlameLine[] {
  const lines = output.split("\n");

  interface RawLine {
    lineNum: number;
    commitHash: string;
    author: string;
    date: string;
    summary: string;
  }

  const rawLines: RawLine[] = [];

  // Porcelain format:
  //   <40-char-hash> <orig-line> <result-line> <group-size>
  //   author <name>
  //   author-time <unix-ts>
  //   summary <first-line>
  //   ...
  //   \t<line-content>
  //
  // The header block appears once per unique commit. Subsequent lines in the
  // same commit group only repeat the header (no metadata block).

  let i = 0;
  let currentCommit = "";
  let currentAuthor = "";
  let currentDate = "";
  let currentSummary = "";

  // Cache commit info so repeat references reuse the stored data
  const commitCache = new Map<string, { author: string; date: string; summary: string }>();

  while (i < lines.length) {
    const line = lines[i];

    // Header line: 40-hex + space + orig + space + result + optional group-size
    const headerMatch = line.match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/);
    if (headerMatch) {
      currentCommit = headerMatch[1];
      const resultLine = parseInt(headerMatch[2], 10);

      // Check if we already know this commit
      if (commitCache.has(currentCommit)) {
        const cached = commitCache.get(currentCommit)!;
        currentAuthor = cached.author;
        currentDate = cached.date;
        currentSummary = cached.summary;
        // Skip to the tab line (content line) for this entry
        i++;
        while (i < lines.length && !lines[i].startsWith("\t")) {
          i++;
        }
        // Tab line is the actual source line — we only care about line number
        if (i < lines.length && lines[i].startsWith("\t")) {
          rawLines.push({
            lineNum: resultLine,
            commitHash: currentCommit,
            author: currentAuthor,
            date: currentDate,
            summary: currentSummary,
          });
        }
        i++;
        continue;
      }

      // Parse the metadata block that follows
      currentAuthor = "";
      currentDate = "";
      currentSummary = "";

      i++;
      while (i < lines.length && !lines[i].startsWith("\t")) {
        const metaLine = lines[i];
        if (metaLine.startsWith("author ")) {
          currentAuthor = metaLine.slice("author ".length).trim();
        } else if (metaLine.startsWith("author-time ")) {
          const ts = parseInt(metaLine.slice("author-time ".length).trim(), 10);
          currentDate = new Date(ts * 1000).toISOString().slice(0, 10);
        } else if (metaLine.startsWith("summary ")) {
          currentSummary = metaLine.slice("summary ".length).trim();
        }
        i++;
      }

      commitCache.set(currentCommit, {
        author: currentAuthor,
        date: currentDate,
        summary: currentSummary,
      });

      // Tab line is the actual source line
      if (i < lines.length && lines[i].startsWith("\t")) {
        rawLines.push({
          lineNum: resultLine,
          commitHash: currentCommit,
          author: currentAuthor,
          date: currentDate,
          summary: currentSummary,
        });
      }
      i++;
      continue;
    }

    i++;
  }

  // Sort by line number (should already be ordered, but be safe)
  rawLines.sort((a, b) => a.lineNum - b.lineNum);

  // Group consecutive lines with the same commit
  const grouped: BlameLine[] = [];
  for (const raw of rawLines) {
    const last = grouped[grouped.length - 1];
    if (
      last &&
      last.commitHash === raw.commitHash &&
      last.lineEnd === raw.lineNum - 1
    ) {
      last.lineEnd = raw.lineNum;
    } else {
      grouped.push({
        lineStart: raw.lineNum,
        lineEnd: raw.lineNum,
        commitHash: raw.commitHash,
        author: raw.author,
        date: raw.date,
        summary: raw.summary,
      });
    }
  }

  return grouped;
}

/**
 * Blame a single file and store the results in blame_lines.
 * Deletes existing rows for this doc before inserting.
 * For files not tracked by git, inserts no rows.
 */
export function blameFile(db: Database, repoRoot: string, filePath: string): void {
  // Derive the repo-root-relative path to look up the document
  const relPath = relative(repoRoot, filePath).replace(/\\/g, "/");

  const docRow = db
    .query<{ id: number }, [string]>("SELECT id FROM documents WHERE path = ?")
    .get(relPath);

  if (!docRow) {
    // File not indexed — nothing to blame
    return;
  }

  const docId = docRow.id;

  // Delete existing blame rows
  db.run("DELETE FROM blame_lines WHERE doc_id = ?", [docId]);

  // Run git blame --porcelain
  const output = git(repoRoot, ["blame", "--porcelain", filePath]);
  if (output === null) {
    // File not tracked by git — leave blame_lines empty for this doc
    return;
  }

  const blamed = parsePorcelain(output);

  // Insert new rows — "commit" is a reserved word in SQLite, must be quoted
  const insert = db.prepare(
    `INSERT INTO blame_lines (doc_id, line_start, line_end, "commit", author, date, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const b of blamed) {
    insert.run(docId, b.lineStart, b.lineEnd, b.commitHash, b.author, b.date, b.summary);
  }
}

/**
 * Run blame for all indexed documents under docsDir.
 * Called on boot after indexAllDocs and runLineageScan.
 */
export function runBlameScan(db: Database, repoRoot: string, docsDir: string): void {
  const relDocsDir = relative(repoRoot, docsDir).replace(/\\/g, "/");

  // Fetch all indexed docs whose path starts with relDocsDir/
  const allDocs = db
    .query<{ id: number; path: string }, []>("SELECT id, path FROM documents")
    .all()
    .filter((d) => d.path.startsWith(relDocsDir + "/"));

  for (const doc of allDocs) {
    const absPath = `${repoRoot}/${doc.path}`;
    try {
      blameFile(db, repoRoot, absPath);
    } catch (err) {
      console.warn(`[docs-mcp] blame-scanner: error blaming ${doc.path}: ${err}`);
    }
  }

  console.info(`[docs-mcp] Blame scan complete: ${allDocs.length} file(s) processed`);
}
