// Verifier for: methodology.dashboard.diff_endpoint_three_modes
//
// ADR-0084 extends /api/diff to three modes:
//   (a) ?commit=<h>&line_start=<n>&line_end=<n>  — existing range-scoped diff
//   (b) ?commit=<h>                               — full-file commit-vs-parent diff (NEW)
//   (c) ?working_tree=1                           — working-tree vs HEAD diff (NEW)
//
// Modes (b) and (c) are RED until dev-harness lands the production change.
// Current handleDiff requires line_start and line_end and returns 400 when
// they are absent, so modes (b) and (c) will fail (return 400 / wrong shape).

import { describe, it, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleDiff } from "../src/routes";
import { spawnSync } from "child_process";
import { openDb } from "docs-mcp/db";
import { indexFile } from "docs-mcp/content-indexer";
import { join } from "path";
import { tmpdir } from "os";
import { mkdirSync, writeFileSync, rmSync } from "fs";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface GitRepo {
  repoRoot: string;
  docRelPath: string;  // e.g. "docs/adr-0084-diff-test.md"
  db: Database;
  /** SHA of the second commit (has the interesting changes) */
  commitHash: string;
  cleanup: () => void;
}

/**
 * Build a temp real git repo with two commits and an optional working-tree edit.
 *
 *   commit 1: initialContent
 *   commit 2: secondContent   ← commitHash points here
 *   working tree: wtContent   (may equal secondContent when no WT edit wanted)
 */
