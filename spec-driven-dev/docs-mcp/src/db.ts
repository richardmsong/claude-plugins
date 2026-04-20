import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";

const SCHEMA_VERSION = "2";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  category TEXT,
  title TEXT,
  status TEXT,
  mtime REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  heading TEXT NOT NULL,
  content TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
  heading,
  content,
  content='sections',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS sections_ai AFTER INSERT ON sections BEGIN
  INSERT INTO sections_fts(rowid, heading, content)
  VALUES (new.id, new.heading, new.content);
END;

CREATE TRIGGER IF NOT EXISTS sections_ad AFTER DELETE ON sections BEGIN
  INSERT INTO sections_fts(sections_fts, rowid, heading, content)
  VALUES ('delete', old.id, old.heading, old.content);
END;

CREATE TRIGGER IF NOT EXISTS sections_au AFTER UPDATE ON sections BEGIN
  INSERT INTO sections_fts(sections_fts, rowid, heading, content)
  VALUES ('delete', old.id, old.heading, old.content);
  INSERT INTO sections_fts(rowid, heading, content)
  VALUES (new.id, new.heading, new.content);
END;

CREATE TABLE IF NOT EXISTS lineage (
  section_a_doc TEXT NOT NULL,
  section_a_heading TEXT NOT NULL,
  section_b_doc TEXT NOT NULL,
  section_b_heading TEXT NOT NULL,
  commit_count INTEGER NOT NULL DEFAULT 1,
  last_commit TEXT NOT NULL,
  PRIMARY KEY (section_a_doc, section_a_heading, section_b_doc, section_b_heading)
);

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(dbPath: string): Database {
  let db: Database;

  try {
    db = new Database(dbPath, { create: true });
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");

    // Check schema version
    db.exec(SCHEMA_SQL);

    const row = db
      .query<{ value: string }, []>("SELECT value FROM metadata WHERE key = 'schema_version'")
      .get();

    if (!row) {
      db.run("INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', ?)", [
        SCHEMA_VERSION,
      ]);
    } else if (row.value !== SCHEMA_VERSION) {
      // Schema mismatch: rebuild from scratch
      db.close();
      unlinkSync(dbPath);
      return openDb(dbPath);
    }
  } catch (err) {
    // Corrupt DB: delete and rebuild
    console.error(`[docs-mcp] DB open error, rebuilding: ${err}`);
    try {
      if (existsSync(dbPath)) unlinkSync(dbPath);
    } catch {}
    db = new Database(dbPath, { create: true });
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(SCHEMA_SQL);
    db.run("INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', ?)", [
      SCHEMA_VERSION,
    ]);
  }

  return db;
}
