import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { seedTestDb } from "./testutil";
import { handleBlame, handleDiff } from "../src/routes";
import { spawnSync } from "child_process";
import { openDb } from "docs-mcp/db";
import { indexFile } from "docs-mcp/content-indexer";
import { join } from "path";
import { tmpdir } from "os";
import { mkdirSync, writeFileSync, rmSync } from "fs";

const ADR_CONTENT = `# ADR: Blame Test

**Status**: accepted

## Overview

Testing blame endpoint.
`;

let db: Database;
let repoRoot: string;
let cleanup: () => void;

beforeEach(() => {
  const result = seedTestDb({
    "adr-0001-blame-test.md": ADR_CONTENT,
  });
  db = result.db;
  repoRoot = result.repoRoot;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ---- /api/blame ----

describe("handleBlame", () => {
  it("returns 400 when doc param is missing", () => {
    const url = new URL("http://localhost/api/blame");
    const res = handleBlame(db, repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown doc", async () => {
    const url = new URL(
      "http://localhost/api/blame?doc=" +
        encodeURIComponent("docs/nonexistent.md")
    );
    const res = handleBlame(db, repoRoot, url);
    expect(res.status).toBe(404);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("not found");
  });

  it("returns 200 with empty blocks for a known doc with no blame data", async () => {
    // The test repo has a fake .git dir but no real git history, so blame_lines
    // will be empty. The endpoint should return 200 with { blocks: [], uncommitted_lines: [] }
    // (or just no blocks if blame_lines is empty).
    const url = new URL(
      "http://localhost/api/blame?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md")
    );
    const res = handleBlame(db, repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { blocks: unknown[]; uncommitted_lines: unknown[] };
    expect(Array.isArray(data.blocks)).toBe(true);
    expect(Array.isArray(data.uncommitted_lines)).toBe(true);
  });

  it("returns block data when blame_lines are populated", async () => {
    // Manually insert blame data into the DB
    const docRow = db
      .query<{ id: number }, [string]>("SELECT id FROM documents WHERE path = ?")
      .get("docs/adr-0001-blame-test.md");
    expect(docRow).not.toBeNull();
    const docId = docRow!.id;

    db.run(
      `INSERT INTO blame_lines (doc_id, line_start, line_end, "commit", author, date, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [docId, 1, 5, "abc1234def5678901234567890123456789012ab", "Alice", "2026-04-01", "feat: initial commit"]
    );

    const url = new URL(
      "http://localhost/api/blame?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md")
    );
    const res = handleBlame(db, repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as {
      blocks: { line_start: number; line_end: number; commit: string; author: string; date: string; summary: string; adrs: unknown[] }[];
      uncommitted_lines: number[];
    };
    expect(data.blocks.length).toBe(1);
    expect(data.blocks[0].line_start).toBe(1);
    expect(data.blocks[0].line_end).toBe(5);
    expect(data.blocks[0].commit).toBe("abc1234def5678901234567890123456789012ab");
    expect(data.blocks[0].author).toBe("Alice");
    expect(data.blocks[0].date).toBe("2026-04-01");
    expect(data.blocks[0].summary).toBe("feat: initial commit");
    expect(Array.isArray(data.blocks[0].adrs)).toBe(true);
  });

  it("returns 200 with empty response when since param provided (on-demand, no real git)", async () => {
    // The test repo is not a real git repo, so git blame will fail.
    // handleBlameOnDemand should return empty blocks on git failure.
    const url = new URL(
      "http://localhost/api/blame?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&since=2026-01-01"
    );
    const res = handleBlame(db, repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { blocks: unknown[]; uncommitted_lines: unknown[] };
    // git blame will fail in test env (fake repo), so empty is expected
    expect(Array.isArray(data.blocks)).toBe(true);
    expect(Array.isArray(data.uncommitted_lines)).toBe(true);
  });

  it("returns 200 with empty response when ref param provided (on-demand, no real git)", async () => {
    const url = new URL(
      "http://localhost/api/blame?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&ref=main"
    );
    const res = handleBlame(db, repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { blocks: unknown[]; uncommitted_lines: unknown[] };
    expect(Array.isArray(data.blocks)).toBe(true);
    expect(Array.isArray(data.uncommitted_lines)).toBe(true);
  });

  it("self-join returns co-modified ADRs in blame block", async () => {
    // Insert blame data for two docs sharing the same commit
    const doc1Row = db
      .query<{ id: number }, [string]>("SELECT id FROM documents WHERE path = ?")
      .get("docs/adr-0001-blame-test.md");
    expect(doc1Row).not.toBeNull();

    // Insert a second doc to act as a co-modified ADR
    db.run(
      `INSERT INTO documents (path, category, title, status, commit_count, mtime)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["docs/adr-0002-another.md", "adr", "Another ADR", "implemented", 1, Date.now()]
    );
    const doc2Row = db
      .query<{ id: number }, [string]>("SELECT id FROM documents WHERE path = ?")
      .get("docs/adr-0002-another.md");
    expect(doc2Row).not.toBeNull();

    const sharedCommit = "aaabbbccc1234567890123456789012345678901";

    db.run(
      `INSERT INTO blame_lines (doc_id, line_start, line_end, "commit", author, date, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [doc1Row!.id, 1, 3, sharedCommit, "Alice", "2026-04-01", "feat: shared commit"]
    );
    db.run(
      `INSERT INTO blame_lines (doc_id, line_start, line_end, "commit", author, date, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [doc2Row!.id, 5, 8, sharedCommit, "Alice", "2026-04-01", "feat: shared commit"]
    );

    const url = new URL(
      "http://localhost/api/blame?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md")
    );
    const res = handleBlame(db, repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as {
      blocks: { adrs: { doc_path: string }[] }[];
    };
    expect(data.blocks.length).toBe(1);
    // The co-modified doc should appear in adrs
    expect(data.blocks[0].adrs.length).toBe(1);
    expect(data.blocks[0].adrs[0].doc_path).toBe("docs/adr-0002-another.md");
  });
});

// ---- ADR-0084: methodology.dashboard.blame_uncommitted_lines_structured ----
//
// Verifier for: the `/api/blame` response's `uncommitted_lines` field must be
// an array of { line_start, line_end, kind } objects computed from
// `git diff HEAD -- <file>`, not flat line numbers.
//
// Setup: build a real git repo (git init + initial commit + working-tree edit)
// so the backend can detect actual uncommitted changes.
//
// RED until dev-harness lands the production change (findUncommittedLines
// currently returns number[], not structured objects).

/**
 * Initialise a temp directory as a real git repo, commit an initial doc,
 * then apply a working-tree edit.  Returns the repo root, the relative doc
 * path, a pre-seeded DB, and a cleanup function.
 */
function makeGitRepoWithUncommittedEdit(
  filename: string,
  committedContent: string,
  editedContent: string,
): { repoRoot: string; docRelPath: string; db: Database; cleanup: () => void } {
  const repoRoot = join(
    tmpdir(),
    `blame-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const docsDir = join(repoRoot, "docs");
  mkdirSync(docsDir, { recursive: true });

  const absDocPath = join(docsDir, filename);
  writeFileSync(absDocPath, committedContent, "utf8");

  // git init + initial commit
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  const run = (args: string[]) =>
    spawnSync("git", args, { cwd: repoRoot, env: gitEnv, encoding: "utf-8" });

  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  run(["add", "."]);
  run(["commit", "-m", "feat: initial commit"]);

  // Apply the working-tree edit (not staged, not committed)
  writeFileSync(absDocPath, editedContent, "utf8");

  // Seed the DB
  const dbDir = join(
    tmpdir(),
    `blame-db-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "test.db");
  const db = openDb(dbPath);
  indexFile(db, absDocPath, repoRoot);

  return {
    repoRoot,
    docRelPath: `docs/${filename}`,
    db,
    cleanup: () => {
      db.close();
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(dbDir, { recursive: true, force: true });
    },
  };
}

describe("handleBlame — ADR-0084 uncommitted_lines structured shape", () => {
  it("returns empty array when repoRoot is null", async () => {
    // When repoRoot is null the endpoint should return uncommitted_lines: []
    // regardless of what's in the DB.
    const { db: gitDb, cleanup: gitCleanup, docRelPath } = makeGitRepoWithUncommittedEdit(
      "adr-0084-null-root.md",
      "# Doc\n\nLine one.\nLine two.\n",
      "# Doc\n\nLine one.\nLine two.\nLine three.\n",
    );

    try {
      const url = new URL(
        "http://localhost/api/blame?doc=" + encodeURIComponent(`docs/${docRelPath.replace(/^docs\//, "")}`),
      );
      // Pass null for repoRoot — must return [] not an error
      const res = handleBlame(gitDb, null, url);
      expect(res.status).toBe(200);
      const data = await res.json() as { uncommitted_lines: unknown[] };
      expect(Array.isArray(data.uncommitted_lines)).toBe(true);
      expect(data.uncommitted_lines).toHaveLength(0);
    } finally {
      gitCleanup();
    }
  });

  it("returns structured objects (not plain numbers) when the file has added lines vs HEAD", async () => {
    // The committed version has 4 lines; the WT version adds a 5th line.
    // The structured shape should include at least one { line_start, line_end, kind: "added" }.
    // RED until dev-harness rewrites findUncommittedLines.
    const committedContent = "# Doc\n\nLine one.\nLine two.\n";
    const editedContent = "# Doc\n\nLine one.\nLine two.\nLine three — added.\n";

    const { repoRoot: gitRoot, docRelPath, db: gitDb, cleanup: gitCleanup } =
      makeGitRepoWithUncommittedEdit("adr-0084-added.md", committedContent, editedContent);

    try {
      const url = new URL(
        "http://localhost/api/blame?doc=" + encodeURIComponent(docRelPath),
      );
      const res = handleBlame(gitDb, gitRoot, url);
      expect(res.status).toBe(200);
      const data = await res.json() as {
        uncommitted_lines: Array<{ line_start: number; line_end: number; kind: "added" | "modified" }>;
      };

      // Must be an array of objects, not an array of plain numbers.
      expect(Array.isArray(data.uncommitted_lines)).toBe(true);
      expect(data.uncommitted_lines.length).toBeGreaterThan(0);

      for (const entry of data.uncommitted_lines) {
        // Each entry must be an object with the three required fields.
        expect(typeof entry).toBe("object");
        expect(entry).not.toBeNull();
        expect(typeof entry.line_start).toBe("number");
        expect(typeof entry.line_end).toBe("number");
        expect(entry.line_end).toBeGreaterThanOrEqual(entry.line_start);
        expect(entry.line_start).toBeGreaterThan(0);
        expect(["added", "modified"]).toContain(entry.kind);
      }

      // The added line(s) must carry kind: "added"
      const addedEntries = data.uncommitted_lines.filter((e) => e.kind === "added");
      expect(addedEntries.length).toBeGreaterThan(0);
    } finally {
      gitCleanup();
    }
  });

  it("returns kind: 'modified' entries when existing lines are changed", async () => {
    // The committed version has 4 lines; the WT version modifies line 3.
    // The structured shape should include at least one { kind: "modified" } entry.
    // RED until dev-harness rewrites findUncommittedLines.
    const committedContent = "# Doc\n\nLine one.\nLine two.\n";
    const editedContent = "# Doc\n\nLine one.\nLine two — modified.\n";

    const { repoRoot: gitRoot, docRelPath, db: gitDb, cleanup: gitCleanup } =
      makeGitRepoWithUncommittedEdit("adr-0084-modified.md", committedContent, editedContent);

    try {
      const url = new URL(
        "http://localhost/api/blame?doc=" + encodeURIComponent(docRelPath),
      );
      const res = handleBlame(gitDb, gitRoot, url);
      expect(res.status).toBe(200);
      const data = await res.json() as {
        uncommitted_lines: Array<{ line_start: number; line_end: number; kind: "added" | "modified" }>;
      };

      expect(Array.isArray(data.uncommitted_lines)).toBe(true);
      expect(data.uncommitted_lines.length).toBeGreaterThan(0);

      for (const entry of data.uncommitted_lines) {
        expect(typeof entry).toBe("object");
        expect(entry).not.toBeNull();
        expect(typeof entry.line_start).toBe("number");
        expect(typeof entry.line_end).toBe("number");
        expect(entry.line_end).toBeGreaterThanOrEqual(entry.line_start);
        expect(["added", "modified"]).toContain(entry.kind);
      }

      // At least one "modified" entry must be present
      const modifiedEntries = data.uncommitted_lines.filter((e) => e.kind === "modified");
      expect(modifiedEntries.length).toBeGreaterThan(0);
    } finally {
      gitCleanup();
    }
  });
});

// ---- /api/diff ----

describe("handleDiff", () => {
  it("returns 400 when doc param is missing", () => {
    const url = new URL("http://localhost/api/diff?commit=abc1234&line_start=1&line_end=5");
    const res = handleDiff(repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 400 when commit param is missing", () => {
    const url = new URL(
      "http://localhost/api/diff?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&line_start=1&line_end=5"
    );
    const res = handleDiff(repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 400 when line_start is missing", () => {
    const url = new URL(
      "http://localhost/api/diff?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&commit=abc1234&line_end=5"
    );
    const res = handleDiff(repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 400 when line_end is missing", () => {
    const url = new URL(
      "http://localhost/api/diff?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&commit=abc1234&line_start=1"
    );
    const res = handleDiff(repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid commit hash (not hex)", () => {
    const url = new URL(
      "http://localhost/api/diff?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&commit=INVALID!@#&line_start=1&line_end=5"
    );
    const res = handleDiff(repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 400 when line_start > line_end", () => {
    const url = new URL(
      "http://localhost/api/diff?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&commit=abc1234&line_start=10&line_end=5"
    );
    const res = handleDiff(repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 200 with empty diff when git is not available or commit not found", async () => {
    // The test repo is not a real git repo with history, so git show will fail.
    const url = new URL(
      "http://localhost/api/diff?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&commit=abc1234abcdef12345678901234567890123456&line_start=1&line_end=5"
    );
    const res = handleDiff(repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { diff: string };
    expect(typeof data.diff).toBe("string");
  });

  it("returns structured DiffResponse shape { diff: string }", async () => {
    const url = new URL(
      "http://localhost/api/diff?doc=" +
        encodeURIComponent("docs/adr-0001-blame-test.md") +
        "&commit=abc1234abcdef12345678901234567890123456&line_start=1&line_end=5"
    );
    const res = handleDiff(repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { diff?: string };
    expect("diff" in data).toBe(true);
    expect(typeof data.diff).toBe("string");
  });
});
