// Tests for:
// 1. Parser/classifier recursion: nested docs/ui/spec-x.md, docs/mclaude-z/spec-x.md,
//    symlink avoidance, stale-removal correctness after removing nested files.
// 2. Watcher single-file reindex where filename is a nested relative path.
// 3. Status parser: extracts each of the five status values; returns null for
//    ADRs without a status line and for non-ADRs.
// 4. list_docs / search_docs with status filter.
// 5. get_lineage skips draft/superseded/withdrawn ADRs.
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  rmSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { indexFile, indexAllDocs } from "../src/content-indexer.js";
import { parseMarkdown, classifyCategory } from "../src/parser.js";
import { searchDocs, listDocs, getLineage } from "../src/tools.js";

// ---- Schema helpers ----

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

function insertDoc(
  db: Database,
  path: string,
  title: string,
  category: string | null = null,
  status: string | null = null
): number {
  db.run(
    "INSERT INTO documents(path, title, category, status, mtime) VALUES (?, ?, ?, ?, 0)",
    [path, title, category, status]
  );
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

// ---- Temp dir helper ----

function makeTempDocs(): { tmpDir: string; docsDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), "docs-mcp-recurse-"));
  const docsDir = join(tmpDir, "docs");
  mkdirSync(docsDir);
  return { tmpDir, docsDir };
}

// ============================================================
// 1. RECURSION: indexAllDocs walks subdirectories
// ============================================================

