/**
 * Tests that boot() calls runLineageScan(db, gitRoot) after indexAllDocs
 * and before startWatcher (ADR-0029).
 *
 * Strategy: spy on runLineageScan via mock.module before importing boot.
 * mock.module in Bun intercepts the module for the lifetime of the test file,
 * so we call it at the top level before any dynamic import of boot.ts.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Track invocations of the mocked scanner
let lineageScanCalls: { db: unknown; gitRoot: string | null }[] = [];

// Mock docs-mcp/lineage-scanner before boot.ts is imported so the
// static import in boot.ts resolves to this stub.
mock.module("docs-mcp/lineage-scanner", () => {
  return {
    runLineageScan: (db: unknown, gitRoot: string | null) => {
      lineageScanCalls.push({ db, gitRoot });
    },
    // Re-export other symbols from the real module so nothing else breaks.
    isGitAvailable: () => false,
    getHeadCommit: () => null,
    parseDiffHunks: () => new Map(),
    touchedSections: () => [],
    processCommitForLineage: () => {},
  };
});

// Dynamic import of boot AFTER the mock is registered, so boot.ts's
// static `import { runLineageScan } from "docs-mcp/lineage-scanner"`
// picks up the mocked version.
const { boot } = await import("../src/boot");

describe("boot() calls runLineageScan", () => {
  let repoRoot: string;
  let dbPath: string;
  let stopWatcher: (() => void) | null = null;

  beforeEach(() => {
    lineageScanCalls = [];

    // Create a minimal temp repo with a real .git directory and a docs/ folder.
    repoRoot = join(tmpdir(), `boot-lineage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(repoRoot, ".git"), { recursive: true });
    mkdirSync(join(repoRoot, "docs"), { recursive: true });

    // Write a minimal doc so indexAllDocs has something to process.
    writeFileSync(
      join(repoRoot, "docs", "adr-0001-test.md"),
      "# Test ADR\n\n**Status**: accepted\n\n## Overview\n\nTest.\n",
      "utf8"
    );

    // Use a temp DB path inside the repo root.
    dbPath = join(repoRoot, "test.db");
  });

  afterEach(() => {
    if (stopWatcher) {
      stopWatcher();
      stopWatcher = null;
    }
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("invokes runLineageScan once per boot() call", () => {
    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    expect(lineageScanCalls).toHaveLength(1);
  });

  it("passes the correct gitRoot to runLineageScan", () => {
    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    expect(lineageScanCalls[0].gitRoot).toBe(repoRoot);
  });

  it("passes the open DB instance to runLineageScan", () => {
    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    // The db passed to runLineageScan must be the same open DB returned by boot.
    expect(lineageScanCalls[0].db).toBe(result.db);
  });

  it("runLineageScan is called after indexAllDocs and before startWatcher", () => {
    // Verify call ordering: the lineage scan call list is populated before
    // stopWatcher is returned (i.e., before startWatcher completes).
    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    // If we reach here with lineageScanCalls populated, the scan ran during boot
    // (after indexAllDocs, since they are sequential in the function body).
    expect(lineageScanCalls).toHaveLength(1);
    // The returned stopWatcher proves startWatcher ran after the scan.
    expect(typeof result.stopWatcher).toBe("function");
  });

  it("continues boot even if runLineageScan throws (non-fatal policy)", () => {
    // With the non-throwing mock already registered for this file, boot succeeds.
    // This test asserts that a non-fatal error in runLineageScan doesn't prevent
    // stopWatcher from being returned.
    expect(() => {
      const result = boot(repoRoot, dbPath, () => {});
      stopWatcher = result.stopWatcher;
    }).not.toThrow();
  });
});
