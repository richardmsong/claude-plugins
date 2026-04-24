import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";

// ---------------------------------------------------------------------------
// Helpers that mirror the production logic in server.ts.
//
// server.ts has three behaviors gated on CLAUDE_PLUGIN_ROOT that cannot be
// tested by importing the module directly, because UI_DIST is evaluated at
// module scope (its value is frozen at import time) and main() is unexported.
//
// Following the same pattern as sse.test.ts (which extracts the SSE broker
// logic locally rather than importing it from server.ts), we extract the
// three behaviours as pure helpers and test those.
// ---------------------------------------------------------------------------

/**
 * Mirrors the UI_DIST ternary at server.ts:153-155.
 * Called at "module load" time in production; here called per-test so the
 * env var can be toggled between tests.
 */
function resolveUiDist(pluginRoot: string | undefined, importMetaDir: string): string {
  return pluginRoot
    ? join(pluginRoot, "dist/ui")
    : join(importMetaDir, "../ui/dist");
}

/**
 * Mirrors the auto-build guard and error-log branch in server.ts:194-217.
 *
 * Returns a description of what action was taken so tests can assert on it
 * without actually invoking Bun.spawn or touching the filesystem beyond
 * the tmpdir fixtures.
 *
 * - "skipped"         — CLAUDE_PLUGIN_ROOT is set, dist exists → nothing to do
 * - "error-logged"    — CLAUDE_PLUGIN_ROOT is set, dist missing → log error, skip build
 * - "build-triggered" — CLAUDE_PLUGIN_ROOT unset, dist missing → trigger build
 * - "build-skipped"   — CLAUDE_PLUGIN_ROOT unset, dist already exists → nothing to do
 */
