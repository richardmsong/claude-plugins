import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getSection, listDocs } from "../src/tools.js";

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      category TEXT,
      title TEXT,
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

describe("getSection", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();
    const docId = insertDoc(db, "docs/plan-nats.md", "NATS Integration", "design");
    insertSection(db, docId, "Overview", "NATS JetStream overview content.", 3, 15);
    insertSection(db, docId, "Security", "JWT authentication required.", 16, 30);

    const docId2 = insertDoc(db, "docs/spec-schema.md", "State Schema", "spec");
    insertSection(db, docId2, "KV Buckets", "KV bucket definitions here.", 3, 20);
  });

  test("returns correct section content", () => {
    const result = getSection(db, {
      doc_path: "docs/plan-nats.md",
      heading: "Overview",
    });
    expect(result.content).toBe("NATS JetStream overview content.");
    expect(result.heading).toBe("Overview");
  });

  test("returns full section metadata", () => {
    const result = getSection(db, {
      doc_path: "docs/plan-nats.md",
      heading: "Security",
    });
    expect(result.doc_path).toBe("docs/plan-nats.md");
    expect(result.doc_title).toBe("NATS Integration");
    expect(result.category).toBe("design");
    expect(result.heading).toBe("Security");
    expect(result.line_start).toBe(16);
    expect(result.line_end).toBe(30);
  });

  test("returns section from spec doc", () => {
    const result = getSection(db, {
      doc_path: "docs/spec-schema.md",
      heading: "KV Buckets",
    });
    expect(result.doc_title).toBe("State Schema");
    expect(result.category).toBe("spec");
    expect(result.content).toBe("KV bucket definitions here.");
  });

  test("throws error for missing doc", () => {
    expect(() =>
      getSection(db, { doc_path: "docs/nonexistent.md", heading: "Overview" })
    ).toThrow("Section not found");
  });

  test("throws error for missing heading in existing doc", () => {
    expect(() =>
      getSection(db, { doc_path: "docs/plan-nats.md", heading: "Nonexistent Heading" })
    ).toThrow("Section not found");
  });

  test("throws error when both doc and heading are missing", () => {
    expect(() =>
      getSection(db, { doc_path: "docs/missing.md", heading: "Missing" })
    ).toThrow();
  });
});

describe("listDocs", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();

    const docId1 = insertDoc(db, "docs/plan-nats.md", "NATS Integration", "design");
    insertSection(db, docId1, "Overview", "Overview content.", 3, 10);
    insertSection(db, docId1, "Security", "Security content.", 11, 20);

    const docId2 = insertDoc(db, "docs/spec-schema.md", "State Schema", "spec");
    insertSection(db, docId2, "KV Buckets", "KV bucket content.", 3, 15);

    const docId3 = insertDoc(db, "docs/design-auth.md", "Auth Design", "design");
    insertSection(db, docId3, "Overview", "Auth overview.", 3, 10);
  });

  test("returns all docs when no category filter", () => {
    const results = listDocs(db, {});
    expect(results.length).toBe(3);
  });

  test("each doc has sections array", () => {
    const results = listDocs(db, {});
    for (const doc of results) {
      expect(Array.isArray(doc.sections)).toBe(true);
    }
  });

  test("sections contain heading, line_start, line_end", () => {
    const results = listDocs(db, {});
    const nats = results.find((r) => r.doc_path === "docs/plan-nats.md");
    expect(nats).toBeDefined();
    expect(nats!.sections).toHaveLength(2);
    expect(nats!.sections[0].heading).toBe("Overview");
    expect(nats!.sections[0].line_start).toBe(3);
    expect(nats!.sections[0].line_end).toBe(10);
  });

  test("category filter returns only design docs", () => {
    const results = listDocs(db, { category: "design" });
    expect(results.length).toBe(2);
    for (const doc of results) {
      expect(doc.category).toBe("design");
    }
  });

  test("category filter returns only spec docs", () => {
    const results = listDocs(db, { category: "spec" });
    expect(results.length).toBe(1);
    expect(results[0].doc_path).toBe("docs/spec-schema.md");
    expect(results[0].category).toBe("spec");
  });

  test("each doc entry includes doc_path and title", () => {
    const results = listDocs(db, {});
    const schema = results.find((r) => r.doc_path === "docs/spec-schema.md");
    expect(schema).toBeDefined();
    expect(schema!.title).toBe("State Schema");
    expect(schema!.category).toBe("spec");
  });

  test("returns empty array when no docs match category filter", () => {
    // No null-category docs exist in this fixture
    // Use a fresh empty db
    const emptyDb = makeTestDb();
    const results = listDocs(emptyDb, { category: "design" });
    expect(results).toHaveLength(0);
  });

  test("sections ordered by line_start", () => {
    const results = listDocs(db, {});
    const nats = results.find((r) => r.doc_path === "docs/plan-nats.md");
    expect(nats!.sections[0].heading).toBe("Overview");
    expect(nats!.sections[1].heading).toBe("Security");
    expect(nats!.sections[0].line_start).toBeLessThan(nats!.sections[1].line_start);
  });
});
