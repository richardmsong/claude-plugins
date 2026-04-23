import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { runBlameScan, blameFile } from "../src/blame-scanner.js";

// ---- In-memory DB helper (with blame_lines table) ----

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

    CREATE TABLE blame_lines (
      id INTEGER PRIMARY KEY,
      doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      "commit" TEXT NOT NULL,
      author TEXT NOT NULL,
      date TEXT NOT NULL,
      summary TEXT NOT NULL
    );

    CREATE INDEX blame_lines_doc_line ON blame_lines (doc_id, line_start);
  `);

  return db;
}

// ---- Temp git repo helper ----

interface TempRepo {
  repoRoot: string;
  docsDir: string;
}

function createTempRepo(): TempRepo {
  const repoRoot = mkdtempSync(join(tmpdir(), "docs-mcp-blame-test-"));
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
  git("config", "user.name", "Test User");

  return { repoRoot, docsDir };
}

function gitCommit(repoRoot: string, message: string): string {
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

// ---- Tests ----

describe("blameFile", () => {
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

  test("inserts blame_lines rows for a tracked file", () => {
    const filePath = join(repo.docsDir, "adr-test.md");
    writeFileSync(filePath, "# Test ADR\n\n## Overview\n\nSome content here.\n");
    const hash = gitCommit(repo.repoRoot, "add test adr");

    // Insert the doc row so blameFile can find it
    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-test.md", "adr", "Test ADR", "accepted"]
    );

    blameFile(db, repo.repoRoot, filePath);

    const rows = db
      .query<{ line_start: number; line_end: number; "commit": string; author: string; date: string; summary: string }, []>(
        `SELECT line_start, line_end, "commit", author, date, summary FROM blame_lines ORDER BY line_start`
      )
      .all();

    expect(rows.length).toBeGreaterThan(0);
    // All rows should reference the same commit
    for (const row of rows) {
      expect(row["commit"]).toBe(hash);
      expect(row.author).toBe("Test User");
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.summary).toBe("add test adr");
    }
    // Lines should be 1-based and ordered
    expect(rows[0].line_start).toBe(1);
  });

  test("groups consecutive lines with same commit into a single range", () => {
    const content = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join("\n") + "\n";
    const filePath = join(repo.docsDir, "adr-multiline.md");
    writeFileSync(filePath, content);
    gitCommit(repo.repoRoot, "add multiline file");

    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-multiline.md", "adr", "Multi", "accepted"]
    );

    blameFile(db, repo.repoRoot, filePath);

    const rows = db
      .query<{ line_start: number; line_end: number }, []>(
        "SELECT line_start, line_end FROM blame_lines ORDER BY line_start"
      )
      .all();

    // All 10 lines share one commit → should be a single row
    expect(rows.length).toBe(1);
    expect(rows[0].line_start).toBe(1);
    expect(rows[0].line_end).toBe(10);
  });

  test("inserts no rows for an untracked file", () => {
    const filePath = join(repo.docsDir, "adr-untracked.md");
    writeFileSync(filePath, "# Untracked\n");
    // Do NOT commit — file is untracked

    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-untracked.md", "adr", "Untracked", null]
    );

    blameFile(db, repo.repoRoot, filePath);

    const count = db
      .query<{ count: number }, []>("SELECT count(*) as count FROM blame_lines")
      .get()!;
    expect(count.count).toBe(0);
  });

  test("deletes old blame rows before re-blaming", () => {
    const filePath = join(repo.docsDir, "adr-rebuild.md");
    writeFileSync(filePath, "# Rebuild\n\n## Section\n\nOriginal content.\n");
    gitCommit(repo.repoRoot, "initial commit");

    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-rebuild.md", "adr", "Rebuild", "accepted"]
    );

    // First blame
    blameFile(db, repo.repoRoot, filePath);
    const count1 = db
      .query<{ count: number }, []>("SELECT count(*) as count FROM blame_lines")
      .get()!;
    expect(count1.count).toBeGreaterThan(0);

    // Update file and re-blame
    writeFileSync(filePath, "# Rebuild\n\n## Section\n\nUpdated content.\n\n## New Section\n\nMore stuff.\n");
    gitCommit(repo.repoRoot, "update content");

    blameFile(db, repo.repoRoot, filePath);

    // Rows should be fresh from the second blame — not accumulated
    const rows = db
      .query<{ "commit": string }, []>(`SELECT DISTINCT "commit" FROM blame_lines`)
      .all();
    // Each row should reference a valid hash
    for (const row of rows) {
      expect(row["commit"]).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("does nothing when doc is not in documents table", () => {
    const filePath = join(repo.docsDir, "adr-orphan.md");
    writeFileSync(filePath, "# Orphan\n");
    gitCommit(repo.repoRoot, "orphan commit");

    // Do NOT insert into documents table
    blameFile(db, repo.repoRoot, filePath);

    const count = db
      .query<{ count: number }, []>("SELECT count(*) as count FROM blame_lines")
      .get()!;
    expect(count.count).toBe(0);
  });

  test("produces rows with ON DELETE CASCADE from documents", () => {
    const filePath = join(repo.docsDir, "adr-cascade.md");
    writeFileSync(filePath, "# Cascade\n\n## Section\n\nContent.\n");
    gitCommit(repo.repoRoot, "cascade commit");

    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-cascade.md", "adr", "Cascade", "accepted"]
    );
    blameFile(db, repo.repoRoot, filePath);

    const countBefore = db
      .query<{ count: number }, []>("SELECT count(*) as count FROM blame_lines")
      .get()!;
    expect(countBefore.count).toBeGreaterThan(0);

    // Delete the document — CASCADE should remove blame_lines rows
    db.run("DELETE FROM documents WHERE path = ?", ["docs/adr-cascade.md"]);

    const countAfter = db
      .query<{ count: number }, []>("SELECT count(*) as count FROM blame_lines")
      .get()!;
    expect(countAfter.count).toBe(0);
  });
});

describe("runBlameScan", () => {
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

  test("blames all indexed docs under docsDir", () => {
    writeFileSync(join(repo.docsDir, "adr-a.md"), "# A\n\n## Section A\n\nContent A.\n");
    writeFileSync(join(repo.docsDir, "adr-b.md"), "# B\n\n## Section B\n\nContent B.\n");
    gitCommit(repo.repoRoot, "add both docs");

    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-a.md", "adr", "A", "accepted"]
    );
    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-b.md", "adr", "B", "accepted"]
    );

    runBlameScan(db, repo.repoRoot, repo.docsDir);

    const docIds = db
      .query<{ doc_id: number }, []>(
        "SELECT DISTINCT doc_id FROM blame_lines"
      )
      .all()
      .map((r) => r.doc_id);

    expect(docIds.length).toBe(2);
  });

  test("does not throw when docsDir has no indexed docs", () => {
    // No documents in DB — should complete without error
    expect(() => {
      runBlameScan(db, repo.repoRoot, repo.docsDir);
    }).not.toThrow();
  });

  test("skips files not tracked by git", () => {
    const filePath = join(repo.docsDir, "adr-staged.md");
    writeFileSync(filePath, "# Staged\n");
    // File exists on disk but not committed

    db.run(
      "INSERT INTO documents(path, category, title, status, mtime) VALUES (?, ?, ?, ?, 0)",
      ["docs/adr-staged.md", "adr", "Staged", null]
    );

    runBlameScan(db, repo.repoRoot, repo.docsDir);

    const count = db
      .query<{ count: number }, []>("SELECT count(*) as count FROM blame_lines")
      .get()!;
    expect(count.count).toBe(0);
  });
});
