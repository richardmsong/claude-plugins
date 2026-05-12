/**
 * overlay-model.ts — pure-function module for ADR-0084 git-state overlay.
 *
 * No React imports. Safe to import in Bun unit tests without a DOM.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffLine {
  kind: "added" | "removed" | "context";
  /** For "added" and "context": right-hand-side (new-file) line number.
   *  For "removed": left-hand-side (old-file) line number. */
  lineNo: number;
  content: string;
}

export interface OverlayLine {
  kind: "kept" | "added" | "removed";
  content: string;
  /** New-file line number for kept/added; null for synthesized removed rows. */
  baseLineNo: number | null;
}

export interface BlameBlock {
  line_start: number;
  line_end: number;
  commit: string;
  author: string;
  date: string;
  summary: string;
  adrs: { doc_path: string; title?: string | null; status?: string | null }[];
}

export interface UncommittedRange {
  line_start: number;
  line_end: number;
  kind: "added" | "modified";
}

export interface GutterRow {
  lineNo: number;
  kind: "commit" | "wip";
  /** Present when kind === "commit". */
  commit?: string;
}

// ---------------------------------------------------------------------------
// parseUnifiedDiff
// ---------------------------------------------------------------------------

/**
 * Parse unified diff text into per-line records.
 *
 * Rules per ADR-0084 invariant:
 *   - `+` lines → kind: "added", lineNo = RHS (new-file) line number
 *   - `-` lines → kind: "removed", lineNo = LHS (old-file) line number
 *   - ` ` lines → kind: "context", lineNo = RHS line number
 *   - `\` (no-newline marker) and other non-hunk lines → skipped
 */
export function parseUnifiedDiff(diffText: string): DiffLine[] {
  if (!diffText) return [];

  const result: DiffLine[] = [];
  const lines = diffText.split("\n");

  let oldLine = 0; // current old-file line counter
  let newLine = 0; // current new-file line counter
  let inHunk = false;

  for (const raw of lines) {
    // Hunk header: @@ -l1[,c1] +l2[,c2] @@
    const hunkMatch = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    // Skip diff header lines and binary/no-newline markers
    if (
      raw.startsWith("diff ") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ") ||
      raw.startsWith("\\ ")
    ) {
      inHunk = false;
      continue;
    }

    if (raw.startsWith("+")) {
      result.push({ kind: "added", lineNo: newLine, content: raw.slice(1) });
      newLine++;
    } else if (raw.startsWith("-")) {
      result.push({ kind: "removed", lineNo: oldLine, content: raw.slice(1) });
      oldLine++;
    } else if (raw.startsWith(" ")) {
      result.push({ kind: "context", lineNo: newLine, content: raw.slice(1) });
      oldLine++;
      newLine++;
    }
    // Empty lines (end of input) or anything else: skip
  }

  return result;
}

// ---------------------------------------------------------------------------
// computeOverlay
// ---------------------------------------------------------------------------

/**
 * Merge a parsed diff with the base document lines into a renderable sequence.
 *
 * Per ADR-0084 invariant:
 *   - added → {kind: "added", content, baseLineNo: <new-file lineNo>}
 *   - context → {kind: "kept", content, baseLineNo: <new-file lineNo>}
 *   - removed → {kind: "removed", content, baseLineNo: null}
 *     inserted immediately BEFORE its corresponding added/next-kept neighbor
 *     (i.e., after the preceding kept-or-added neighbor in old-file ordering).
 *
 * The diff lines drive the output; baseLines is available for context but the
 * primary ordering comes from the diff's hunk sequence.
 */
export function computeOverlay(diff: DiffLine[], _baseLines: string[]): OverlayLine[] {
  if (diff.length === 0) return [];

  const result: OverlayLine[] = [];

  // Walk the diff lines in order.
  // "removed" lines are emitted before the next "added" or "context" line
  // that follows them in old-file ordering — which is exactly their natural
  // order in the diff text since unified diff interleaves them.
  for (const d of diff) {
    if (d.kind === "removed") {
      // Buffer removed lines; they will be emitted right before the next
      // non-removed line (this implements "immediately following the preceding
      // kept-or-added neighbor" — i.e. they slot in between).
      result.push({ kind: "removed", content: d.content, baseLineNo: null });
    } else if (d.kind === "added") {
      result.push({ kind: "added", content: d.content, baseLineNo: d.lineNo });
    } else {
      // context
      result.push({ kind: "kept", content: d.content, baseLineNo: d.lineNo });
    }
  }

  // The above naive ordering would produce: removed, added, …
  // But the invariant says removed appears BEFORE added (immediately preceding).
  // In unified diff format, the `-` line always appears before the `+` line for
  // a modification, so the natural walk already gives us the right order.
  // Verify: for a `-` then `+` pair, removed is at i and added is at i+1. ✓

  return result;
}

// ---------------------------------------------------------------------------
// computeGutterModel
// ---------------------------------------------------------------------------

/**
 * Build per-line gutter annotations with WIP markers taking precedence.
 *
 * Per ADR-0084 invariant:
 *   - Lines covered by an uncommitted range → kind: "wip" (always wins)
 *   - Lines covered ONLY by a blame block → kind: "commit"
 */
export function computeGutterModel(
  blocks: BlameBlock[],
  uncommitted: UncommittedRange[],
): GutterRow[] {
  // Build a set of all WIP line numbers
  const wipLines = new Set<number>();
  for (const r of uncommitted) {
    for (let l = r.line_start; l <= r.line_end; l++) {
      wipLines.add(l);
    }
  }

  const rows: GutterRow[] = [];

  // Emit commit rows for blame blocks
  for (const block of blocks) {
    for (let l = block.line_start; l <= block.line_end; l++) {
      if (wipLines.has(l)) {
        rows.push({ lineNo: l, kind: "wip" });
      } else {
        rows.push({ lineNo: l, kind: "commit", commit: block.commit });
      }
    }
  }

  // Emit wip rows for uncommitted lines NOT already covered by a blame block
  const blameLines = new Set<number>();
  for (const block of blocks) {
    for (let l = block.line_start; l <= block.line_end; l++) {
      blameLines.add(l);
    }
  }

  for (const r of uncommitted) {
    for (let l = r.line_start; l <= r.line_end; l++) {
      if (!blameLines.has(l)) {
        rows.push({ lineNo: l, kind: "wip" });
      }
    }
  }

  // Sort by lineNo for deterministic output
  rows.sort((a, b) => a.lineNo - b.lineNo);

  return rows;
}
