import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import BlameGutter from "../components/BlameGutter";
import type { BlameBlock } from "../api";

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
