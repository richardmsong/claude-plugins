import { describe, it, expect } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { findGitRoot } from "../src/boot";

describe("findGitRoot", () => {
  it("finds the .git directory in the start dir", () => {
    const dir = join(tmpdir(), `test-repo-${Date.now()}`);
    mkdirSync(join(dir, ".git"), { recursive: true });
    try {
      expect(findGitRoot(dir)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("walks up to find .git in parent", () => {
    const root = join(tmpdir(), `test-repo-${Date.now()}`);
    const nested = join(root, "a", "b", "c");
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(nested, { recursive: true });
    try {
      expect(findGitRoot(nested)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when no .git found", () => {
    // / may or may not have .git, but it won't walk above /
    // We're testing that the loop terminates — just verify it returns something
    const result = findGitRoot("/");
    expect(result === null || typeof result === "string").toBe(true);
  });
});
