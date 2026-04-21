import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getLineage } from "../src/tools.js";

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

function insertDoc(db: Database, path: string, title: string, category: string | null): number {
  db.run("INSERT INTO documents(path, title, category, mtime) VALUES (?, ?, ?, 0)", [
    path,
    title,
    category,
  ]);
  return db.query<{ id: number }, [string]>("SELECT id FROM documents WHERE path = ?").get(path)!.id;
}

function insertLineage(
  db: Database,
  docA: string,
  headA: string,
  docB: string,
  headB: string,
  commitCount: number,
  lastCommit: string
) {
  db.run(
    `INSERT INTO lineage(section_a_doc, section_a_heading, section_b_doc, section_b_heading, commit_count, last_commit)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [docA, headA, docB, headB, commitCount, lastCommit]
  );
}

describe("getLineage", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();

    // Setup two docs with sections
    insertDoc(db, "docs/adr-2026-04-17-nats-security.md", "NATS Integration", "adr");
    insertDoc(db, "docs/adr-2026-04-10-k8s-integration.md", "K8s Integration", "adr");
    insertDoc(db, "docs/spec-state-schema.md", "State Schema", "spec");

    // Lineage edges: adr-nats Security ↔ adr-k8s Session Lifecycle
    insertLineage(
      db,
      "docs/adr-2026-04-17-nats-security.md", "Security",
      "docs/adr-2026-04-10-k8s-integration.md", "Session Lifecycle",
      3, "abc123"
    );
    insertLineage(
      db,
      "docs/adr-2026-04-17-nats-security.md", "Security",
      "docs/spec-state-schema.md", "KV Buckets",
      5, "def456"
    );
  });

  test("returns lineage edges for a section", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-2026-04-17-nats-security.md",
      heading: "Security",
    });
    expect(results.length).toBe(2);
  });

  test("includes doc metadata for related sections", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-2026-04-17-nats-security.md",
      heading: "Security",
    });
    const k8sEdge = results.find((r) => r.doc_path === "docs/adr-2026-04-10-k8s-integration.md");
    expect(k8sEdge).toBeDefined();
    expect(k8sEdge!.doc_title).toBe("K8s Integration");
    expect(k8sEdge!.category).toBe("adr");
    expect(k8sEdge!.heading).toBe("Session Lifecycle");
  });

  test("sorted by commit_count descending", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-2026-04-17-nats-security.md",
      heading: "Security",
    });
    expect(results[0].commit_count).toBeGreaterThanOrEqual(results[1].commit_count);
    // spec-state-schema edge has count=5, k8s edge has count=3
    expect(results[0].doc_path).toBe("docs/spec-state-schema.md");
    expect(results[0].commit_count).toBe(5);
    expect(results[1].commit_count).toBe(3);
  });

  test("last_commit is returned", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-2026-04-17-nats-security.md",
      heading: "Security",
    });
    const specEdge = results.find((r) => r.doc_path === "docs/spec-state-schema.md");
    expect(specEdge!.last_commit).toBe("def456");
  });

  test("omits edges where doc no longer exists in index", () => {
    // Remove the spec-state-schema doc
    db.run("DELETE FROM documents WHERE path = 'docs/spec-state-schema.md'");

    const results = getLineage(db, {
      doc_path: "docs/adr-2026-04-17-nats-security.md",
      heading: "Security",
    });
    // Only k8s edge remains
    expect(results.length).toBe(1);
    expect(results[0].doc_path).toBe("docs/adr-2026-04-10-k8s-integration.md");
  });

  test("returns empty array for section with no lineage", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-2026-04-17-nats-security.md",
      heading: "Overview",
    });
    expect(results).toHaveLength(0);
  });

  test("returns empty array for unknown doc", () => {
    const results = getLineage(db, {
      doc_path: "docs/nonexistent.md",
      heading: "Whatever",
    });
    expect(results).toHaveLength(0);
  });
});