function makeGitRepoWithHistory(
  filename: string,
  initialContent: string,
  secondContent: string,
  wtContent: string = secondContent,
): GitRepo {
  const repoRoot = join(
    tmpdir(),
    `diff-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const docsDir = join(repoRoot, "docs");
  mkdirSync(docsDir, { recursive: true });

  const absDocPath = join(docsDir, filename);

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

  // commit 1
  writeFileSync(absDocPath, initialContent, "utf8");
  run(["add", "."]);
  run(["commit", "-m", "chore: initial"]);

  // commit 2
  writeFileSync(absDocPath, secondContent, "utf8");
  run(["add", "."]);
  run(["commit", "-m", "feat: second commit"]);

  // Read the SHA of the second commit (HEAD)
  const headResult = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  const commitHash = headResult.stdout.trim();

  // Optional working-tree edit (not staged)
  if (wtContent !== secondContent) {
    writeFileSync(absDocPath, wtContent, "utf8");
  }

  // Seed the DB
  const dbDir = join(
    tmpdir(),
    `diff-db-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "test.db");
  const db = openDb(dbPath);
  indexFile(db, absDocPath, repoRoot);

  return {
    repoRoot,
    docRelPath: `docs/${filename}`,
    db,
    commitHash,
    cleanup: () => {
      db.close();
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(dbDir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Mode (a) — range-scoped commit diff (existing behavior, must stay green)
// ---------------------------------------------------------------------------

describe("handleDiff — mode (a): range-scoped commit diff", () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) repo.cleanup();
  });

  it("returns non-empty diff text covering the changed range for a real commit", async () => {
    repo = makeGitRepoWithHistory(
      "adr-0084-mode-a.md",
      // initial: 5 lines
      "# Doc\n\nLine one.\nLine two.\nLine three.\n",
      // second commit modifies line 4 and adds a line
      "# Doc\n\nLine one.\nLine two — changed.\nLine three.\nLine four — added.\n",
    );

    // The change in commit 2 touches lines 4–6 (new file numbering after diff).
    // We request a range that covers those lines.
    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&commit=" + encodeURIComponent(repo.commitHash) +
        "&line_start=4&line_end=6",
    );
    const res = handleDiff(repo.repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { diff: string };
    expect(typeof data.diff).toBe("string");
    // The diff must be non-empty and contain a hunk header
    expect(data.diff.length).toBeGreaterThan(0);
    expect(data.diff).toContain("@@");
  });

  it("returns 400 when commit hash is invalid", () => {
    repo = makeGitRepoWithHistory(
      "adr-0084-mode-a-invalid.md",
      "Line one.\n",
      "Line one.\nLine two.\n",
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&commit=NOT_A_HASH!&line_start=1&line_end=2",
    );
    const res = handleDiff(repo.repoRoot, url);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// HTTP 400 contract — partial-range and missing-doc cases (ADR-0084)
//
// The registered definition for diff_endpoint_three_modes explicitly covers the
// 400 case: "returns HTTP 400 for any other parameter combination including
// partial-range (exactly one of line_start/line_end present), missing doc, or
// invalid commit hash."
//
// These tests are GREEN against the current implementation because handleDiff
// already returns 400 for each of these malformed requests.
// ---------------------------------------------------------------------------

describe("handleDiff — HTTP 400 for malformed parameter combinations (ADR-0084)", () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) repo.cleanup();
  });

  it("returns 400 when commit is provided with line_start but no line_end (partial-range)", () => {
    repo = makeGitRepoWithHistory(
      "adr-0084-partial-range-start.md",
      "Line one.\n",
      "Line one.\nLine two.\n",
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&commit=" + encodeURIComponent(repo.commitHash) +
        "&line_start=5",
      // line_end intentionally absent
    );
    const res = handleDiff(repo.repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 400 when commit is provided with line_end but no line_start (partial-range)", () => {
    repo = makeGitRepoWithHistory(
      "adr-0084-partial-range-end.md",
      "Line one.\n",
      "Line one.\nLine two.\n",
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&commit=" + encodeURIComponent(repo.commitHash) +
        "&line_end=5",
      // line_start intentionally absent
    );
    const res = handleDiff(repo.repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the doc query param is missing entirely", () => {
    repo = makeGitRepoWithHistory(
      "adr-0084-missing-doc.md",
      "Line one.\n",
      "Line one.\nLine two.\n",
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?commit=" + encodeURIComponent(repo.commitHash) +
        "&line_start=1&line_end=2",
      // doc param intentionally absent
    );
    const res = handleDiff(repo.repoRoot, url);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Mode (b) — full-file commit-vs-parent diff (NEW — ADR-0084)
// RED until dev-harness lands the production change.
// Current code returns 400 (missing line_start/line_end); mode (b) must return
// 200 with non-empty diff text containing every changed line for the commit.
// ---------------------------------------------------------------------------

describe("handleDiff — mode (b): full-file commit-vs-parent diff (ADR-0084)", () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) repo.cleanup();
  });

  it("returns 200 with non-empty diff text when only commit is provided (no line range)", async () => {
    // RED: current code returns 400 for missing line_start/line_end.
    repo = makeGitRepoWithHistory(
      "adr-0084-mode-b.md",
      "# Doc\n\nOriginal line.\n",
      "# Doc\n\nOriginal line.\nNew line in commit two.\n",
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&commit=" + encodeURIComponent(repo.commitHash),
    );
    const res = handleDiff(repo.repoRoot, url);
    // Must be 200, not 400
    expect(res.status).toBe(200);
    const data = await res.json() as { diff: string };
    expect(typeof data.diff).toBe("string");
    // The full-file diff must be non-empty and contain the changed content
    expect(data.diff.length).toBeGreaterThan(0);
    expect(data.diff).toContain("New line in commit two.");
  });

  it("returns diff text that contains every changed line for the commit", async () => {
    // RED: same as above — verifies the content is complete (not range-filtered).
    repo = makeGitRepoWithHistory(
      "adr-0084-mode-b-full.md",
      "# Doc\n\nAlpha.\nBeta.\nGamma.\n",
      "# Doc\n\nAlpha — edited.\nBeta.\nGamma.\nDelta — added.\n",
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&commit=" + encodeURIComponent(repo.commitHash),
    );
    const res = handleDiff(repo.repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { diff: string };
    expect(typeof data.diff).toBe("string");
    expect(data.diff.length).toBeGreaterThan(0);
    // Both the edit on line 3 AND the addition at the end must appear
    expect(data.diff).toContain("Alpha — edited.");
    expect(data.diff).toContain("Delta — added.");
  });
});

// ---------------------------------------------------------------------------
// Mode (c) — working-tree vs HEAD diff (NEW — ADR-0084)
// RED until dev-harness lands the production change.
// Current code requires commit param and returns 400 when it is absent.
// ---------------------------------------------------------------------------

describe("handleDiff — mode (c): working-tree vs HEAD diff (ADR-0084)", () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) repo.cleanup();
  });

  it("returns 200 with non-empty diff text when working_tree=1 is provided", async () => {
    // RED: current code returns 400 (missing commit param).
    repo = makeGitRepoWithHistory(
      "adr-0084-mode-c.md",
      "# Doc\n\nCommitted line.\n",
      "# Doc\n\nCommitted line.\nSecond committed line.\n",
      // working-tree adds a third line
      "# Doc\n\nCommitted line.\nSecond committed line.\nWorking tree addition.\n",
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&working_tree=1",
    );
    const res = handleDiff(repo.repoRoot, url);
    // Must be 200, not 400
    expect(res.status).toBe(200);
    const data = await res.json() as { diff: string };
    expect(typeof data.diff).toBe("string");
    // The WT diff must be non-empty and contain the uncommitted addition
    expect(data.diff.length).toBeGreaterThan(0);
    expect(data.diff).toContain("Working tree addition.");
  });

  it("returns 200 with diff reflecting a working-tree edit to an existing line", async () => {
    // RED: same as above — verifies the WT diff reflects a modification, not just an addition.
    repo = makeGitRepoWithHistory(
      "adr-0084-mode-c-edit.md",
      "# Doc\n\nLine A.\nLine B.\n",
      "# Doc\n\nLine A.\nLine B.\n",
      // working-tree modifies line B
      "# Doc\n\nLine A.\nLine B — working tree edit.\n",
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&working_tree=1",
    );
    const res = handleDiff(repo.repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { diff: string };
    expect(typeof data.diff).toBe("string");
    expect(data.diff.length).toBeGreaterThan(0);
    expect(data.diff).toContain("Line B — working tree edit.");
  });

  it("returns 200 with empty diff string when there are no working-tree changes", async () => {
    // No WT edit — repo HEAD == working tree.  Diff must be empty (no overlay needed).
    repo = makeGitRepoWithHistory(
      "adr-0084-mode-c-clean.md",
      "# Doc\n\nNo changes.\n",
      "# Doc\n\nNo changes.\n",
      // wtContent same as secondContent → no WT edit
    );

    const url = new URL(
      "http://localhost/api/diff" +
        "?doc=" + encodeURIComponent(repo.docRelPath) +
        "&working_tree=1",
    );
    const res = handleDiff(repo.repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { diff: string };
    expect(typeof data.diff).toBe("string");
    // No uncommitted changes → diff must be empty
    expect(data.diff).toBe("");
  });
});
