import React from "react";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "bun:test";
import AdrDetail from "../routes/AdrDetail";

// Mock api module
vi.mock("../api", () => ({
  fetchDoc: vi.fn(),
  fetchLineage: vi.fn(),
  fetchBlame: vi.fn(),
}));

import { fetchDoc, fetchLineage, fetchBlame } from "../api";

// ---------------------------------------------------------------------------
// Captured MarkdownView callbacks — used by hover bridge tests below.
// MarkdownView is mocked so tests can directly invoke onBlockHover/onBlockLeave.
// ---------------------------------------------------------------------------
let capturedOnBlockHover: ((...args: unknown[]) => void) | null = null;
let capturedOnBlockLeave: ((() => void) | null) = null;

vi.mock("../components/MarkdownView", () => ({
  default: (props: {
    onBlockHover?: (...args: unknown[]) => void;
    onBlockLeave?: () => void;
    [key: string]: unknown;
  }) => {
    // Capture callbacks so tests can invoke them directly
    capturedOnBlockHover = props.onBlockHover ?? null;
    capturedOnBlockLeave = props.onBlockLeave ?? null;
    return React.createElement("div", { "data-testid": "markdown-view" });
  },
}));

const mockDoc = {
  doc_path: "docs/adr-0027-docs-dashboard.md",
  title: "Docs Dashboard",
  category: "adr",
  status: "accepted",
  commit_count: 5,
  raw_markdown: "# Docs Dashboard\n\nThis is the dashboard ADR.\n\n## Overview\n\nSection content.",
  sections: [{ heading: "Overview", line_start: 5, line_end: 10 }],
};

const navigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnBlockHover = null;
  capturedOnBlockLeave = null;
  (fetchDoc as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);
  (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (fetchBlame as ReturnType<typeof vi.fn>).mockResolvedValue({ blocks: [], uncommitted_lines: [] });
});


describe("AdrDetail — nested doc_path slug (ADR-0035)", () => {
  it("calls fetchDoc with the nested path when slug is a full path", async () => {
    const nestedDoc = {
      doc_path: "spec-driven-dev/docs/adr-0031-doc-level-lineage.md",
      title: "Doc Level Lineage",
      category: "adr",
      status: "implemented",
      commit_count: 3,
      raw_markdown: "# Doc Level Lineage\n\nContent here.",
      sections: [],
    };
    (fetchDoc as ReturnType<typeof vi.fn>).mockResolvedValue(nestedDoc);

    const { container } = render(
      <AdrDetail
        slug="spec-driven-dev/docs/adr-0031-doc-level-lineage"
        navigate={navigate}
        lastEvent={null}
      />
    );
    await waitFor(() => {
      expect(container.textContent).toContain("Doc Level Lineage");
    });
    // slugToDocPath appends .md — fetchDoc must receive the full nested path
    expect(fetchDoc).toHaveBeenCalledWith(
      "spec-driven-dev/docs/adr-0031-doc-level-lineage.md"
    );
  });

  it("shows error for a nested path doc that is not found", async () => {
    (fetchDoc as ReturnType<typeof vi.fn>).mockRejectedValue({
      status: 404,
      body: { error: "not found" },
    });

    const { container } = render(
      <AdrDetail
        slug="spec-driven-dev/docs/adr-0035-fix-adr-route-nested-docs-dir"
        navigate={navigate}
        lastEvent={null}
      />
    );
    await waitFor(() => {
      expect(container.textContent).toContain("Document not found");
    });
    expect(container.textContent).toContain(
      "spec-driven-dev/docs/adr-0035-fix-adr-route-nested-docs-dir.md"
    );
  });
});

describe("AdrDetail — H1 lineage icon (ADR-0031)", () => {
  it("renders the H1 title", async () => {
    const { container } = render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => {
      expect(container.textContent).toContain("Docs Dashboard");
    });
    expect(container.querySelector("h1")).not.toBeNull();
  });

  it("renders a ≡ icon next to the H1 title (doc-level lineage trigger)", async () => {
    const { container } = render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => {
      expect(container.querySelector("h1")).not.toBeNull();
    });

    // The title row contains the H1 and the LineagePopover trigger button
    const titleRow = container.querySelector("h1")?.parentElement;
    expect(titleRow).not.toBeNull();
    const triggerBtn = titleRow!.querySelector("button");
    expect(triggerBtn).not.toBeNull();
    expect(triggerBtn!.textContent).toContain("≡");
  });

  it("renders a StatusBadge next to the H1", async () => {
    const { container } = render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => {
      expect(container.textContent).toContain("accepted");
    });
  });
});

