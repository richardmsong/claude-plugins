/**
 * Tests for spec-driven-config.json respect in boot() (ADR-0083).
 *
 * Strategy:
 * - Mock only docs-mcp/watcher (to capture the docsDir arg and avoid real FS watchers).
 * - Mock docs-mcp/lineage-scanner (to avoid real git invocations).
 * - Let docs-mcp/content-indexer and docs-mcp/db run for real.
 * - Verify that boot() passes the expected docsDir (derived from spec-driven-config.json)
 *   to startWatcher.
 *
 * All tests in this file are EXPECTED TO FAIL on first run because boot.ts does not yet
 * read spec-driven-config.json. That is the correct red state for this verifier.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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

describe("boot() respects spec-driven-config.json (ADR-0083)", () => {
  let repoRoot: string;
  let dbPath: string;
  let stopWatcher: (() => void) | null = null;

  beforeEach(() => {
    startWatcherCalls = [];

    // Build a minimal temp repo: .git dir only. Each test adds what it needs.
    repoRoot = join(
      tmpdir(),
      `boot-config-respect-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(join(repoRoot, ".git"), { recursive: true });

    dbPath = join(repoRoot, "test.db");
  });

  afterEach(() => {
    if (stopWatcher) {
      stopWatcher();
      stopWatcher = null;
    }
    rmSync(repoRoot, { recursive: true, force: true });
  });

  // Case 1: config present with relative spec.adr_dir → watcher receives <docsRoot>/<adr_dir>
  it("uses spec.adr_dir from config when present and relative", () => {
    mkdirSync(join(repoRoot, "alternate-docs"), { recursive: true });
    writeFileSync(
      join(repoRoot, "alternate-docs", "adr-0001-test.md"),
      "# Test ADR\n\n**Status**: accepted\n\n## Overview\n\nTest.\n",
      "utf8"
    );
    writeFileSync(
      join(repoRoot, "spec-driven-config.json"),
      JSON.stringify({ spec: { adr_dir: "alternate-docs" } }),
      "utf8"
    );

    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(repoRoot, "alternate-docs");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });

  // Case 2: config absent → watcher receives <docsRoot>/docs
  it("falls back to <docsRoot>/docs when no config file is present", () => {
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(
      join(repoRoot, "docs", "adr-0001-test.md"),
      "# Test ADR\n\n**Status**: accepted\n\n## Overview\n\nTest.\n",
      "utf8"
    );

    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(repoRoot, "docs");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });

  // Case 3a: config present but spec.adr_dir is missing → fallback to <docsRoot>/docs
  it("falls back to <docsRoot>/docs when config lacks spec.adr_dir", () => {
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(
      join(repoRoot, "docs", "adr-0001-test.md"),
      "# Test ADR\n\n**Status**: accepted\n\n## Overview\n\nTest.\n",
      "utf8"
    );
    writeFileSync(
      join(repoRoot, "spec-driven-config.json"),
      JSON.stringify({ spec: {} }),
      "utf8"
    );

    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(repoRoot, "docs");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });

  // Case 3b: config present but spec.adr_dir is empty string → fallback to <docsRoot>/docs
  it("falls back to <docsRoot>/docs when config has empty spec.adr_dir", () => {
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(
      join(repoRoot, "docs", "adr-0001-test.md"),
      "# Test ADR\n\n**Status**: accepted\n\n## Overview\n\nTest.\n",
      "utf8"
    );
    writeFileSync(
      join(repoRoot, "spec-driven-config.json"),
      JSON.stringify({ spec: { adr_dir: "" } }),
      "utf8"
    );

    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(repoRoot, "docs");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });

  // Case 3c: config present but spec.adr_dir is whitespace only → fallback to <docsRoot>/docs
  it("falls back to <docsRoot>/docs when config has whitespace-only spec.adr_dir", () => {
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(
      join(repoRoot, "docs", "adr-0001-test.md"),
      "# Test ADR\n\n**Status**: accepted\n\n## Overview\n\nTest.\n",
      "utf8"
    );
    writeFileSync(
      join(repoRoot, "spec-driven-config.json"),
      JSON.stringify({ spec: { adr_dir: "   " } }),
      "utf8"
    );

    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    const expectedDocsDir = join(repoRoot, "docs");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });

  // Case 4: config present with absolute spec.adr_dir → that absolute path is used as-is
  it("uses absolute spec.adr_dir from config without further resolution", () => {
    // Create a separate absolute path dir to use as the docs dir
    const absoluteDocsDir = join(
      tmpdir(),
      `boot-config-respect-abs-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(absoluteDocsDir, { recursive: true });
    writeFileSync(
      join(absoluteDocsDir, "adr-0001-test.md"),
      "# Test ADR\n\n**Status**: accepted\n\n## Overview\n\nTest.\n",
      "utf8"
    );

    writeFileSync(
      join(repoRoot, "spec-driven-config.json"),
      JSON.stringify({ spec: { adr_dir: absoluteDocsDir } }),
      "utf8"
    );

    let result: ReturnType<typeof boot> | undefined;
    try {
      result = boot(repoRoot, dbPath, () => {});
      stopWatcher = result.stopWatcher;

      expect(startWatcherCalls).toHaveLength(1);
      expect(startWatcherCalls[0].docsDir).toBe(absoluteDocsDir);
    } finally {
      rmSync(absoluteDocsDir, { recursive: true, force: true });
    }
  });

  // Case 5: config present but malformed JSON → boot() throws an Error
  it("throws an Error when spec-driven-config.json contains malformed JSON", () => {
    writeFileSync(
      join(repoRoot, "spec-driven-config.json"),
      "{ this is not valid json !!!",
      "utf8"
    );

    expect(() => {
      const result = boot(repoRoot, dbPath, () => {});
      // In case boot() somehow doesn't throw, capture stopWatcher for cleanup
      stopWatcher = result.stopWatcher;
    }).toThrow();
  });

  // Case 6: config present with spec.adr_dir pointing at a nonexistent path →
  // startWatcher still receives the configured (nonexistent) path; no silent fallback.
  // Contract: methodology.dashboard.respects_configured_paths (bad-path branch).
  // This test is EXPECTED TO FAIL on first run because boot.ts does not yet read
  // spec-driven-config.json. That is the correct red state.
  it("honors configured spec.adr_dir even when the resolved path does not exist on disk", () => {
    // Deliberately do NOT create "nonexistent-dir" — it must not exist.
    writeFileSync(
      join(repoRoot, "spec-driven-config.json"),
      JSON.stringify({ spec: { adr_dir: "nonexistent-dir" } }),
      "utf8"
    );

    const result = boot(repoRoot, dbPath, () => {});
    stopWatcher = result.stopWatcher;

    // The configured path must be passed to startWatcher as-is, with no fallback to
    // <docsRoot>/docs/ — even though "nonexistent-dir" does not exist on disk.
    const expectedDocsDir = join(repoRoot, "nonexistent-dir");
    expect(startWatcherCalls).toHaveLength(1);
    expect(startWatcherCalls[0].docsDir).toBe(expectedDocsDir);
  });
});
