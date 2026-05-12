import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import BlameGutter from "../components/BlameGutter";
import type { BlameBlock } from "../api";
import type { UncommittedRange } from "../lib/overlay-model";

const makeBlock = (
  commit: string,
  author: string,
  lineStart: number,
  lineEnd: number,
): BlameBlock => ({
  commit,
  author,
  date: "2026-04-01",
  summary: "feat: initial commit",
  line_start: lineStart,
  line_end: lineEnd,
  adrs: [],
});

const onAnnotationHover = vi.fn();
const onAnnotationLeave = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BlameGutter", () => {
  it("renders nothing when blocks array is empty", () => {
    const { container } = render(
      <BlameGutter
        blocks={[]}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one annotation per commit group", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234", "Alice", 1, 5),
      makeBlock("abc1234", "Alice", 6, 10),
      makeBlock("def5678", "Bob", 11, 15),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
      />
    );
    // Two commits, so two annotations
    const annotations = container.querySelectorAll("[title]");
    expect(annotations.length).toBe(2);
  });

  it("shows abbreviated commit hash (7 chars)", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234ffffffff", "Alice", 1, 5),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
      />
    );
    expect(container.textContent).toContain("abc1234");
    // Should NOT show the full hash
    expect(container.textContent).not.toContain("abc1234fff");
  });

  it("shows author first name in annotation", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234", "Alice Smith", 1, 5),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
      />
    );
    expect(container.textContent).toContain("Alice");
  });

  it("calls onAnnotationHover with blockIndex on mouse enter", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234", "Alice", 1, 5),
      makeBlock("def5678", "Bob", 6, 10),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
      />
    );
    const annotations = container.querySelectorAll("[title]");
    fireEvent.mouseEnter(annotations[1]);
    expect(onAnnotationHover).toHaveBeenCalled();
    // Second group starts at block index 1
    const callArgs = onAnnotationHover.mock.calls[0];
    expect(callArgs[0]).toBe(1);
  });

  it("calls onAnnotationLeave on mouse leave", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234", "Alice", 1, 5),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
      />
    );
    const annotations = container.querySelectorAll("[title]");
    fireEvent.mouseLeave(annotations[0]);
    expect(onAnnotationLeave).toHaveBeenCalled();
  });

  it("applies highlighted style when hoveredBlockIndex matches the group", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234", "Alice", 1, 5),
      makeBlock("def5678", "Bob", 6, 10),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={1}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
      />
    );
    const annotations = container.querySelectorAll("[title]");
    // The second annotation (Bob, index 1) should have highlight style
    const secondAnnotation = annotations[1] as HTMLElement;
    expect(secondAnnotation.style.background).toContain("rgba(99");
  });

  it("groups consecutive blocks with same commit into one annotation", () => {
    const blocks: BlameBlock[] = [
      makeBlock("same0000", "Carol", 1, 3),
      makeBlock("same0000", "Carol", 4, 6),
      makeBlock("same0000", "Carol", 7, 9),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
      />
    );
    // All 3 have the same commit → 1 annotation
    const annotations = container.querySelectorAll("[title]");
    expect(annotations.length).toBe(1);
  });
});

// ADR-0085: BlameGutter renders WIP markers from uncommitted_lines ranges.
//
// When BlameGutter receives an uncommitted_lines range covering line N, the
// rendered gutter row for line N must carry a wip-themed CSS class regardless
// of whether a blocks entry also covers line N.
//
// Expected to FAIL on first run because BlameGutter doesn't yet differentiate
// WIP rows or accept an uncommittedLines prop.
describe("BlameGutter — ADR-0085 renders WIP marker", () => {
  it("renders WIP marker", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abcdef0", "Test", 1, 5),
    ];
    const uncommittedLines: UncommittedRange[] = [
      { line_start: 3, line_end: 3, kind: "modified" },
    ];

    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
        // Cast to any until BlameGutter accepts the new prop.
        {...({ uncommittedLines } as Record<string, unknown>)}
      />
    );

    // Line 3 must have the gutter-wip class (WIP takes precedence over commit).
    const wipRow = container.querySelector(".gutter-wip");
    expect(wipRow).not.toBeNull();

    // Lines 1, 2, 4, 5 must have the gutter-commit class.
    const commitRows = container.querySelectorAll(".gutter-commit");
    expect(commitRows.length).toBe(4);
  });
});

// ADR-0085: BlameGutter fires onCommitClick with the clicked block's commit hash.
//
// The callback is the component's surface for entering/exiting/replacing
// commit-overlay mode; the consuming component is responsible for toggling.
//
// Expected to FAIL on first run because BlameGutter doesn't yet handle commit
// clicks or expose an onCommitClick prop.
describe("BlameGutter — ADR-0085 commit click dispatches overlay state", () => {
  const onCommitClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("click a commit row calls onCommitClick with that commit hash", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234", "Alice", 1, 5),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
        {...({ onCommitClick } as Record<string, unknown>)}
      />
    );

    const commitRow = container.querySelector(".gutter-commit");
    expect(commitRow).not.toBeNull();
    fireEvent.click(commitRow!);
    expect(onCommitClick).toHaveBeenCalledTimes(1);
    expect(onCommitClick).toHaveBeenCalledWith("abc1234");
  });

  it("click the same row twice calls onCommitClick twice with the same hash", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234", "Alice", 1, 5),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
        {...({ onCommitClick } as Record<string, unknown>)}
      />
    );

    const commitRow = container.querySelector(".gutter-commit");
    expect(commitRow).not.toBeNull();
    fireEvent.click(commitRow!);
    fireEvent.click(commitRow!);
    expect(onCommitClick).toHaveBeenCalledTimes(2);
    expect(onCommitClick).toHaveBeenNthCalledWith(1, "abc1234");
    expect(onCommitClick).toHaveBeenNthCalledWith(2, "abc1234");
  });

  it("click a different row calls onCommitClick with the new hash", () => {
    const blocks: BlameBlock[] = [
      makeBlock("abc1234", "Alice", 1, 3),
      makeBlock("def5678", "Bob", 4, 6),
    ];
    const { container } = render(
      <BlameGutter
        blocks={blocks}
        hoveredBlockIndex={null}
        onAnnotationHover={onAnnotationHover}
        onAnnotationLeave={onAnnotationLeave}
        {...({ onCommitClick } as Record<string, unknown>)}
      />
    );

    const commitRows = container.querySelectorAll(".gutter-commit");
    expect(commitRows.length).toBe(2);

    // Click first row → abc1234
    fireEvent.click(commitRows[0]);
    expect(onCommitClick).toHaveBeenCalledWith("abc1234");

    // Click second row → def5678
    fireEvent.click(commitRows[1]);
    expect(onCommitClick).toHaveBeenCalledWith("def5678");

    expect(onCommitClick).toHaveBeenCalledTimes(2);
  });
});
