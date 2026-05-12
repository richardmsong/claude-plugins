// Verifier for three ADR-0084 invariants:
//
//   methodology.dashboard.overlay_parser_classifies_lines
//   methodology.dashboard.overlay_merger_synthesizes_removals
//   methodology.dashboard.gutter_wip_precedence
//
// All three are tested against pure functions in ui/src/lib/overlay-model.ts,
// which does NOT exist yet.  The import below is pre-declared with
// @ts-expect-error so this file compiles while the module is absent; the tests
// themselves will fail (module-not-found at runtime) until dev-harness creates
// the module per ADR-0084.

// @ts-expect-error — test pre-declares the post-implementation module; will be removed once ui/src/lib/overlay-model.ts exists per ADR-0084
import type {
  DiffLine,
  OverlayLine,
  BlameBlock,
  UncommittedRange,
  GutterRow,
} from "../ui/src/lib/overlay-model";

// @ts-expect-error — test pre-declares the post-implementation module; will be removed once ui/src/lib/overlay-model.ts exists per ADR-0084
import {
  parseUnifiedDiff,
  computeOverlay,
  computeGutterModel,
} from "../ui/src/lib/overlay-model";

import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A minimal unified diff string covering all three line kinds:
 *   - context line  (` ` prefix)
 *   - added line    (`+` prefix)
 *   - removed line  (`-` prefix)
 *
 * The hunk header says the new file starts at line 3 with 4 lines,
 * so the right-hand-side (new file) line numbers start at 3.
 *
 *   @@ -3,3 +3,4 @@
 *    context line at 3        → lineNo 3, kind: "context"
 *   -removed line at 4        → lineNo interpolated (old file line 4)
 *   +added line at 4          → lineNo 4, kind: "added"
 *    context line at 5        → lineNo 5, kind: "context"
 */
const SAMPLE_UNIFIED_DIFF = `diff --git a/docs/test.md b/docs/test.md
index aaaaaaa..bbbbbbb 100644
--- a/docs/test.md
+++ b/docs/test.md
@@ -3,3 +3,4 @@
 context line at 3
-removed line at old-4
+added line at new-4
 context line at 5
`;

/**
 * A simple 5-line base document (1-indexed).
 */
const BASE_LINES = [
  "line 1 — preamble",
  "line 2 — preamble",
  "context line at 3",
  "removed line at old-4",
  "context line at 5",
];

// ---------------------------------------------------------------------------
// methodology.dashboard.overlay_parser_classifies_lines
// ---------------------------------------------------------------------------

