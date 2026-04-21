import { Database } from "bun:sqlite";
import { spawnSync } from "child_process";
import { parseMarkdown } from "./parser.js";

/**
 * Run a git command in the given repo root.
 * Returns stdout as a string, or null on error.
 */
function git(repoRoot: string, args: string[]): string | null {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

/**
 * Returns true if git is available and the directory has a .git folder.
 */
export function isGitAvailable(repoRoot: string): boolean {
  const result = git(repoRoot, ["rev-parse", "--git-dir"]);
  return result !== null;
}

/**
 * Get the current HEAD commit hash.
 */
export function getHeadCommit(repoRoot: string): string | null {
  const out = git(repoRoot, ["rev-parse", "HEAD"]);
  return out ? out.trim() : null;
}

/**
 * Check whether a commit has a parent (i.e. is not the root commit).
 */
function isRootCommit(repoRoot: string, commitHash: string): boolean {
  const out = git(repoRoot, ["rev-list", "--parents", "-1", commitHash]);
  if (!out) return false;
  // Output is: "<hash> [parent1] [parent2]..."
  // Root commit has no parents → only one hash on the line
  const parts = out.trim().split(/\s+/);
  return parts.length === 1;
}

/**
 * Get the list of docs/*.md files modified in a commit.
 */
function getModifiedDocFiles(repoRoot: string, commitHash: string): string[] {
  const root = isRootCommit(repoRoot, commitHash);
  const args = root
    ? ["diff-tree", "--no-commit-id", "-r", "--name-only", "--root", commitHash, "--", "docs/*.md"]
    : ["diff-tree", "--no-commit-id", "-r", "--name-only", commitHash, "--", "docs/*.md"];

  const out = git(repoRoot, args);
  if (!out) return [];
  return out
    .trim()
    .split("\n")
    .filter((f) => f.endsWith(".md") && f.startsWith("docs/"));
}

/**
 * Get file content at a specific commit.
 */
function getFileAtCommit(repoRoot: string, commitHash: string, filePath: string): string | null {
  return git(repoRoot, ["show", `${commitHash}:${filePath}`]);
}

export interface DiffHunk {
  filePath: string;
  startLine: number;
  lineCount: number;
}

/**
 * Parse unified diff output to extract hunk positions per file.
 */
export function parseDiffHunks(diffOutput: string): Map<string, DiffHunk[]> {
  const result = new Map<string, DiffHunk[]>();
  let currentFile: string | null = null;

  for (const line of diffOutput.split("\n")) {
    // Match diff --git a/... b/...
    const fileMatch = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    // Match @@ -old +new[,count] @@
    // We care about the "new file" side (after the commit), but for historical mapping
    // we use the "old" side (before) relative to what was there.
    // Actually, spec says: map hunks to sections using file-at-commit (the new/post version).
    // We'll use the +new side line positions.
    if (currentFile && line.startsWith("@@")) {
      const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch && currentFile.endsWith(".md") && currentFile.startsWith("docs/")) {
        const startLine = parseInt(hunkMatch[1], 10);
        const lineCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
        if (!result.has(currentFile)) result.set(currentFile, []);
        result.get(currentFile)!.push({ filePath: currentFile, startLine, lineCount });
      }
    }
  }

  return result;
}

/**
 * Get diff hunks for a commit.
 */
function getCommitDiffHunks(repoRoot: string, commitHash: string): Map<string, DiffHunk[]> {
  const root = isRootCommit(repoRoot, commitHash);
  const args = root
    ? ["diff-tree", "-p", "--root", commitHash, "--", "docs/*.md"]
    : ["diff", `${commitHash}~1..${commitHash}`, "--", "docs/*.md"];

  const out = git(repoRoot, args);
  if (!out) return new Map();
  return parseDiffHunks(out);
}

