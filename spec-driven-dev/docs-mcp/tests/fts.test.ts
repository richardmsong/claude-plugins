import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb } from "../src/db.js";
import { searchDocs } from "../src/tools.js";

function makeTestDb(): Database {
  // Use in-memory DB for tests
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      category TEXT,
      title TEXT,
      status TEXT,
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

function insertDoc(
  db: Database,
  path: string,
  title: string,
  category: string | null = null
): number {
  db.run("INSERT INTO documents(path, title, category, mtime) VALUES (?, ?, ?, 0)", [
    path,
    title,
    category,
  ]);
  return db.query<{ id: number }, [string]>("SELECT id FROM documents WHERE path = ?").get(path)!.id;
}

function insertSection(
  db: Database,
  docId: number,
  heading: string,
  content: string,
  lineStart = 1,
  lineEnd = 10
): void {
  db.run(
    "INSERT INTO sections(doc_id, heading, content, line_start, line_end) VALUES (?, ?, ?, ?, ?)",
    [docId, heading, content, lineStart, lineEnd]
  );
}

describe("FTS5 search", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();
    const docId1 = insertDoc(db, "docs/adr-2026-04-17-nats-security.md", "NATS Integration", "adr");
    insertSection(db, docId1, "Overview", "NATS JetStream is used for event streaming and pub/sub messaging.", 3, 15);
    insertSection(db, docId1, "Security", "All NATS subjects require JWT authentication.", 16, 30);

    const docId2 = insertDoc(db, "docs/spec-state-schema.md", "State Schema", "spec");
    insertSection(db, docId2, "KV Buckets", "KV buckets store session state and project configuration.", 3, 20);
    insertSection(db, docId2, "Data Types", "All values are JSON encoded.", 21, 35);
  });

  test("finds sections matching a keyword", () => {
    const results = searchDocs(db, { query: "NATS", limit: 10 });
    expect(results.length).toBeGreaterThan(0);
    const headings = results.map((r) => r.heading);
    expect(headings).toContain("Overview");
  });

  test("returns doc metadata with each result", () => {
    const results = searchDocs(db, { query: "JWT", limit: 10 });
    expect(results.length).toBe(1);
    expect(results[0].doc_path).toBe("docs/adr-2026-04-17-nats-security.md");
    expect(results[0].doc_title).toBe("NATS Integration");
    expect(results[0].category).toBe("adr");
    expect(results[0].heading).toBe("Security");
  });

  test("category filter limits results", () => {
    const adrResults = searchDocs(db, { query: "state", category: "adr", limit: 10 });
    const specResults = searchDocs(db, { query: "state", category: "spec", limit: 10 });

    // "state" appears in spec doc title/content but should not appear in adr category
    for (const r of adrResults) {
      expect(r.category).toBe("adr");
    }
    for (const r of specResults) {
      expect(r.category).toBe("spec");
    }
  });

  test("limit is respected", () => {
    // Add more sections so we exceed limit
    const docId = insertDoc(db, "docs/adr-2026-04-10-extra.md", "Extra", "adr");
    for (let i = 0; i < 15; i++) {
      insertSection(db, docId, `Section ${i}`, `Content about session management topic ${i}.`);
    }

    const results = searchDocs(db, { query: "session", limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test("rank is present", () => {
    const results = searchDocs(db, { query: "NATS JetStream", limit: 10 });
    for (const r of results) {
      expect(typeof r.rank).toBe("number");
    }
  });

  test("returns empty array for no matches", () => {
    const results = searchDocs(db, { query: "xyzzyplonknonexistentterm", limit: 10 });
    expect(results).toHaveLength(0);
  });

  test("FTS5 syntax error returns error", () => {
    // Invalid FTS5 query
    expect(() => searchDocs(db, { query: "AND OR", limit: 10 })).toThrow();
  });

  test("snippet is a string", () => {
    const results = searchDocs(db, { query: "session", limit: 10 });
    for (const r of results) {
      expect(typeof r.snippet).toBe("string");
    }
  });
});