describe("parseUnifiedDiff — overlay_parser_classifies_lines", () => {
  it("classifies every + line as kind: added", () => {
    const records: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const added = records.filter((r: DiffLine) => r.kind === "added");
    expect(added.length).toBeGreaterThan(0);
    for (const r of added) {
      expect(r.content).toBeTruthy();
    }
  });

  it("classifies every - line as kind: removed", () => {
    const records: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const removed = records.filter((r: DiffLine) => r.kind === "removed");
    expect(removed.length).toBeGreaterThan(0);
    for (const r of removed) {
      expect(r.content).toBeTruthy();
    }
  });

  it("classifies every context line (space prefix) as kind: context", () => {
    const records: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const context = records.filter((r: DiffLine) => r.kind === "context");
    expect(context.length).toBeGreaterThan(0);
    for (const r of context) {
      expect(r.content).toBeTruthy();
    }
  });

  it("lineNo on added records matches the right-hand-side line number from the @@ header", () => {
    // The hunk header is @@ -3,3 +3,4 @@.
    // Line sequence in the hunk:
    //   " context line at 3"   → new-file line 3 (context)
    //   "-removed line at old-4" → old-file line 4 (removed; does not advance new-file counter)
    //   "+added line at new-4"   → new-file line 4 (added)
    //   " context line at 5"   → new-file line 5 (context)
    // Therefore the single added record must have lineNo === 4 exactly.
    const records: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const added = records.filter((r: DiffLine) => r.kind === "added");
    expect(added.length).toBe(1);
    expect(added[0].lineNo).toBe(4);
  });

  it("lineNo on removed records matches the left-hand-side line number from the @@ header", () => {
    // The hunk header is @@ -3,3 +3,4 @@.
    // The removed line ("-removed line at old-4") is old-file line 4 (the second line in
    // the hunk after the context line at old-file line 3).
    // Therefore the single removed record must have lineNo === 4 exactly (old-file line 4).
    const records: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const removed = records.filter((r: DiffLine) => r.kind === "removed");
    expect(removed.length).toBe(1);
    expect(removed[0].lineNo).toBe(4);
  });

  it("lineNo on context records matches the right-hand-side line number from the @@ header", () => {
    const records: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const context = records.filter((r: DiffLine) => r.kind === "context");
    // Context lines at new-file positions 3 and 5
    const lineNos = context.map((r: DiffLine) => r.lineNo);
    expect(lineNos).toContain(3);
    expect(lineNos).toContain(5);
  });

  it("returns an empty array for empty diff input", () => {
    const records: DiffLine[] = parseUnifiedDiff("");
    expect(Array.isArray(records)).toBe(true);
    expect(records).toHaveLength(0);
  });

  it("skips binary/no-newline marker lines (treats them as context)", () => {
    const diffWithNoNewline = SAMPLE_UNIFIED_DIFF + "\\ No newline at end of file\n";
    // Must not throw, and must not produce a record with kind "added"|"removed"
    // for the marker line.
    const records: DiffLine[] = parseUnifiedDiff(diffWithNoNewline);
    expect(Array.isArray(records)).toBe(true);
    // The marker line itself should not inflate the added/removed count
    const addedOrRemoved = records.filter(
      (r: DiffLine) => r.kind === "added" || r.kind === "removed",
    );
    // We started with exactly 1 added and 1 removed; must still be exactly those
    const addedCount = records.filter((r: DiffLine) => r.kind === "added").length;
    const removedCount = records.filter((r: DiffLine) => r.kind === "removed").length;
    expect(addedCount).toBe(1);
    expect(removedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// methodology.dashboard.overlay_merger_synthesizes_removals
// ---------------------------------------------------------------------------

describe("computeOverlay — overlay_merger_synthesizes_removals", () => {
  it("returns an OverlayLine array", () => {
    const diff: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const overlay: OverlayLine[] = computeOverlay(diff, BASE_LINES);
    expect(Array.isArray(overlay)).toBe(true);
    expect(overlay.length).toBeGreaterThan(0);
  });

  it("added lines produce OverlayLine with kind: added", () => {
    const diff: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const overlay: OverlayLine[] = computeOverlay(diff, BASE_LINES);
    const added = overlay.filter((l: OverlayLine) => l.kind === "added");
    expect(added.length).toBeGreaterThan(0);
    for (const l of added) {
      expect(l.content).toContain("added");
    }
  });

  it("context lines produce OverlayLine with kind: kept", () => {
    const diff: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const overlay: OverlayLine[] = computeOverlay(diff, BASE_LINES);
    const kept = overlay.filter((l: OverlayLine) => l.kind === "kept");
    expect(kept.length).toBeGreaterThan(0);
  });

  it("removed lines are synthesized in the sequence at their pre-change position with kind: removed", () => {
    const diff: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const overlay: OverlayLine[] = computeOverlay(diff, BASE_LINES);
    const removed = overlay.filter((l: OverlayLine) => l.kind === "removed");
    expect(removed.length).toBeGreaterThan(0);
    // The removed line must contain the original removed content
    const removedContents = removed.map((l: OverlayLine) => l.content);
    const hasRemovedLine = removedContents.some((c: string) => c.includes("removed line at old-4"));
    expect(hasRemovedLine).toBe(true);
  });

  it("removed lines appear between the surrounding kept/added neighbors in the sequence", () => {
    // Sequence should be:
    //   kept (line 3: context)
    //   removed (synthesized at old line-4 position)
    //   added (new-file line 4)
    //   kept (line 5: context)
    const diff: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const overlay: OverlayLine[] = computeOverlay(diff, BASE_LINES);

    // Find the index of the removed and added rows in the output sequence
    const removedIdx = overlay.findIndex((l: OverlayLine) => l.kind === "removed");
    const addedIdx = overlay.findIndex((l: OverlayLine) => l.kind === "added");

    expect(removedIdx).toBeGreaterThanOrEqual(0);
    expect(addedIdx).toBeGreaterThanOrEqual(0);

    // Strict adjacency: removed must appear EXACTLY one position before added.
    // The removed line is inserted immediately following the preceding kept/added
    // neighbor in the diff's old-file ordering — so removed and added must be
    // consecutive entries (no gap between them).
    expect(removedIdx).toBe(addedIdx - 1);
  });

  it("multi-hunk: each removed entry appears EXACTLY between its preceding kept/added neighbor and its succeeding added neighbor", () => {
    // Two-hunk fixture with two independent removal sites at known positions.
    //
    // Old file (6 lines):
    //   line 1 — preamble
    //   line 2 — to be removed (hunk A)
    //   line 3 — kept context
    //   line 4 — kept context
    //   line 5 — to be removed (hunk B)
    //   line 6 — kept context
    //
    // New file (6 lines, same count because each hunk removes 1 and adds 1):
    //   line 1 — preamble
    //   line 2 — replacement for old-2 (hunk A added)
    //   line 3 — kept context
    //   line 4 — kept context
    //   line 5 — replacement for old-5 (hunk B added)
    //   line 6 — kept context
    //
    // Hunk A: @@ -1,4 +1,4 @@
    //   " line 1 — preamble"
    //   "-line 2 — to be removed (hunk A)"
    //   "+line 2 — replacement for old-2 (hunk A added)"
    //   " line 3 — kept context"
    //
    // Hunk B: @@ -4,3 +4,3 @@
    //   " line 4 — kept context"
    //   "-line 5 — to be removed (hunk B)"
    //   "+line 5 — replacement for old-5 (hunk B added)"
    //   " line 6 — kept context"
    const TWO_HUNK_DIFF = `diff --git a/docs/two-hunk.md b/docs/two-hunk.md
index aaaaaaa..bbbbbbb 100644
--- a/docs/two-hunk.md
+++ b/docs/two-hunk.md
@@ -1,4 +1,4 @@
 line 1 — preamble
-line 2 — to be removed (hunk A)
+line 2 — replacement for old-2 (hunk A added)
 line 3 — kept context
 line 4 — kept context
@@ -4,3 +4,3 @@
 line 4 — kept context
-line 5 — to be removed (hunk B)
+line 5 — replacement for old-5 (hunk B added)
 line 6 — kept context
`;

    const TWO_HUNK_BASE = [
      "line 1 — preamble",
      "line 2 — to be removed (hunk A)",
      "line 3 — kept context",
      "line 4 — kept context",
      "line 5 — to be removed (hunk B)",
      "line 6 — kept context",
    ];

    const diff: DiffLine[] = parseUnifiedDiff(TWO_HUNK_DIFF);
    const overlay: OverlayLine[] = computeOverlay(diff, TWO_HUNK_BASE);

    // Locate the two removed entries and the two added entries by content.
    const removedAIdx = overlay.findIndex(
      (l: OverlayLine) => l.kind === "removed" && l.content.includes("hunk A"),
    );
    const addedAIdx = overlay.findIndex(
      (l: OverlayLine) => l.kind === "added" && l.content.includes("hunk A added"),
    );
    const removedBIdx = overlay.findIndex(
      (l: OverlayLine) => l.kind === "removed" && l.content.includes("hunk B"),
    );
    const addedBIdx = overlay.findIndex(
      (l: OverlayLine) => l.kind === "added" && l.content.includes("hunk B added"),
    );

    expect(removedAIdx).toBeGreaterThanOrEqual(0);
    expect(addedAIdx).toBeGreaterThanOrEqual(0);
    expect(removedBIdx).toBeGreaterThanOrEqual(0);
    expect(addedBIdx).toBeGreaterThanOrEqual(0);

    // Hunk A: removedA must be EXACTLY one position before addedA (strict adjacency).
    expect(removedAIdx).toBe(addedAIdx - 1);

    // Hunk B: removedB must be EXACTLY one position before addedB (strict adjacency).
    expect(removedBIdx).toBe(addedBIdx - 1);

    // Cross-hunk ordering: hunk A pair must appear entirely before hunk B pair.
    expect(addedAIdx).toBeLessThan(removedBIdx);
  });

  it("baseLineNo is null for synthesized removed lines", () => {
    const diff: DiffLine[] = parseUnifiedDiff(SAMPLE_UNIFIED_DIFF);
    const overlay: OverlayLine[] = computeOverlay(diff, BASE_LINES);
    const removed = overlay.filter((l: OverlayLine) => l.kind === "removed");
    for (const l of removed) {
      expect(l.baseLineNo).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// methodology.dashboard.gutter_wip_precedence
// ---------------------------------------------------------------------------

// Small BlameBlock fixture: lines 1–3 are attributed to commit abc123
const BLAME_BLOCKS: BlameBlock[] = [
  {
    line_start: 1,
    line_end: 3,
    commit: "abc1234567890123456789012345678901234abcd",
    author: "Alice",
    date: "2026-01-01",
    summary: "feat: initial",
    adrs: [],
  },
  {
    line_start: 4,
    line_end: 6,
    commit: "def1234567890123456789012345678901234def0",
    author: "Bob",
    date: "2026-02-01",
    summary: "feat: follow-up",
    adrs: [],
  },
];

// Uncommitted range that OVERLAPS line 3 (also covered by the blame block above)
// and adds line 7 (no blame block covers line 7).
const UNCOMMITTED_RANGES: UncommittedRange[] = [
  { line_start: 3, line_end: 3, kind: "modified" },
  { line_start: 7, line_end: 7, kind: "added" },
];

describe("computeGutterModel — gutter_wip_precedence", () => {
  it("returns a GutterRow array", () => {
    const rows: GutterRow[] = computeGutterModel(BLAME_BLOCKS, UNCOMMITTED_RANGES);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("lines covered only by a blame block produce kind: commit rows", () => {
    const rows: GutterRow[] = computeGutterModel(BLAME_BLOCKS, UNCOMMITTED_RANGES);
    // Lines 1–2 are covered by the first blame block and NOT by any uncommitted range.
    const line1 = rows.find((r: GutterRow) => r.lineNo === 1);
    const line2 = rows.find((r: GutterRow) => r.lineNo === 2);
    if (line1) {
      expect(line1.kind).toBe("commit");
      expect(line1.commit).toBe("abc1234567890123456789012345678901234abcd");
    }
    if (line2) {
      expect(line2.kind).toBe("commit");
    }
  });

  it("a line covered by BOTH a blame block AND an uncommitted range produces kind: wip (wip wins)", () => {
    // Line 3 is in blame block [1–3] AND in uncommitted range [3–3].
    // WIP must take precedence.
    const rows: GutterRow[] = computeGutterModel(BLAME_BLOCKS, UNCOMMITTED_RANGES);
    const line3 = rows.find((r: GutterRow) => r.lineNo === 3);
    expect(line3).toBeDefined();
    expect(line3!.kind).toBe("wip");
  });

  it("a line covered only by an uncommitted range produces kind: wip", () => {
    // Line 7 is not covered by any blame block, only by uncommitted [7–7].
    const rows: GutterRow[] = computeGutterModel(BLAME_BLOCKS, UNCOMMITTED_RANGES);
    const line7 = rows.find((r: GutterRow) => r.lineNo === 7);
    // If the model produces a row for line 7 at all, it must be wip.
    if (line7) {
      expect(line7.kind).toBe("wip");
    }
  });

  it("no row ever has kind: commit when the line falls in an uncommitted range", () => {
    const rows: GutterRow[] = computeGutterModel(BLAME_BLOCKS, UNCOMMITTED_RANGES);
    // Build the set of all line numbers covered by any uncommitted range.
    const wippedLines = new Set<number>();
    for (const r of UNCOMMITTED_RANGES) {
      for (let l = r.line_start; l <= r.line_end; l++) {
        wippedLines.add(l);
      }
    }
    for (const row of rows) {
      if (wippedLines.has(row.lineNo)) {
        expect(row.kind).toBe("wip");
      }
    }
  });

  it("commit rows carry the commit hash from the corresponding blame block", () => {
    const rows: GutterRow[] = computeGutterModel(BLAME_BLOCKS, UNCOMMITTED_RANGES);
    // Line 4 is in the second blame block (def1234...) and not in any uncommitted range.
    const line4 = rows.find((r: GutterRow) => r.lineNo === 4);
    if (line4) {
      expect(line4.kind).toBe("commit");
      expect(line4.commit).toBe("def1234567890123456789012345678901234def0");
    }
  });

  it("handles empty uncommitted array — all blame lines produce commit rows", () => {
    const rows: GutterRow[] = computeGutterModel(BLAME_BLOCKS, []);
    for (const row of rows) {
      expect(row.kind).toBe("commit");
    }
  });

  it("handles empty blame blocks array — all uncommitted lines produce wip rows", () => {
    const rows: GutterRow[] = computeGutterModel([], UNCOMMITTED_RANGES);
    for (const row of rows) {
      expect(row.kind).toBe("wip");
    }
  });
});