export interface SectionBoundary {
  heading: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * Given diff hunks for a file and section boundaries, return which sections
 * are touched by the hunks.
 */
export function touchedSections(hunks: DiffHunk[], boundaries: SectionBoundary[]): string[] {
  const touched = new Set<string>();
  for (const hunk of hunks) {
    const hunkStart = hunk.startLine;
    const hunkEnd = hunk.startLine + Math.max(hunk.lineCount - 1, 0);
    for (const section of boundaries) {
      // Overlap: hunk intersects section range
      if (hunkStart <= section.lineEnd && hunkEnd >= section.lineStart) {
        touched.add(section.heading);
      }
    }
  }
  return Array.from(touched);
}

/**
 * Upsert a lineage edge in the DB (or increment count).
 */
function upsertLineage(
  db: Database,
  docA: string,
  headingA: string,
  docB: string,
  headingB: string,
  commitHash: string
): void {
  db.run(
    `INSERT INTO lineage(section_a_doc, section_a_heading, section_b_doc, section_b_heading, commit_count, last_commit)
     VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(section_a_doc, section_a_heading, section_b_doc, section_b_heading)
     DO UPDATE SET commit_count = commit_count + 1, last_commit = excluded.last_commit`,
    [docA, headingA, docB, headingB, commitHash]
  );
}

/**
 * Run the incremental lineage scan.
 * Processes commits from last_lineage_commit..HEAD (or full history on first run).
 */
export function runLineageScan(db: Database, repoRoot: string): void {
  if (!isGitAvailable(repoRoot)) {
    console.info("[docs-mcp] Git not available — skipping lineage scan");
    return;
  }

  const head = getHeadCommit(repoRoot);
  if (!head) {
    console.warn("[docs-mcp] Cannot determine HEAD — skipping lineage scan");
    return;
  }

  // Get last processed commit
  const lastRow = db
    .query<{ value: string }, []>(
      "SELECT value FROM metadata WHERE key = 'last_lineage_commit'"
    )
    .get();
  const lastCommit = lastRow?.value ?? null;

  // Get commit list to process
  let commitArgs: string[];
  if (lastCommit) {
    commitArgs = ["log", `${lastCommit}..HEAD`, "--reverse", "--format=%H", "--", "docs/*.md"];
  } else {
    // Full history scan
    commitArgs = ["log", "--reverse", "--format=%H", "--", "docs/*.md"];
  }

  const out = git(repoRoot, commitArgs);
  if (!out || !out.trim()) {
    // Nothing new — update last commit pointer
    db.run("INSERT OR REPLACE INTO metadata(key, value) VALUES ('last_lineage_commit', ?)", [head]);
    return;
  }

  const commits = out.trim().split("\n").filter(Boolean);
  console.info(`[docs-mcp] Scanning ${commits.length} commit(s) for lineage`);

  for (const commitHash of commits) {
    processCommitForLineage(db, repoRoot, commitHash);
  }

  // Update last processed commit
  db.run("INSERT OR REPLACE INTO metadata(key, value) VALUES ('last_lineage_commit', ?)", [head]);
}

/**
 * Process a single commit to extract cross-doc lineage.
 */
export function processCommitForLineage(db: Database, repoRoot: string, commitHash: string): void {
  const modifiedFiles = getModifiedDocFiles(repoRoot, commitHash);

  // Tally commit_count for EVERY modified file, including solo commits, so
  // the per-doc volatility metric counts all edits (per ADR-0027).
  for (const filePath of modifiedFiles) {
    db.run(
      "UPDATE documents SET commit_count = commit_count + 1 WHERE path = ?",
      [filePath]
    );
  }

  if (modifiedFiles.length < 2) {
    // No cross-doc lineage possible
    return;
  }

  // Get diff hunks for all docs files in this commit
  const hunkMap = getCommitDiffHunks(repoRoot, commitHash);

  // For each modified file, get section boundaries at commit version
  interface FileSections {
    filePath: string;
    sections: SectionBoundary[];
    touchedHeadings: string[];
  }

  const fileData: FileSections[] = [];

  for (const filePath of modifiedFiles) {
    const fileContent = getFileAtCommit(repoRoot, commitHash, filePath);
    if (!fileContent) continue;

    const parsed = parseMarkdown(fileContent);
    const boundaries: SectionBoundary[] = parsed.sections.map((s) => ({
      heading: s.heading,
      lineStart: s.lineStart,
      lineEnd: s.lineEnd,
    }));

    const hunks = hunkMap.get(filePath) ?? [];
    const touched = touchedSections(hunks, boundaries);

    if (touched.length > 0) {
      fileData.push({ filePath, sections: boundaries, touchedHeadings: touched });
    }
  }

  if (fileData.length < 2) return;

  // Generate cross-doc pairs for every combination of touched sections
  for (let i = 0; i < fileData.length; i++) {
    for (let j = i + 1; j < fileData.length; j++) {
      const a = fileData[i];
      const b = fileData[j];

      for (const headingA of a.touchedHeadings) {
        for (const headingB of b.touchedHeadings) {
          upsertLineage(db, a.filePath, headingA, b.filePath, headingB, commitHash);
          upsertLineage(db, b.filePath, headingB, a.filePath, headingA, commitHash);
        }
      }
    }
  }
}
