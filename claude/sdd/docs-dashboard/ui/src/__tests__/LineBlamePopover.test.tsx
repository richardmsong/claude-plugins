import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import LineBlamePopover from "../components/LineBlamePopover";
import type { BlameBlock } from "../api";

// Mock api module for fetchDiff
vi.mock("../api", () => ({
  fetchDiff: vi.fn(),
}));

import { fetchDiff } from "../api";

const onPin = vi.fn();
const onDismiss = vi.fn();

const mockBlock: BlameBlock = {
  commit: "abc1234ffffffff",
  author: "Alice Smith",
  date: "2026-04-01",
  summary: "feat: add blame gutter",
  line_start: 10,
  line_end: 15,
  adrs: [
    {
      doc_path: "spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md",
      title: "Line-level lineage popover",
      status: "accepted",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  (fetchDiff as ReturnType<typeof vi.fn>).mockResolvedValue({ diff: "--- a\n+++ b\n@@ -10,6 +10,7 @@\n context" });
});

describe("LineBlamePopover", () => {
  it("renders blame line range in header", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.textContent).toContain("lines 10");
  });

  it("renders ADR entry with title including ADR number", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.textContent).toContain("ADR-0040");
    expect(container.textContent).toContain("Line-level lineage popover");
  });

  it("renders status badge for ADR entry", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.textContent).toContain("accepted");
  });

  it("renders commit author and date as secondary info", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.textContent).toContain("Alice Smith");
    expect(container.textContent).toContain("2026-04-01");
    expect(container.textContent).toContain("feat: add blame gutter");
  });

  it("shows abbreviated commit hash (7 chars)", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.textContent).toContain("abc1234");
    expect(container.textContent).not.toContain("abc1234fff");
  });

  it("shows working copy label for uncommitted lines", () => {
    const { container } = render(
      <LineBlamePopover
        block={null}
        isUncommitted={true}
        sectionHeading="Overview"
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.textContent).toContain("Working copy");
    expect(container.textContent).toContain("working copy");
  });

  it("includes section heading in uncommitted label", () => {
    const { container } = render(
      <LineBlamePopover
        block={null}
        isUncommitted={true}
        sectionHeading="Implementation"
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.textContent).toContain("Implementation");
  });

  it("renders pin button", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    const pinBtn = container.querySelector("button[title=\"Pin\"]");
    expect(pinBtn).not.toBeNull();
  });

  it("calls onPin when pin button is clicked", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    const pinBtn = container.querySelector("button[title=\"Pin\"]") as HTMLButtonElement;
    fireEvent.click(pinBtn);
    expect(onPin).toHaveBeenCalled();
  });

  it("shows Unpin button when pinned=true", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={true}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.querySelector("button[title=\"Unpin\"]")).not.toBeNull();
  });

  it("calls onDismiss on Escape key", () => {
    render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("renders expand button for diff toggle", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    const expandBtn = container.querySelector("button[title=\"Expand diff\"]");
    expect(expandBtn).not.toBeNull();
  });

  it("fetches diff and renders it on expand click", async () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    const expandBtn = container.querySelector("button[title=\"Expand diff\"]") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(expandBtn);
    });
    await waitFor(() => {
      expect(fetchDiff).toHaveBeenCalledWith(
        "spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md",
        "abc1234ffffffff",
        10,
        15,
      );
    });
    await waitFor(() => {
      expect(container.textContent).toContain("context");
    });
  });

  it("shows no ADRs message when block.adrs is empty", () => {
    const blockNoAdrs: BlameBlock = { ...mockBlock, adrs: [] };
    const { container } = render(
      <LineBlamePopover
        block={blockNoAdrs}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    expect(container.textContent).toContain("No co-committed ADRs");
  });

  it("uses anchorTop and anchorLeft for positioning (bounding rect anchor)", () => {
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={300}
        anchorLeft={150}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    const popover = container.firstElementChild as HTMLElement;
    expect(popover.style.top).toBe("300px");
    expect(popover.style.left).toBe("150px");
  });

  it("calls onMouseEnter when mouse enters the popover", () => {
    const onMouseEnter = vi.fn();
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
        onMouseEnter={onMouseEnter}
      />
    );
    const popover = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(popover);
    expect(onMouseEnter).toHaveBeenCalled();
  });

  it("calls onMouseLeave when mouse leaves the popover", () => {
    const onMouseLeave = vi.fn();
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
        onMouseLeave={onMouseLeave}
      />
    );
    const popover = container.firstElementChild as HTMLElement;
    fireEvent.mouseLeave(popover);
    expect(onMouseLeave).toHaveBeenCalled();
  });

  it("hover bridge props are optional (no crash when omitted)", () => {
    // Should not throw when onMouseEnter/onMouseLeave are not provided
    const { container } = render(
      <LineBlamePopover
        block={mockBlock}
        isUncommitted={false}
        anchorTop={100}
        anchorLeft={200}
        docPath="spec-driven-dev/docs/adr-0040-line-level-lineage-popover.md"
        pinned={false}
        onPin={onPin}
        onDismiss={onDismiss}
      />
    );
    const popover = container.firstElementChild as HTMLElement;
    // These should not throw even without handlers
    expect(() => fireEvent.mouseEnter(popover)).not.toThrow();
    expect(() => fireEvent.mouseLeave(popover)).not.toThrow();
  });
});
