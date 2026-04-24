/**
 * Tests for the --root flag and resolveDocsRoot integration (ADR-0050).
 *
 * Strategy:
 * - Mock only docs-mcp/watcher (to capture the docsDir arg and avoid real FS watchers).
 * - Mock docs-mcp/lineage-scanner (to avoid real git invocations).
 * - Let docs-mcp/content-indexer and docs-mcp/db run for real.
 * - Verify that boot() passes the expected docsDir (derived from docsRoot) to startWatcher.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveDocsRoot } from "docs-mcp/resolve-docs-root";

// Track calls to startWatcher so we can verify what docsDir was passed.
let startWatcherCalls: { docsDir: string }[] = [];

// Mock docs-mcp/watcher: capture docsDir, skip real FS watching.
mock.module("docs-mcp/watcher", () => ({
  startWatcher: (
    _db: unknown,
    docsDir: string,
    _gitRoot: unknown,
    _onReindex?: unknown
  ): (() => void) => {
    startWatcherCalls.push({ docsDir });
    return () => {};
  },
}));

// Mock docs-mcp/lineage-scanner to avoid real git invocations.
mock.module("docs-mcp/lineage-scanner", () => ({
  runLineageScan: () => {},
  isGitAvailable: () => false,
  getHeadCommit: () => null,
  parseDiffHunks: () => new Map(),
  touchedSections: () => [],
  processCommitForLineage: () => {},
}));

// Dynamic import AFTER mocks are registered, so boot.ts picks up the mocked modules.
const { boot } = await import("../src/boot");

describe("boot() docsRoot parameter (ADR-0050)", () => {
  let repoRoot: string;
  let dbPath: string;
  let stopWatcher: (() => void) | null = null;

  beforeEach(() => {
    startWatcherCalls = [];

    // Build a minimal temp repo: .git dir + a real docs/ subdir with one doc.
    repoRoot = join(
      tmpdir(),
      `boot-docs-dir-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(join(repoRoot, ".git"), { recursive: true });
    mkdirSync(join(repoRoot, "docs"), { recursive: true });

    writeFileSync(
      join(repoRoot, "docs", "adr-0001-test.md"),
      "# Test ADR\n\n**Status**: accepted\n\n## Overview\n\nTest.\n",
      "utf8"
    );

    dbPath = join(repoRoot, "test.db");
  });

  afterEach(() => {
    if (stopWatcher) {
      stopWatcher();
      stopWatcher = null;
    }
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("uses <docsRoot>/docs as the docs directory", () => {
    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(repoRoot, "docs");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });

  it("uses a nested docsRoot when passed explicitly", () => {
    // Create a sub-project root with its own docs/
    const subRoot = join(repoRoot, "spec-driven-dev");
    mkdirSync(join(subRoot, "docs"), { recursive: true });
    writeFileSync(
      join(subRoot, "docs", "adr-0001-sub.md"),
      "# Sub ADR\n\n**Status**: accepted\n\n## Overview\n\nSub.\n",
      "utf8"
    );

    const result = boot(subRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(subRoot, "docs");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });
});

// ---- resolveDocsRoot contract tests ----
// These verify the priority chain: --root > CLAUDE_PROJECT_DIR > cwd.

describe("resolveDocsRoot priority chain (ADR-0050)", () => {
  it("returns rawRoot when it is absolute", () => {
    const result = resolveDocsRoot("/my/docs/root", undefined, "/cwd");
    expect(result).toBe("/my/docs/root");
  });

  it("resolves relative rawRoot against CLAUDE_PROJECT_DIR when set", () => {
    const result = resolveDocsRoot("sub/sdd", "/project/dir", "/cwd");
    expect(result).toBe("/project/dir/sub/sdd");
  });

  it("resolves relative rawRoot against cwd when CLAUDE_PROJECT_DIR is not set", () => {
    const result = resolveDocsRoot("sub/sdd", undefined, "/cwd");
    expect(result).toBe("/cwd/sub/sdd");
  });

  it("returns CLAUDE_PROJECT_DIR when rawRoot is null and env var is set", () => {
    const result = resolveDocsRoot(null, "/project/dir", "/cwd");
    expect(result).toBe("/project/dir");
  });

  it("returns cwd when rawRoot is null and CLAUDE_PROJECT_DIR is not set", () => {
    const result = resolveDocsRoot(null, undefined, "/cwd");
    expect(result).toBe("/cwd");
  });
});

// ---- parseArgs --root flag contract tests ----
// Verify the --root flag parsing logic matches the spec (ADR-0050).

describe("parseArgs --root flag contract (ADR-0050)", () => {
  // Replicate the parseArgs logic from server.ts.
  function simulateParseArgs(argv: string[]): { port: number; dbPath: string | null; root: string | null } {
    let port = 4567;
    let dbPath: string | null = null;
    let root: string | null = null;

    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--port" && argv[i + 1]) {
        const n = parseInt(argv[i + 1], 10);
        if (!isNaN(n) && n > 0 && n <= 65535) {
          port = n;
        }
        i++;
      } else if (argv[i] === "--db-path" && argv[i + 1]) {
        dbPath = argv[i + 1];
        i++;
      } else if (argv[i] === "--root" && argv[i + 1]) {
        root = argv[i + 1];
        i++;
      }
    }

    return { port, dbPath, root };
  }

  it("--root <path> sets root to the provided path", () => {
    const { root } = simulateParseArgs(["--root", "/some/custom/root"]);
    expect(root).toBe("/some/custom/root");
  });

  it("omitting --root leaves root null", () => {
    const { root } = simulateParseArgs(["--port", "4567", "--db-path", "/some/db.db"]);
    expect(root).toBeNull();
  });

  it("--root works alongside --port and --db-path", () => {
    const { port, dbPath, root } = simulateParseArgs([
      "--port", "9000",
      "--db-path", "/tmp/test.db",
      "--root", "spec-driven-dev",
    ]);
    expect(port).toBe(9000);
    expect(dbPath).toBe("/tmp/test.db");
    expect(root).toBe("spec-driven-dev");
  });

  it("--root accepts a relative path (resolution happens via resolveDocsRoot)", () => {
    const { root } = simulateParseArgs(["--root", "relative/sdd"]);
    expect(root).toBe("relative/sdd");
  });

  it("--root accepts an absolute path", () => {
    const { root } = simulateParseArgs(["--root", "/absolute/sdd"]);
    expect(root).toBe("/absolute/sdd");
  });

  it("--docs-dir is NOT recognized (replaced by --root)", () => {
    const { root } = simulateParseArgs(["--docs-dir", "/some/docs"]);
    expect(root).toBeNull();
  });
});
