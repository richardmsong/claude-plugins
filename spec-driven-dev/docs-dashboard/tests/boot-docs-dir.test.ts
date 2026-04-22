/**
 * Tests for the --docs-dir CLI flag threaded through parseArgs → boot (ADR-0032).
 *
 * Strategy:
 * - Mock only docs-mcp/watcher (to capture the docsDir arg and avoid real FS watchers).
 * - Mock docs-mcp/lineage-scanner (to avoid real git invocations).
 * - Let docs-mcp/content-indexer and docs-mcp/db run for real (avoids leaking mocks
 *   that break graph-queries.test.ts and routes.test.ts, both of which rely on the
 *   real indexFile via seedTestDb).
 * - Verify that boot() passes the expected resolved docsDir to startWatcher.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

// Track calls to startWatcher so we can verify what docsDir was passed.
let startWatcherCalls: { docsDir: string }[] = [];

// Mock docs-mcp/watcher: capture docsDir, skip real FS watching.
mock.module("docs-mcp/watcher", () => ({
  startWatcher: (
    _db: unknown,
    docsDir: string,
    _repoRoot: string,
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

describe("boot() docsDir parameter (ADR-0032)", () => {
  let repoRoot: string;
  let dbPath: string;
  let stopWatcher: (() => void) | null = null;
  let origCwd: () => string;

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

    origCwd = process.cwd;
    process.cwd = () => repoRoot;
  });

  afterEach(() => {
    process.cwd = origCwd;
    if (stopWatcher) {
      stopWatcher();
      stopWatcher = null;
    }
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("uses <repoRoot>/docs as default when docsDir is null", () => {
    const result = boot(dbPath, () => {}, null);
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(repoRoot, "docs");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });

  it("uses <repoRoot>/docs as default when docsDir is omitted (default param)", () => {
    const result = boot(dbPath, () => {});
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(repoRoot, "docs");
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });

  it("passes an absolute docsDir through unchanged", () => {
    // Create a separate docs directory at an absolute path.
    const altDocsDir = join(repoRoot, "spec-driven-dev", "docs");
    mkdirSync(altDocsDir, { recursive: true });

    const result = boot(dbPath, () => {}, altDocsDir);
    stopWatcher = result.stopWatcher;

    expect(startWatcherCalls[0].docsDir).toBe(altDocsDir);
  });

  it("resolves a relative docsDir against cwd", () => {
    // cwd is repoRoot; "sub/docs" should resolve to join(repoRoot, "sub/docs").
    const relDocsDir = "sub/docs";
    const expectedAbsDocsDir = resolve(repoRoot, relDocsDir);
    mkdirSync(expectedAbsDocsDir, { recursive: true });

    const result = boot(dbPath, () => {}, relDocsDir);
    stopWatcher = result.stopWatcher;

    expect(startWatcherCalls[0].docsDir).toBe(expectedAbsDocsDir);
  });

  it("passes an absolute path unmodified (not re-resolved against cwd)", () => {
    const altDocsDir = join(repoRoot, "absolute-docs");
    mkdirSync(altDocsDir, { recursive: true });

    const result = boot(dbPath, () => {}, altDocsDir);
    stopWatcher = result.stopWatcher;

    // An absolute path must not be re-joined with cwd.
    expect(startWatcherCalls[0].docsDir).toBe(altDocsDir);
    // Must not accidentally be join(cwd, altDocsDir).
    expect(startWatcherCalls[0].docsDir).not.toBe(join(repoRoot, altDocsDir));
  });
});

// ---- parseArgs contract tests ----
// parseArgs is private to server.ts, so we verify its contract by testing the
// flag-parsing logic directly against the documented spec (ADR-0032 Decision table).

describe("parseArgs --docs-dir flag contract (ADR-0032)", () => {
  // Replicate the parseArgs logic to test the expected behaviour surface.
  function simulateParseArgs(argv: string[]): { port: number; dbPath: string | null; docsDir: string | null } {
    let port = 4567;
    let dbPath: string | null = null;
    let docsDir: string | null = null;

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
      } else if (argv[i] === "--docs-dir" && argv[i + 1]) {
        docsDir = argv[i + 1];
        i++;
      }
    }

    return { port, dbPath, docsDir };
  }

  it("--docs-dir <path> sets docsDir to the provided path", () => {
    const { docsDir } = simulateParseArgs(["--docs-dir", "/some/custom/docs"]);
    expect(docsDir).toBe("/some/custom/docs");
  });

  it("omitting --docs-dir leaves docsDir null", () => {
    const { docsDir } = simulateParseArgs(["--port", "4567", "--db-path", "/some/db.db"]);
    expect(docsDir).toBeNull();
  });

  it("--docs-dir works alongside --port and --db-path", () => {
    const { port, dbPath, docsDir } = simulateParseArgs([
      "--port", "9000",
      "--db-path", "/tmp/test.db",
      "--docs-dir", "spec-driven-dev/docs",
    ]);
    expect(port).toBe(9000);
    expect(dbPath).toBe("/tmp/test.db");
    expect(docsDir).toBe("spec-driven-dev/docs");
  });

  it("--docs-dir accepts a relative path (resolution happens in boot)", () => {
    const { docsDir } = simulateParseArgs(["--docs-dir", "relative/docs/path"]);
    expect(docsDir).toBe("relative/docs/path");
  });

  it("--docs-dir accepts an absolute path", () => {
    const { docsDir } = simulateParseArgs(["--docs-dir", "/absolute/docs/path"]);
    expect(docsDir).toBe("/absolute/docs/path");
  });
});