describe("indexAllDocs recursion", () => {
  let db: Database;
  let tmpDir: string;
  let docsDir: string;

  beforeEach(() => {
    db = makeTestDb();
    ({ tmpDir, docsDir } = makeTempDocs());
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("indexes .md files in a nested subdirectory (docs/ui/spec-*.md)", () => {
    const uiDir = join(docsDir, "ui");
    mkdirSync(uiDir);

    writeFileSync(
      join(uiDir, "spec-design-system.md"),
      "# Design System\n\n## Tokens\n\nDesign tokens here.\n"
    );

    const changed = indexAllDocs(db, docsDir, tmpDir);
    expect(changed.length).toBe(1);

    const doc = db
      .query<{ path: string; category: string }, []>(
        "SELECT path, category FROM documents"
      )
      .get();
    expect(doc).toBeDefined();
    expect(doc!.path).toBe("docs/ui/spec-design-system.md");
    expect(doc!.category).toBe("spec");
  });

  test("indexes .md files in docs/mclaude-*/spec-*.md paths", () => {
    const mcpDir = join(docsDir, "mclaude-docs-mcp");
    mkdirSync(mcpDir);

    writeFileSync(
      join(mcpDir, "spec-docs-mcp.md"),
      "# Docs MCP Spec\n\n## Overview\n\nThe docs MCP server.\n"
    );

    indexAllDocs(db, docsDir, tmpDir);

    const doc = db
      .query<{ path: string; category: string }, []>(
        "SELECT path, category FROM documents"
      )
      .get();
    expect(doc!.path).toBe("docs/mclaude-docs-mcp/spec-docs-mcp.md");
    expect(doc!.category).toBe("spec");
  });

  test("indexes files at multiple depths simultaneously", () => {
    // Root level
    writeFileSync(
      join(docsDir, "adr-0001-telemetry.md"),
      "# ADR: Telemetry\n\n**Status**: accepted\n\n## Overview\n\nTelemetry decisions.\n"
    );
    // One level deep
    const uiDir = join(docsDir, "ui");
    mkdirSync(uiDir);
    writeFileSync(
      join(uiDir, "spec-navigation.md"),
      "# Navigation\n\n## Routes\n\nRoute table.\n"
    );
    // Two levels deep
    const webDir = join(uiDir, "mclaude-web");
    mkdirSync(webDir);
    writeFileSync(
      join(webDir, "spec-dashboard.md"),
      "# Dashboard\n\n## Screens\n\nDashboard screen.\n"
    );

    const changed = indexAllDocs(db, docsDir, tmpDir);
    expect(changed.length).toBe(3);

    const paths = db
      .query<{ path: string }, []>("SELECT path FROM documents ORDER BY path")
      .all()
      .map((r) => r.path);

    expect(paths).toContain("docs/adr-0001-telemetry.md");
    expect(paths).toContain("docs/ui/spec-navigation.md");
    expect(paths).toContain("docs/ui/mclaude-web/spec-dashboard.md");
  });

  test("skips symlinked directories to avoid loops", () => {
    const realDir = join(docsDir, "ui");
    mkdirSync(realDir);
    writeFileSync(
      join(realDir, "spec-nav.md"),
      "# Nav\n\n## Routes\n\nRoutes.\n"
    );

    // Create a symlink loop: docs/ui/loop -> docs/ui
    const loopLink = join(realDir, "loop");
    try {
      symlinkSync(realDir, loopLink);
    } catch {
      // If symlink creation fails (unlikely), skip this test
      return;
    }

    // Should not hang or crash — the symlink is skipped
    const changed = indexAllDocs(db, docsDir, tmpDir);
    expect(changed.length).toBe(1); // Only the real spec-nav.md

    const paths = db
      .query<{ path: string }, []>("SELECT path FROM documents")
      .all()
      .map((r) => r.path);
    expect(paths).toEqual(["docs/ui/spec-nav.md"]);
  });

  test("stale-removal correctly removes nested files no longer on disk", () => {
    const uiDir = join(docsDir, "ui");
    mkdirSync(uiDir);

    const fileA = join(docsDir, "adr-0001-telemetry.md");
    const fileB = join(uiDir, "spec-navigation.md");

    writeFileSync(fileA, "# ADR: Telemetry\n\n## Overview\n\nTelemetry.\n");
    writeFileSync(fileB, "# Nav\n\n## Routes\n\nRoutes.\n");

    indexAllDocs(db, docsDir, tmpDir);

    let docs = db.query<{ path: string }, []>("SELECT path FROM documents ORDER BY path").all();
    expect(docs.length).toBe(2);
    expect(docs.map((d) => d.path)).toContain("docs/ui/spec-navigation.md");

    // Delete nested file
    unlinkSync(fileB);

    // Re-run → stale removal should drop spec-navigation.md
    indexAllDocs(db, docsDir, tmpDir);

    docs = db.query<{ path: string }, []>("SELECT path FROM documents").all();
    expect(docs.length).toBe(1);
    expect(docs[0].path).toBe("docs/adr-0001-telemetry.md");
  });

  test("stale-removal does NOT delete nested files that still exist", () => {
    const uiDir = join(docsDir, "ui");
    mkdirSync(uiDir);

    writeFileSync(join(docsDir, "adr-0001-foo.md"), "# ADR\n\n## Overview\n\nContent.\n");
    writeFileSync(join(uiDir, "spec-nav.md"), "# Nav\n\n## Routes\n\nRoutes.\n");

    indexAllDocs(db, docsDir, tmpDir);

    // Run again without changes — neither file should be removed
    indexAllDocs(db, docsDir, tmpDir);

    const docs = db.query<{ path: string }, []>("SELECT path FROM documents ORDER BY path").all();
    expect(docs.length).toBe(2);
  });
});

// ============================================================
// 2. WATCHER: runReindex handles nested relative filenames
// ============================================================

describe("indexFile handles nested relative paths (watcher path)", () => {
  let db: Database;
  let tmpDir: string;
  let docsDir: string;

  beforeEach(() => {
    db = makeTestDb();
    ({ tmpDir, docsDir } = makeTempDocs());
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("indexFile resolves nested filename via join(docsDir, filename)", () => {
    // Simulate what runReindex does when macOS FSEvents reports a nested path:
    //   filename = "ui/spec-design-system.md"
    //   fullPath = join(docsDir, filename) = docsDir + "/ui/spec-design-system.md"
    const uiDir = join(docsDir, "ui");
    mkdirSync(uiDir);
    writeFileSync(
      join(uiDir, "spec-design-system.md"),
      "# Design System\n\n## Tokens\n\nTokens here.\n"
    );

    const nestedFilename = "ui/spec-design-system.md";
    const fullPath = join(docsDir, nestedFilename);

    const result = indexFile(db, fullPath, tmpDir);
    expect(result).toBe(true);

    const doc = db
      .query<{ path: string }, []>("SELECT path FROM documents")
      .get();
    expect(doc!.path).toBe("docs/ui/spec-design-system.md");
  });

  test("indexFile resolves two-level nested filename", () => {
    const webDir = join(docsDir, "ui", "mclaude-web");
    mkdirSync(join(docsDir, "ui"));
    mkdirSync(webDir);
    writeFileSync(
      join(webDir, "spec-dashboard.md"),
      "# Dashboard\n\n## Overview\n\nDashboard.\n"
    );

    const nestedFilename = "ui/mclaude-web/spec-dashboard.md";
    const fullPath = join(docsDir, nestedFilename);

    const result = indexFile(db, fullPath, tmpDir);
    expect(result).toBe(true);

    const doc = db
      .query<{ path: string }, []>("SELECT path FROM documents")
      .get();
    expect(doc!.path).toBe("docs/ui/mclaude-web/spec-dashboard.md");
  });

  test("classifyCategory works for nested spec- paths", () => {
    expect(classifyCategory("docs/ui/spec-design-system.md")).toBe("spec");
    expect(classifyCategory("docs/ui/mclaude-web/spec-dashboard.md")).toBe("spec");
    expect(classifyCategory("docs/mclaude-docs-mcp/spec-docs-mcp.md")).toBe("spec");
  });

  test("classifyCategory: adr- at root still classified as adr", () => {
    // ADRs remain flat at docs/ root — classify by basename prefix
    expect(classifyCategory("docs/adr-0001-telemetry.md")).toBe("adr");
    expect(classifyCategory("adr-0020-docs-per-component-folders.md")).toBe("adr");
  });
});

// ============================================================
// 3. STATUS PARSER
// ============================================================

describe("parseMarkdown — status extraction", () => {
  test("extracts 'draft' status", () => {
    const md = "# ADR: Foo\n\n**Status**: draft\n\n## Overview\n\nContent.\n";
    expect(parseMarkdown(md).status).toBe("draft");
  });

  test("extracts 'accepted' status", () => {
    const md = "# ADR: Foo\n\n**Status**: accepted\n\n## Overview\n\nContent.\n";
    expect(parseMarkdown(md).status).toBe("accepted");
  });

  test("extracts 'implemented' status", () => {
    const md = "# ADR: Foo\n\n**Status**: implemented\n\n## Overview\n\nContent.\n";
    expect(parseMarkdown(md).status).toBe("implemented");
  });

  test("extracts 'superseded' status", () => {
    const md = "# ADR: Foo\n\n**Status**: superseded\n\n## Overview\n\nContent.\n";
    expect(parseMarkdown(md).status).toBe("superseded");
  });

  test("extracts 'withdrawn' status", () => {
    const md = "# ADR: Foo\n\n**Status**: withdrawn\n\n## Overview\n\nContent.\n";
    expect(parseMarkdown(md).status).toBe("withdrawn");
  });

  test("returns null when no status line present", () => {
    const md = "# ADR: Foo\n\n## Overview\n\nContent.\n";
    expect(parseMarkdown(md).status).toBeNull();
  });

  test("returns null for non-ADR doc without status line", () => {
    const md = "# State Schema\n\n## KV Buckets\n\nBuckets here.\n";
    expect(parseMarkdown(md).status).toBeNull();
  });

  test("does not extract status from deep in document body (after line 20)", () => {
    // Status line placed deep in body — should not be extracted
    const lines = [
      "# ADR: Foo",
      "",
      "## Overview",
      ...Array(25).fill("Some content line."),
      "**Status**: accepted",  // line 29+ — beyond scan window
      "## Decisions",
      "Content.",
    ];
    const md = lines.join("\n");
    expect(parseMarkdown(md).status).toBeNull();
  });

  test("status written to DB during indexFile", () => {
    const { tmpDir, docsDir } = makeTempDocs();
    const db = makeTestDb();
    try {
      writeFileSync(
        join(docsDir, "adr-0018-adr-status-lifecycle.md"),
        "# ADR: Status Lifecycle\n\n**Status**: accepted\n\n## Overview\n\nContent.\n"
      );
      indexFile(db, join(docsDir, "adr-0018-adr-status-lifecycle.md"), tmpDir);

      const doc = db
        .query<{ status: string | null }, []>("SELECT status FROM documents")
        .get();
      expect(doc!.status).toBe("accepted");
    } finally {
      db.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("status is null in DB for doc without status line", () => {
    const { tmpDir, docsDir } = makeTempDocs();
    const db = makeTestDb();
    try {
      writeFileSync(
        join(docsDir, "spec-state-schema.md"),
        "# State Schema\n\n## KV Buckets\n\nBuckets.\n"
      );
      indexFile(db, join(docsDir, "spec-state-schema.md"), tmpDir);

      const doc = db
        .query<{ status: string | null }, []>("SELECT status FROM documents")
        .get();
      expect(doc!.status).toBeNull();
    } finally {
      db.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// 4. list_docs / search_docs with status filter
// ============================================================

describe("listDocs status filter", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();

    const d1 = insertDoc(db, "docs/adr-0001-telemetry.md", "Telemetry", "adr", "accepted");
    insertSection(db, d1, "Overview", "Telemetry overview.", 3, 10);

    const d2 = insertDoc(db, "docs/adr-0002-containers.md", "Containers", "adr", "draft");
    insertSection(db, d2, "Overview", "Container decisions.", 3, 10);

    const d3 = insertDoc(db, "docs/adr-0003-k8s.md", "K8s Integration", "adr", "implemented");
    insertSection(db, d3, "Overview", "K8s cluster integration.", 3, 10);

    const d4 = insertDoc(db, "docs/adr-0004-old.md", "Old ADR", "adr", "superseded");
    insertSection(db, d4, "Overview", "This was superseded.", 3, 10);

    const d5 = insertDoc(db, "docs/spec-state-schema.md", "State Schema", "spec", null);
    insertSection(db, d5, "KV Buckets", "KV bucket definitions.", 3, 20);
  });

  afterEach(() => {
    db.close();
  });

  test("status=accepted returns only accepted ADRs", () => {
    const results = listDocs(db, { status: "accepted" });
    expect(results.length).toBe(1);
    expect(results[0].doc_path).toBe("docs/adr-0001-telemetry.md");
  });

  test("status=draft returns only draft ADRs", () => {
    const results = listDocs(db, { status: "draft" });
    expect(results.length).toBe(1);
    expect(results[0].doc_path).toBe("docs/adr-0002-containers.md");
  });

  test("status=implemented returns only implemented ADRs", () => {
    const results = listDocs(db, { status: "implemented" });
    expect(results.length).toBe(1);
    expect(results[0].doc_path).toBe("docs/adr-0003-k8s.md");
  });

  test("status=superseded returns only superseded ADRs", () => {
    const results = listDocs(db, { status: "superseded" });
    expect(results.length).toBe(1);
    expect(results[0].doc_path).toBe("docs/adr-0004-old.md");
  });

  test("category=adr + status=accepted: combined filter works", () => {
    const results = listDocs(db, { category: "adr", status: "accepted" });
    expect(results.length).toBe(1);
    expect(results[0].doc_path).toBe("docs/adr-0001-telemetry.md");
  });

  test("no status filter returns all docs", () => {
    const results = listDocs(db, {});
    expect(results.length).toBe(5);
  });

  test("status filter on a status that no doc has returns empty array", () => {
    const results = listDocs(db, { status: "withdrawn" });
    expect(results.length).toBe(0);
  });
});

describe("searchDocs status filter", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();

    const d1 = insertDoc(db, "docs/adr-0001-telemetry.md", "Telemetry ADR", "adr", "accepted");
    insertSection(db, d1, "Overview", "Telemetry metrics collection accepted decision.", 3, 10);

    const d2 = insertDoc(db, "docs/adr-0002-draft.md", "Draft ADR", "adr", "draft");
    insertSection(db, d2, "Overview", "Telemetry draft decision under review.", 3, 10);

    const d3 = insertDoc(db, "docs/spec-state-schema.md", "State Schema", "spec", null);
    insertSection(db, d3, "Overview", "State schema telemetry fields.", 3, 20);
  });

  afterEach(() => {
    db.close();
  });

  test("status=accepted filters search to accepted docs only", () => {
    const results = searchDocs(db, { query: "telemetry", status: "accepted", limit: 10 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      // Verify the result comes from the accepted doc
      expect(r.doc_path).toBe("docs/adr-0001-telemetry.md");
    }
  });

  test("status=draft filters search to draft docs only", () => {
    const results = searchDocs(db, { query: "telemetry", status: "draft", limit: 10 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.doc_path).toBe("docs/adr-0002-draft.md");
    }
  });

  test("category + status combined filter", () => {
    const results = searchDocs(db, { query: "telemetry", category: "adr", status: "accepted", limit: 10 });
    for (const r of results) {
      expect(r.category).toBe("adr");
      expect(r.doc_path).toBe("docs/adr-0001-telemetry.md");
    }
  });

  test("no status filter includes all docs", () => {
    const results = searchDocs(db, { query: "telemetry", limit: 10 });
    const paths = new Set(results.map((r) => r.doc_path));
    expect(paths.size).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// 5. get_lineage returns ALL statuses (per ADR-0027 amending ADR-0018)
// ============================================================

describe("getLineage — no status filter (ADR-0027)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();

    // Source ADR (the one we query from)
    insertDoc(db, "docs/adr-0016-nats-security.md", "NATS Security", "adr", "accepted");

    // Connected docs with various statuses
    insertDoc(db, "docs/adr-0003-k8s.md", "K8s Integration", "adr", "accepted");
    insertDoc(db, "docs/adr-0002-draft.md", "Draft ADR", "adr", "draft");
    insertDoc(db, "docs/adr-0004-superseded.md", "Superseded ADR", "adr", "superseded");
    insertDoc(db, "docs/adr-0005-withdrawn.md", "Withdrawn ADR", "adr", "withdrawn");
    insertDoc(db, "docs/adr-0006-implemented.md", "Implemented ADR", "adr", "implemented");
    insertDoc(db, "docs/spec-state-schema.md", "State Schema", "spec", null);

    // Lineage edges: nats-security Security → all the above
    const edges = [
      ["docs/adr-0003-k8s.md", "Session Lifecycle"],
      ["docs/adr-0002-draft.md", "Overview"],
      ["docs/adr-0004-superseded.md", "Overview"],
      ["docs/adr-0005-withdrawn.md", "Overview"],
      ["docs/adr-0006-implemented.md", "Overview"],
      ["docs/spec-state-schema.md", "KV Buckets"],
    ] as [string, string][];

    for (const [docB, headB] of edges) {
      insertLineage(
        db,
        "docs/adr-0016-nats-security.md",
        "Security",
        docB,
        headB,
        1,
        "abc123"
      );
    }
  });

  afterEach(() => {
    db.close();
  });

  test("returns accepted ADR edges", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-0016-nats-security.md",
      heading: "Security",
    });
    const paths = results.map((r) => r.doc_path);
    expect(paths).toContain("docs/adr-0003-k8s.md");
  });

  test("returns implemented ADR edges", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-0016-nats-security.md",
      heading: "Security",
    });
    const paths = results.map((r) => r.doc_path);
    expect(paths).toContain("docs/adr-0006-implemented.md");
  });

  test("returns spec edges (null status)", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-0016-nats-security.md",
      heading: "Security",
    });
    const paths = results.map((r) => r.doc_path);
    expect(paths).toContain("docs/spec-state-schema.md");
  });

  test("includes draft ADR edges (historical context per ADR-0027)", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-0016-nats-security.md",
      heading: "Security",
    });
    const paths = results.map((r) => r.doc_path);
    expect(paths).toContain("docs/adr-0002-draft.md");
  });

  test("includes superseded ADR edges (historical context per ADR-0027)", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-0016-nats-security.md",
      heading: "Security",
    });
    const paths = results.map((r) => r.doc_path);
    expect(paths).toContain("docs/adr-0004-superseded.md");
  });

  test("includes withdrawn ADR edges (historical context per ADR-0027)", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-0016-nats-security.md",
      heading: "Security",
    });
    const paths = results.map((r) => r.doc_path);
    expect(paths).toContain("docs/adr-0005-withdrawn.md");
  });

  test("total returned edges: all 6 — no status filtering", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-0016-nats-security.md",
      heading: "Security",
    });
    // All 6 edges returned: accepted, draft, superseded, withdrawn, implemented, spec
    expect(results.length).toBe(6);
  });

  test("each result includes a status field", () => {
    const results = getLineage(db, {
      doc_path: "docs/adr-0016-nats-security.md",
      heading: "Security",
    });
    const draftRow = results.find((r) => r.doc_path === "docs/adr-0002-draft.md");
    expect(draftRow).toBeDefined();
    expect(draftRow!.status).toBe("draft");

    const specRow = results.find((r) => r.doc_path === "docs/spec-state-schema.md");
    expect(specRow).toBeDefined();
    expect(specRow!.status).toBeNull();
  });
});
