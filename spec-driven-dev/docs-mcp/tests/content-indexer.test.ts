import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync, unlinkSync, mkdirSync, rmdirSync } from "fs";
import { join, relative } from "path";
import { tmpdir } from "os";
import { indexFile, indexAllDocs, removeFile } from "../src/content-indexer.js";

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

describe("indexFile", () => {
  let db: Database;
  let tmpDir: string;
  let docsDir: string;

  beforeEach(() => {
    db = makeTestDb();
    tmpDir = mkdtempSync(join(tmpdir(), "docs-mcp-test-"));
    docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir);
  });

  afterEach(() => {
    try {
      // Clean up temp dir
      const files = require("fs").readdirSync(docsDir);
      for (const f of files) unlinkSync(join(docsDir, f));
      rmdirSync(docsDir);
      rmdirSync(tmpDir);
    } catch {}
  });

  test("indexes a new file and returns true", () => {
    const filePath = join(docsDir, "adr-2026-04-10-test.md");
    writeFileSync(filePath, "# Test Doc\n\n## Section One\n\nContent here.\n");
    const result = indexFile(db, filePath, tmpDir);
    expect(result).toBe(true);
  });

  test("document and sections are inserted into DB", () => {
    const filePath = join(docsDir, "adr-2026-04-10-test.md");
    writeFileSync(filePath, "# Test Doc\n\n## Section One\n\nContent here.\n\n## Section Two\n\nMore content.\n");
    indexFile(db, filePath, tmpDir);

    const doc = db.query<{ path: string; title: string; category: string }, []>(
      "SELECT path, title, category FROM documents"
    ).get();
    expect(doc).toBeDefined();
    expect(doc!.title).toBe("Test Doc");
    expect(doc!.category).toBe("adr"); // adr- prefix

    const sections = db.query<{ heading: string }, []>(
      "SELECT heading FROM sections ORDER BY line_start"
    ).all();
    expect(sections.length).toBe(2);
    expect(sections[0].heading).toBe("Section One");
    expect(sections[1].heading).toBe("Section Two");
  });

  test("returns false if mtime unchanged (skips reindex)", async () => {
    const filePath = join(docsDir, "adr-2026-04-10-test.md");
    writeFileSync(filePath, "# Test\n\n## Section A\n\nContent.\n");

    // First index
    indexFile(db, filePath, tmpDir);

    // Second call — mtime unchanged → should skip
    const result = indexFile(db, filePath, tmpDir);
    expect(result).toBe(false);
  });

  test("reindexes file when content changes (mtime changes)", async () => {
    const filePath = join(docsDir, "adr-2026-04-10-test.md");
    writeFileSync(filePath, "# Test\n\n## Old Section\n\nOriginal content.\n");
    indexFile(db, filePath, tmpDir);

    // Simulate mtime change by waiting and rewriting
    // Force mtime to be different by manually setting it in DB to an old value
    db.run("UPDATE documents SET mtime = 0");

    writeFileSync(filePath, "# Test\n\n## New Section\n\nUpdated content.\n");
    const result = indexFile(db, filePath, tmpDir);
    expect(result).toBe(true);

    const sections = db.query<{ heading: string }, []>(
      "SELECT heading FROM sections"
    ).all();
    expect(sections.length).toBe(1);
    expect(sections[0].heading).toBe("New Section");
  });

  test("transaction correctness: old sections deleted before new inserted", () => {
    const filePath = join(docsDir, "adr-2026-04-10-test.md");
    writeFileSync(filePath, "# Test\n\n## Alpha\n\nA content.\n\n## Beta\n\nB content.\n");
    indexFile(db, filePath, tmpDir);

    let sectionCount = db.query<{ count: number }, []>("SELECT count(*) as count FROM sections").get()!.count;
    expect(sectionCount).toBe(2);

    // Update with a single section
    db.run("UPDATE documents SET mtime = 0");
    writeFileSync(filePath, "# Test\n\n## Only\n\nSingle content.\n");
    indexFile(db, filePath, tmpDir);

    sectionCount = db.query<{ count: number }, []>("SELECT count(*) as count FROM sections").get()!.count;
    expect(sectionCount).toBe(1);

    const section = db.query<{ heading: string }, []>("SELECT heading FROM sections").get()!;
    expect(section.heading).toBe("Only");
  });

  test("returns false and removes from DB when file is deleted", () => {
    const filePath = join(docsDir, "adr-2026-04-10-test.md");
    writeFileSync(filePath, "# Test\n\n## Section\n\nContent.\n");
    indexFile(db, filePath, tmpDir);

    let docCount = db.query<{ count: number }, []>("SELECT count(*) as count FROM documents").get()!.count;
    expect(docCount).toBe(1);

    // Delete the file
    unlinkSync(filePath);
    const result = indexFile(db, filePath, tmpDir);
    expect(result).toBe(false);

    docCount = db.query<{ count: number }, []>("SELECT count(*) as count FROM documents").get()!.count;
    expect(docCount).toBe(0);
  });

  test("last_status_change is written to DB when history list present", () => {
    const filePath = join(docsDir, "adr-0027-docs-dashboard.md");
    const content = [
      "# ADR: Docs Dashboard",
      "",
      "**Status**: accepted",
      "**Status history**:",
      "- 2026-04-21: draft",
      "- 2026-04-21: accepted",
      "",
      "## Overview",
      "Content.",
    ].join("\n");
    writeFileSync(filePath, content);
    indexFile(db, filePath, tmpDir);

    const doc = db
      .query<{ last_status_change: string | null }, []>(
        "SELECT last_status_change FROM documents"
      )
      .get();
    expect(doc!.last_status_change).toBe("2026-04-21");
  });

  test("last_status_change is null when no history list", () => {
    const filePath = join(docsDir, "spec-state-schema.md");
    writeFileSync(filePath, "# State Schema\n\n## KV Buckets\n\nBuckets.\n");
    indexFile(db, filePath, tmpDir);

    const doc = db
      .query<{ last_status_change: string | null }, []>(
        "SELECT last_status_change FROM documents"
      )
      .get();
    expect(doc!.last_status_change).toBeNull();
  });

  test("commit_count starts at 0 (lineage scanner owns it)", () => {
    const filePath = join(docsDir, "adr-0001-telemetry.md");
    writeFileSync(filePath, "# ADR: Telemetry\n\n**Status**: accepted\n\n## Overview\n\nContent.\n");
    indexFile(db, filePath, tmpDir);

    const doc = db
      .query<{ commit_count: number }, []>("SELECT commit_count FROM documents")
      .get();
    expect(doc!.commit_count).toBe(0);
  });

  test("category classified from filename prefix", () => {
    // adr- prefix → adr
    const filePath = join(docsDir, "adr-2026-04-10-something.md");
    writeFileSync(filePath, "# ADR\n\n## Overview\n\nContent.\n");
    indexFile(db, filePath, tmpDir);

    const doc = db.query<{ category: string }, []>("SELECT category FROM documents").get()!;
    expect(doc.category).toBe("adr");

    unlinkSync(filePath);
    db.run("DELETE FROM documents");

    // spec- prefix → spec
    const filePath3 = join(docsDir, "spec-schema.md");
    writeFileSync(filePath3, "# Schema\n\n## Overview\n\nContent.\n");
    indexFile(db, filePath3, tmpDir);

    const doc3 = db.query<{ category: string }, []>("SELECT category FROM documents").get()!;
    expect(doc3.category).toBe("spec");

    unlinkSync(filePath3);
    db.run("DELETE FROM documents");

    // Other file → null category
    const filePath2 = join(docsDir, "notes.md");
    writeFileSync(filePath2, "# Notes\n\n## Section\n\nContent.\n");
    indexFile(db, filePath2, tmpDir);

    const doc2 = db.query<{ category: string | null }, []>("SELECT category FROM documents").get()!;
    expect(doc2.category).toBeNull();
  });
});

