import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import {
  parseDiffHunks,
  touchedSections,
  isGitAvailable,
  getHeadCommit,
  runLineageScan,
  type DiffHunk,
  type SectionBoundary,
} from "../src/lineage-scanner.js";

// ---- In-memory DB helper ----

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      category TEXT,
      title TEXT,
      status TEXT,
      commit_count INTEGER NOT NULL DEFAULT 0,
      last_status_change TEXT,
      mtime REAL NOT NULL
    );

    CREATE TABLE sections (
      id INTEGER PRIMARY KEY,
      doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      heading TEXT NOT NULL,
      content TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE sections_fts USING fts5(
      heading,
      content,
      content='sections',
      content_rowid='id'
    );

    CREATE TRIGGER sections_ai AFTER INSERT ON sections BEGIN
      INSERT INTO sections_fts(rowid, heading, content)
      VALUES (new.id, new.heading, new.content);
    END;

    CREATE TRIGGER sections_ad AFTER DELETE ON sections BEGIN
      INSERT INTO sections_fts(sections_fts, rowid, heading, content)
      VALUES ('delete', old.id, old.heading, old.content);
    END;

    CREATE TABLE lineage (
      section_a_doc TEXT NOT NULL,
      section_a_heading TEXT NOT NULL,
      section_b_doc TEXT NOT NULL,
      section_b_heading TEXT NOT NULL,
      commit_count INTEGER NOT NULL DEFAULT 1,
      last_commit TEXT NOT NULL,
      PRIMARY KEY (section_a_doc, section_a_heading, section_b_doc, section_b_heading)
    );

    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

// ---- Temp git repo helper ----

interface TempRepo {
  repoRoot: string;
  docsDir: string;
}

function createTempRepo(): TempRepo {
  const repoRoot = mkdtempSync(join(tmpdir(), "docs-mcp-git-test-"));
  const docsDir = join(repoRoot, "docs");
  mkdirSync(docsDir);

  function git(...args: string[]) {
    const result = spawnSync("git", args, {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
    return result.stdout;
  }

  git("init");
  git("config", "user.email", "test@test.com");
  git("config", "user.name", "Test");

  return { repoRoot, docsDir };
}

function gitCommit(repoRoot: string, message: string) {
  function git(...args: string[]) {
    const result = spawnSync("git", args, {
      cwd: repoRoot,
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  }
  git("add", "-A");
  git("commit", "-m", message);
  return git("rev-parse", "HEAD");
}

function cleanTempRepo(repoRoot: string) {
  try {
    rmSync(repoRoot, { recursive: true, force: true });
  } catch {}
}

// ---- parseDiffHunks tests ----

describe("parseDiffHunks", () => {
  test("parses single file with single hunk", () => {
    const diff = [
      "diff --git a/docs/adr-2026-04-10-foo.md b/docs/adr-2026-04-10-foo.md",
      "index 1234..5678 100644",
      "--- a/docs/adr-2026-04-10-foo.md",
      "+++ b/docs/adr-2026-04-10-foo.md",
      "@@ -10,3 +10,4 @@ ## Section One",
      " unchanged line",
      "+added line",
      " another unchanged",
    ].join("\n");

    const result = parseDiffHunks(diff);
    expect(result.has("docs/adr-2026-04-10-foo.md")).toBe(true);
    const hunks = result.get("docs/adr-2026-04-10-foo.md")!;
    expect(hunks.length).toBe(1);
    expect(hunks[0].startLine).toBe(10);
    expect(hunks[0].lineCount).toBe(4);
  });

  test("parses multiple files", () => {
    const diff = [
      "diff --git a/docs/adr-2026-04-10-a.md b/docs/adr-2026-04-10-a.md",
      "@@ -5,3 +5,3 @@",
      " line",
      "diff --git a/docs/adr-2026-04-10-b.md b/docs/adr-2026-04-10-b.md",
      "@@ -20,2 +20,2 @@",
      " line",
    ].join("\n");

    const result = parseDiffHunks(diff);
    expect(result.has("docs/adr-2026-04-10-a.md")).toBe(true);
    expect(result.has("docs/adr-2026-04-10-b.md")).toBe(true);
  });

  test("parses multiple hunks in one file", () => {
    const diff = [
      "diff --git a/docs/adr-2026-04-10-foo.md b/docs/adr-2026-04-10-foo.md",
      "@@ -5,3 +5,3 @@",
      " line",
      "@@ -50,2 +50,4 @@",
      " another line",
    ].join("\n");

    const result = parseDiffHunks(diff);
    const hunks = result.get("docs/adr-2026-04-10-foo.md")!;
    expect(hunks.length).toBe(2);
    expect(hunks[0].startLine).toBe(5);
    expect(hunks[1].startLine).toBe(50);
    expect(hunks[1].lineCount).toBe(4);
  });

  test("ignores non-docs files", () => {
    const diff = [
      "diff --git a/src/index.ts b/src/index.ts",
      "@@ -1,3 +1,3 @@",
      " line",
      "diff --git a/docs/adr-2026-04-10-foo.md b/docs/adr-2026-04-10-foo.md",
      "@@ -5,3 +5,3 @@",
      " line",
    ].join("\n");

    const result = parseDiffHunks(diff);
    expect(result.has("src/index.ts")).toBe(false);
    expect(result.has("docs/adr-2026-04-10-foo.md")).toBe(true);
  });

  test("returns empty map for empty diff", () => {
    const result = parseDiffHunks("");
    expect(result.size).toBe(0);
  });

  test("handles hunk with no explicit line count (implicit 1)", () => {
    // @@ -10 +10 @@ (no comma means lineCount=1 by default)
    const diff = [
      "diff --git a/docs/adr-2026-04-10-foo.md b/docs/adr-2026-04-10-foo.md",
      "@@ -10 +10 @@",
      "+added line",
    ].join("\n");

    const result = parseDiffHunks(diff);
    const hunks = result.get("docs/adr-2026-04-10-foo.md")!;
    expect(hunks.length).toBe(1);
    expect(hunks[0].startLine).toBe(10);
    expect(hunks[0].lineCount).toBe(1);
  });
});

// ---- touchedSections tests ----

describe("touchedSections", () => {
  const boundaries: SectionBoundary[] = [
    { heading: "Overview", lineStart: 3, lineEnd: 15 },
    { heading: "Architecture", lineStart: 16, lineEnd: 40 },
    { heading: "Security", lineStart: 41, lineEnd: 60 },
  ];

  test("returns section when hunk falls within it", () => {
    const hunks: DiffHunk[] = [
      { filePath: "docs/adr-2026-04-10-foo.md", startLine: 5, lineCount: 3 },
    ];
    const result = touchedSections(hunks, boundaries);
    expect(result).toContain("Overview");
    expect(result).not.toContain("Architecture");
    expect(result).not.toContain("Security");
  });

  test("returns multiple sections when hunks span them", () => {
    const hunks: DiffHunk[] = [
      { filePath: "docs/adr-2026-04-10-foo.md", startLine: 5, lineCount: 1 },   // Overview
      { filePath: "docs/adr-2026-04-10-foo.md", startLine: 45, lineCount: 2 },  // Security
    ];
    const result = touchedSections(hunks, boundaries);
    expect(result).toContain("Overview");
    expect(result).toContain("Security");
    expect(result).not.toContain("Architecture");
  });

  test("returns empty array when no overlap", () => {
    const hunks: DiffHunk[] = [
      { filePath: "docs/adr-2026-04-10-foo.md", startLine: 100, lineCount: 5 },
    ];
    const result = touchedSections(hunks, boundaries);
    expect(result).toHaveLength(0);
  });

  test("hunk overlapping section boundary touches both sections", () => {
    // Hunk at 14-17 overlaps Overview (3-15) and Architecture (16-40)
    const hunks: DiffHunk[] = [
      { filePath: "docs/adr-2026-04-10-foo.md", startLine: 14, lineCount: 4 },
    ];
    const result = touchedSections(hunks, boundaries);
    expect(result).toContain("Overview");
    expect(result).toContain("Architecture");
  });

  test("returns empty array for empty hunks", () => {
    const result = touchedSections([], boundaries);
    expect(result).toHaveLength(0);
  });

  test("returns empty array for empty boundaries", () => {
    const hunks: DiffHunk[] = [
      { filePath: "docs/adr-2026-04-10-foo.md", startLine: 5, lineCount: 3 },
    ];
    const result = touchedSections(hunks, []);
    expect(result).toHaveLength(0);
  });

  test("deduplicates section headings", () => {
    // Two hunks both touching Overview
    const hunks: DiffHunk[] = [
      { filePath: "docs/adr-2026-04-10-foo.md", startLine: 3, lineCount: 1 },
      { filePath: "docs/adr-2026-04-10-foo.md", startLine: 10, lineCount: 1 },
    ];
    const result = touchedSections(hunks, boundaries);
    const overviewCount = result.filter((h) => h === "Overview").length;
    expect(overviewCount).toBe(1);
  });
});

// ---- isGitAvailable and getHeadCommit tests ----

describe("isGitAvailable / getHeadCommit", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });

  afterEach(() => {
    cleanTempRepo(repo.repoRoot);
  });

  test("isGitAvailable returns true in git repo", () => {
    expect(isGitAvailable(repo.repoRoot)).toBe(true);
  });

  test("isGitAvailable returns false outside git repo", () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), "not-a-git-"));
    try {
      expect(isGitAvailable(nonGitDir)).toBe(false);
    } finally {
      cleanTempRepo(nonGitDir);
    }
  });

  test("getHeadCommit returns null when no commits yet", () => {
    // Fresh repo with no commits has no HEAD
    const head = getHeadCommit(repo.repoRoot);
    expect(head).toBeNull();
  });

  test("getHeadCommit returns commit hash after first commit", () => {
    writeFileSync(join(repo.docsDir, "adr-2026-04-10-foo.md"), "# Foo\n\n## Section\n\nContent.\n");
    const hash = gitCommit(repo.repoRoot, "initial commit");

    const head = getHeadCommit(repo.repoRoot);
    expect(head).toBe(hash);
  });
});