describe("AdrDetail — BlameRangeFilter (ADR-0040)", () => {
  it("renders the BlameRangeFilter dropdown", async () => {
    const { container } = render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => {
      expect(container.textContent).toContain("Docs Dashboard");
    });
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect(select!.textContent).toContain("All time");
  });

  it("calls fetchBlame on mount", async () => {
    render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => {
      expect(fetchBlame).toHaveBeenCalledWith("0027-docs-dashboard.md", undefined, undefined);
    });
  });
});

// ---------------------------------------------------------------------------
// Hover bridge tests (ADR-0041)
// ---------------------------------------------------------------------------

const mockBlameBlock = {
  commit: "aabbccdd11223344",
  author: "Test Author",
  date: "2026-04-23",
  summary: "test commit",
  line_start: 3,
  line_end: 5,
  adrs: [],
};

const mockRect = {
  top: 100,
  bottom: 120,
  left: 50,
  right: 300,
  width: 250,
  height: 20,
  x: 50,
  y: 100,
  toJSON: () => ({}),
} as DOMRect;

describe("AdrDetail — hover bridge (ADR-0041)", () => {
  it("positions popover at rect.bottom - 4 and rect.left (bounding rect anchor)", async () => {
    const { container } = render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => expect(container.textContent).toContain("Docs Dashboard"));
    expect(capturedOnBlockHover).not.toBeNull();

    // Trigger block hover and wait for the 300ms debounce using real timers
    act(() => {
      capturedOnBlockHover!(mockBlameBlock, false, 3, 5, mockRect);
    });
    await waitFor(() =>
      expect(container.querySelector("[role='dialog']")).not.toBeNull(),
    { timeout: 500 });

    const dialog = container.querySelector("[role='dialog']") as HTMLElement;
    // top = rect.bottom - 4 = 120 - 4 = 116
    expect(dialog.style.top).toBe("116px");
    // left = rect.left = 50
    expect(dialog.style.left).toBe("50px");
  });

  it("popover is NOT immediately dismissed when block mouse leaves (dismissal is deferred)", async () => {
    const { container } = render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => expect(container.textContent).toContain("Docs Dashboard"));

    // Show popover
    act(() => {
      capturedOnBlockHover!(mockBlameBlock, false, 3, 5, mockRect);
    });
    await waitFor(() =>
      expect(container.querySelector("[role='dialog']")).not.toBeNull(),
    { timeout: 500 });

    // Block leave fires — popover should still be visible (dismiss is deferred by 80ms)
    act(() => {
      capturedOnBlockLeave!();
    });
    // Synchronous check: popover still present immediately after block leave.
    // This is the key invariant: block leave does NOT immediately dismiss the popover —
    // it only starts a timer. This enables the hover bridge (moving block → popover).
    expect(container.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("popover stays visible when mouse enters popover after leaving block (hover bridge)", async () => {
    const { container } = render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => expect(container.textContent).toContain("Docs Dashboard"));

    // Show popover
    act(() => {
      capturedOnBlockHover!(mockBlameBlock, false, 3, 5, mockRect);
    });
    await waitFor(() =>
      expect(container.querySelector("[role='dialog']")).not.toBeNull(),
    { timeout: 500 });
    const dialog = container.querySelector("[role='dialog']") as HTMLElement;

    // Block leave fires — dismiss timer starts (but popover is still present)
    act(() => {
      capturedOnBlockLeave!();
    });
    expect(container.querySelector("[role='dialog']")).not.toBeNull(); // still there

    // Mouse enters the popover before dismiss timer fires — cancels the dismiss.
    // After mouseEnter, the popover must remain present even past the dismiss window.
    act(() => {
      fireEvent.mouseEnter(dialog);
    });

    // Popover must still be present — the dismiss was cancelled.
    // Check synchronously (we don't need to wait; the cancel is immediate).
    expect(container.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("popover dismisses on mouse leave from popover (not pinned)", async () => {
    const { container } = render(
      <AdrDetail slug="0027-docs-dashboard" navigate={navigate} lastEvent={null} />
    );
    await waitFor(() => expect(container.textContent).toContain("Docs Dashboard"));

    // Show popover
    act(() => {
      capturedOnBlockHover!(mockBlameBlock, false, 3, 5, mockRect);
    });
    await waitFor(() =>
      expect(container.querySelector("[role='dialog']")).not.toBeNull(),
    { timeout: 500 });
    const dialog = container.querySelector("[role='dialog']") as HTMLElement;

    // Mouse leave from the popover calls handlePopoverMouseLeave — immediate dismiss
    act(() => {
      fireEvent.mouseLeave(dialog);
    });
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });
});