describe("indexAllDocs", () => {
  let db: Database;
  let tmpDir: string;
  let docsDir: string;

  beforeEach(() => {
    db = makeTestDb();
    tmpDir = mkdtempSync(join(tmpdir(), "docs-mcp-test-"));
    docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir);
  });

  afterEach(() => {
    try {
      const files = require("fs").readdirSync(docsDir);
      for (const f of files) unlinkSync(join(docsDir, f));
      rmdirSync(docsDir);
      rmdirSync(tmpDir);
    } catch {}
  });

  test("indexes all .md files in docs dir", () => {
    writeFileSync(join(docsDir, "adr-2026-04-10-a.md"), "# Doc A\n\n## Section A\n\nContent.\n");
    writeFileSync(join(docsDir, "adr-2026-04-10-b.md"), "# Doc B\n\n## Section B\n\nContent.\n");

    const changed = indexAllDocs(db, docsDir, tmpDir);
    expect(changed.length).toBe(2);

    const docs = db.query<{ path: string }, []>("SELECT path FROM documents ORDER BY path").all();
    expect(docs.length).toBe(2);
    expect(docs[0].path).toBe("docs/adr-2026-04-10-a.md");
    expect(docs[1].path).toBe("docs/adr-2026-04-10-b.md");
  });

  test("returns empty array when docs dir does not exist", () => {
    const nonExistentDir = join(tmpDir, "nonexistent");
    const changed = indexAllDocs(db, nonExistentDir, tmpDir);
    expect(changed).toEqual([]);
  });

  test("removes stale entries for deleted files", () => {
    const fileA = join(docsDir, "adr-2026-04-10-a.md");
    const fileB = join(docsDir, "adr-2026-04-10-b.md");
    writeFileSync(fileA, "# Doc A\n\n## Section A\n\nContent.\n");
    writeFileSync(fileB, "# Doc B\n\n## Section B\n\nContent.\n");

    indexAllDocs(db, docsDir, tmpDir);

    // Delete file B from disk
    unlinkSync(fileB);

    // Re-run indexAllDocs → should remove adr-2026-04-10-b.md from DB
    indexAllDocs(db, docsDir, tmpDir);

    const docs = db.query<{ path: string }, []>("SELECT path FROM documents").all();
    expect(docs.length).toBe(1);
    expect(docs[0].path).toBe("docs/adr-2026-04-10-a.md");
  });

  test("skips non-.md files", () => {
    writeFileSync(join(docsDir, "adr-2026-04-10-a.md"), "# Doc A\n\n## Section\n\nContent.\n");
    writeFileSync(join(docsDir, "README.txt"), "Not a markdown file");
    writeFileSync(join(docsDir, "notes.json"), '{"foo": "bar"}');

    const changed = indexAllDocs(db, docsDir, tmpDir);
    expect(changed.length).toBe(1);
  });

  test("returns doc paths for reindexed files (stale-removed files not in return)", () => {
    const fileA = join(docsDir, "adr-2026-04-10-a.md");
    const fileB = join(docsDir, "adr-2026-04-10-b.md");
    writeFileSync(fileA, "# Doc A\n\n## Section A\n\nContent.\n");
    writeFileSync(fileB, "# Doc B\n\n## Section B\n\nContent.\n");
    indexAllDocs(db, docsDir, tmpDir);

    // Delete B and force A to be reindexed
    unlinkSync(fileB);
    db.run("UPDATE documents SET mtime = 0 WHERE path = 'docs/adr-2026-04-10-a.md'");

    const changed = indexAllDocs(db, docsDir, tmpDir);
    // Only A was actually reindexed (indexFile returned true for A)
    // B was deleted from the DB but not returned in changed (stale removal)
    expect(changed).toContain("docs/adr-2026-04-10-a.md");
    expect(changed).not.toContain("docs/adr-2026-04-10-b.md");
  });
});