// ---- runLineageScan against real git history ----

describe("runLineageScan", () => {
  let repo: TempRepo;
  let db: Database;

  beforeEach(() => {
    repo = createTempRepo();
    db = makeTestDb();
  });

  afterEach(() => {
    db.close();
    cleanTempRepo(repo.repoRoot);
  });

  test("no lineage when only one doc changed in a commit", () => {
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-17-nats-security.md"),
      "# NATS\n\n## Overview\n\nNATS overview.\n\n## Security\n\nJWT auth.\n"
    );
    gitCommit(repo.repoRoot, "add nats doc");

    runLineageScan(db, repo.repoRoot);

    const rows = db.query<{ count: number }, []>("SELECT count(*) as count FROM lineage").get()!;
    expect(rows.count).toBe(0);
  });

  test("generates lineage edges when two docs modified in same commit", () => {
    // First commit: add two docs
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-17-nats-security.md"),
      "# NATS\n\n## Overview\n\nNATS overview.\n\n## Security\n\nJWT auth.\n"
    );
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-10-k8s-integration.md"),
      "# K8s\n\n## Session Lifecycle\n\nSession states.\n\n## Provisioning\n\nHow to provision.\n"
    );
    gitCommit(repo.repoRoot, "add both docs");

    runLineageScan(db, repo.repoRoot);

    // Should have cross-doc lineage edges
    const rows = db.query<{ count: number }, []>("SELECT count(*) as count FROM lineage").get()!;
    expect(rows.count).toBeGreaterThan(0);
  });

  test("lineage edges are symmetric (A→B and B→A both exist)", () => {
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-10-a.md"),
      "# Doc A\n\n## Section A\n\nContent A.\n"
    );
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-10-b.md"),
      "# Doc B\n\n## Section B\n\nContent B.\n"
    );
    gitCommit(repo.repoRoot, "add both docs");

    runLineageScan(db, repo.repoRoot);

    const edgeAtoB = db
      .query<{ count: number }, [string, string, string, string]>(
        "SELECT count(*) as count FROM lineage WHERE section_a_doc=? AND section_a_heading=? AND section_b_doc=? AND section_b_heading=?"
      )
      .get("docs/adr-2026-04-10-a.md", "Section A", "docs/adr-2026-04-10-b.md", "Section B");
    expect(edgeAtoB!.count).toBe(1);

    const edgeBtoA = db
      .query<{ count: number }, [string, string, string, string]>(
        "SELECT count(*) as count FROM lineage WHERE section_a_doc=? AND section_a_heading=? AND section_b_doc=? AND section_b_heading=?"
      )
      .get("docs/adr-2026-04-10-b.md", "Section B", "docs/adr-2026-04-10-a.md", "Section A");
    expect(edgeBtoA!.count).toBe(1);
  });

  test("incremental scan: commit_count incremented on subsequent commits", () => {
    // First commit: add both docs
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-10-a.md"),
      "# Doc A\n\n## Section A\n\nContent A.\n"
    );
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-10-b.md"),
      "# Doc B\n\n## Section B\n\nContent B.\n"
    );
    gitCommit(repo.repoRoot, "add both docs");

    runLineageScan(db, repo.repoRoot);

    // Second commit: modify both docs again
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-10-a.md"),
      "# Doc A\n\n## Section A\n\nContent A updated.\n"
    );
    writeFileSync(
      join(repo.docsDir, "adr-2026-04-10-b.md"),
      "# Doc B\n\n## Section B\n\nContent B updated.\n"
    );
    gitCommit(repo.repoRoot, "update both docs");

    runLineageScan(db, repo.repoRoot);

    const edge = db
      .query<{ commit_count: number }, [string, string, string, string]>(
        "SELECT commit_count FROM lineage WHERE section_a_doc=? AND section_a_heading=? AND section_b_doc=? AND section_b_heading=?"
      )
      .get("docs/adr-2026-04-10-a.md", "Section A", "docs/adr-2026-04-10-b.md", "Section B");
    expect(edge!.commit_count).toBe(2);
  });

  test("stores last_lineage_commit in metadata after scan", () => {
    writeFileSync(join(repo.docsDir, "adr-2026-04-10-a.md"), "# A\n\n## Section A\n\nContent.\n");
    writeFileSync(join(repo.docsDir, "adr-2026-04-10-b.md"), "# B\n\n## Section B\n\nContent.\n");
    const hash = gitCommit(repo.repoRoot, "add docs");

    runLineageScan(db, repo.repoRoot);

    const row = db
      .query<{ value: string }, []>(
        "SELECT value FROM metadata WHERE key = 'last_lineage_commit'"
      )
      .get();
    expect(row).toBeDefined();
    expect(row!.value).toBe(hash);
  });

  test("skips lineage scan when git not available", () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), "not-a-git-"));
    try {
      runLineageScan(db, nonGitDir); // should not throw
      const rows = db.query<{ count: number }, []>("SELECT count(*) as count FROM lineage").get()!;
      expect(rows.count).toBe(0);
    } finally {
      cleanTempRepo(nonGitDir);
    }
  });

  test("commit_count incremented for solo commits (ADR-0027: count before early return)", () => {
    // Pre-insert the document so the UPDATE has a row to touch
    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-solo.md", "adr", "Solo ADR", "accepted"]
    );

    // Commit that touches only one doc (solo → no lineage edges, but commit_count should increment)
    writeFileSync(join(repo.docsDir, "adr-solo.md"), "# Solo ADR\n\n## Overview\n\nSolo content.\n");
    gitCommit(repo.repoRoot, "solo commit");

    runLineageScan(db, repo.repoRoot);

    const doc = db
      .query<{ commit_count: number }, [string]>(
        "SELECT commit_count FROM documents WHERE path = ?"
      )
      .get("docs/adr-solo.md");
    expect(doc).toBeDefined();
    // Solo commit → lineage skipped, but commit_count tallied
    expect(doc!.commit_count).toBe(1);

    // Also verify no lineage edges were written (only one doc in commit)
    const edges = db.query<{ count: number }, []>("SELECT count(*) as count FROM lineage").get()!;
    expect(edges.count).toBe(0);
  });

  test("commit_count tallied for all docs in multi-doc commit", () => {
    // Pre-insert both documents
    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-alpha.md", "adr", "Alpha", "accepted"]
    );
    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-beta.md", "adr", "Beta", "accepted"]
    );

    writeFileSync(join(repo.docsDir, "adr-alpha.md"), "# Alpha\n\n## Section A\n\nContent.\n");
    writeFileSync(join(repo.docsDir, "adr-beta.md"), "# Beta\n\n## Section B\n\nContent.\n");
    gitCommit(repo.repoRoot, "add both docs");

    runLineageScan(db, repo.repoRoot);

    const alpha = db
      .query<{ commit_count: number }, [string]>("SELECT commit_count FROM documents WHERE path = ?")
      .get("docs/adr-alpha.md");
    const beta = db
      .query<{ commit_count: number }, [string]>("SELECT commit_count FROM documents WHERE path = ?")
      .get("docs/adr-beta.md");

    expect(alpha!.commit_count).toBe(1);
    expect(beta!.commit_count).toBe(1);
  });
});