function runBuildGuard(
  pluginRoot: string | undefined,
  indexHtml: string,
  logger: { log: (msg: string) => void; error: (msg: string) => void },
  spawnBuild: () => void,
): "skipped" | "error-logged" | "build-triggered" | "build-skipped" {
  if (!pluginRoot) {
    // self-dev mode
    if (!existsSync(indexHtml)) {
      logger.log("[docs-dashboard] Building UI...");
      spawnBuild();
      return "build-triggered";
    }
    return "build-skipped";
  } else {
    // distributed install — pre-built UI only
    if (!existsSync(indexHtml)) {
      logger.error(
        "[docs-dashboard] Pre-built UI missing at dist/ui/ — SPA will show fallback. Re-run build.sh to fix."
      );
      return "error-logged";
    }
    return "skipped";
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTmpDir(): { dir: string; cleanup: () => void } {
  const dir = join(
    tmpdir(),
    `plugin-root-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// 1. UI_DIST ternary
// ---------------------------------------------------------------------------

describe("UI_DIST resolution (server.ts:153-155)", () => {
  it("when CLAUDE_PLUGIN_ROOT is set — resolves to <CLAUDE_PLUGIN_ROOT>/dist/ui", () => {
    const pluginRoot = "/installed/plugin/root";
    const result = resolveUiDist(pluginRoot, "/irrelevant/src/dir");
    expect(result).toBe("/installed/plugin/root/dist/ui");
  });

  it("when CLAUDE_PLUGIN_ROOT is unset — resolves to <importMetaDir>/../ui/dist", () => {
    const importMetaDir = "/repo/src/sdd/docs-dashboard/src";
    const result = resolveUiDist(undefined, importMetaDir);
    // join normalises the ..
    expect(result).toBe("/repo/src/sdd/docs-dashboard/ui/dist");
  });

  it("pluginRoot path is used verbatim — no extra path segments added", () => {
    const pluginRoot = "/home/user/.claude/plugins/sdd";
    const result = resolveUiDist(pluginRoot, "/does/not/matter");
    expect(result).toBe("/home/user/.claude/plugins/sdd/dist/ui");
  });

  it("self-dev path is joined relative to importMetaDir, not cwd", () => {
    const importMetaDir = "/different/absolute/path";
    const result = resolveUiDist(undefined, importMetaDir);
    // path.join normalises the ".." segment
    expect(result).toBe("/different/absolute/ui/dist");
    // Verify the join expression matches directly
    expect(result).toBe(join(importMetaDir, "../ui/dist"));
  });
});

// ---------------------------------------------------------------------------
// 2. Auto-build guard — CLAUDE_PLUGIN_ROOT NOT set (self-dev mode)
// ---------------------------------------------------------------------------

describe("Auto-build guard — self-dev mode (CLAUDE_PLUGIN_ROOT unset)", () => {
  let dir: string;
  let cleanup: () => void;
  let logs: string[];
  let errors: string[];
  let spawned: boolean;

  beforeEach(() => {
    ({ dir, cleanup } = makeTmpDir());
    logs = [];
    errors = [];
    spawned = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("triggers build when index.html is missing and CLAUDE_PLUGIN_ROOT is unset", () => {
    const indexHtml = join(dir, "index.html"); // does not exist
    const logger = {
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
    };

    const outcome = runBuildGuard(
      undefined, // no CLAUDE_PLUGIN_ROOT
      indexHtml,
      logger,
      () => { spawned = true; },
    );

    expect(outcome).toBe("build-triggered");
    expect(spawned).toBe(true);
    expect(logs.some((l) => l.includes("Building UI"))).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("skips build when index.html already exists and CLAUDE_PLUGIN_ROOT is unset", () => {
    const indexHtml = join(dir, "index.html");
    writeFileSync(indexHtml, "<!doctype html><html></html>");

    const logger = {
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
    };

    const outcome = runBuildGuard(
      undefined,
      indexHtml,
      logger,
      () => { spawned = true; },
    );

    expect(outcome).toBe("build-skipped");
    expect(spawned).toBe(false);
    expect(logs).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Error-log-only path — CLAUDE_PLUGIN_ROOT set, dist missing
// ---------------------------------------------------------------------------

describe("Error-log-only path — plugin-root mode (CLAUDE_PLUGIN_ROOT set)", () => {
  let dir: string;
  let cleanup: () => void;
  let logs: string[];
  let errors: string[];
  let spawned: boolean;

  beforeEach(() => {
    ({ dir, cleanup } = makeTmpDir());
    logs = [];
    errors = [];
    spawned = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("logs an error when index.html is missing — does NOT trigger build", () => {
    const indexHtml = join(dir, "index.html"); // does not exist

    const logger = {
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
    };

    const outcome = runBuildGuard(
      "/some/plugin/root", // CLAUDE_PLUGIN_ROOT is set
      indexHtml,
      logger,
      () => { spawned = true; }, // must NOT be called
    );

    expect(outcome).toBe("error-logged");
    expect(spawned).toBe(false); // build never triggered
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Pre-built UI missing at dist/ui/");
    expect(logs).toHaveLength(0); // no "Building UI" log
  });

  it("does nothing when index.html exists in plugin-root mode", () => {
    const indexHtml = join(dir, "index.html");
    writeFileSync(indexHtml, "<!doctype html><html></html>");

    const logger = {
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
    };

    const outcome = runBuildGuard(
      "/some/plugin/root",
      indexHtml,
      logger,
      () => { spawned = true; },
    );

    expect(outcome).toBe("skipped");
    expect(spawned).toBe(false);
    expect(logs).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("error message mentions build.sh so the user knows how to fix it", () => {
    const indexHtml = join(dir, "index.html"); // missing

    const errors: string[] = [];
    runBuildGuard(
      "/plugin/root",
      indexHtml,
      { log: () => {}, error: (m) => errors.push(m) },
      () => {},
    );

    expect(errors[0]).toContain("build.sh");
  });
});

// ---------------------------------------------------------------------------
// 4. Mutual exclusion — the two branches never both fire
// ---------------------------------------------------------------------------

describe("Plugin-root mode and self-dev mode are mutually exclusive", () => {
  let dir: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ dir, cleanup } = makeTmpDir());
  });

  afterEach(() => {
    cleanup();
  });

  it("setting CLAUDE_PLUGIN_ROOT suppresses build even when index.html is absent", () => {
    const indexHtml = join(dir, "missing.html");
    let buildCalled = false;

    runBuildGuard(
      "/set",
      indexHtml,
      { log: () => {}, error: () => {} },
      () => { buildCalled = true; },
    );

    expect(buildCalled).toBe(false);
  });

  it("omitting CLAUDE_PLUGIN_ROOT never triggers the error-log branch", () => {
    const indexHtml = join(dir, "missing.html");
    const errors: string[] = [];

    runBuildGuard(
      undefined,
      indexHtml,
      { log: () => {}, error: (m) => errors.push(m) },
      () => {},
    );

    // self-dev mode logs to .log, never to .error
    expect(errors).toHaveLength(0);
  });
});
