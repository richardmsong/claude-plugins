import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import LineagePopover from "../components/LineagePopover";

vi.mock("../api", () => ({
  fetchLineage: vi.fn(),
}));

import { fetchLineage } from "../api";

// Two rows from the same doc (different headings) + one row from another doc.
// Section-mode collapse should produce 2 rows: summed counts.
const mockLineageTwoDocsMultiRows = [
  {
    doc_path: "docs/adr-0015-docs-mcp.md",
    doc_title: "Docs MCP",
    category: "adr",
    heading: "Data Model",
    status: "implemented",
    commit_count: 3,
    last_commit: "abc1234",
  },
  {
    doc_path: "docs/adr-0015-docs-mcp.md",
    doc_title: "Docs MCP",
    category: "adr",
    heading: "Scanning",
    status: "implemented",
    commit_count: 1,
    last_commit: "def5678",
  },
  {
    doc_path: "docs/spec-state-schema.md",
    doc_title: "State Schema",
    category: "spec",
    heading: "Session KV",
    status: null,
    commit_count: 2,
    last_commit: "fff9999",
  },
];

const mockLineageSingleRow = [
  {
    doc_path: "docs/spec-state-schema.md",
    doc_title: "State Schema",
    category: "spec",
    heading: "Session KV",
    status: null,
    commit_count: 3,
    last_commit: "abc1234",
  },
  {
    doc_path: "docs/adr-0015-docs-mcp.md",
    doc_title: "Docs MCP",
    category: "adr",
    heading: "Data Model",
    status: "implemented",
    commit_count: 1,
    last_commit: "def5678",
  },
];

const navigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue(mockLineageSingleRow);
});

describe("LineagePopover", () => {
  it("renders the trigger button", () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Overview"
        navigate={navigate}
      />
    );
    const trigger = container.querySelector("button");
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain("≡");
  });

  it("opens popover on hover and shows collapsed lineage rows after loading", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Overview"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });
    expect(container.textContent).toContain("3×");
    // ADR rows should show ADR-NNNN prefix
    expect(container.textContent).toContain("ADR-0015: Docs MCP");
    // Rows must NOT contain §heading segments
    expect(container.textContent).not.toContain("§");
  });

  it("closes popover on mouse leave when not pinned", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Overview"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });

    fireEvent.mouseLeave(trigger);
    expect(container.textContent).not.toContain("docs/spec-state-schema.md");
  });

  it("pins popover on click (stays open after mouse leave)", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Overview"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });

    // Mouse leave should NOT close when pinned
    fireEvent.mouseLeave(trigger);
    expect(container.textContent).toContain("docs/spec-state-schema.md");
  });

  it("dismisses on Escape key", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Overview"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.textContent).not.toContain("docs/spec-state-schema.md");
  });

  it("dismisses on outside click", async () => {
    const { container } = render(
      <div>
        <LineagePopover
          docPath="docs/adr-0027.md"
          heading="Overview"
          navigate={navigate}
        />
        <div id="outside">Outside</div>
      </div>
    );

    const trigger = container.querySelector("button")!;
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });

    const outside = container.querySelector("#outside")!;
    fireEvent.mouseDown(outside);
    expect(container.textContent).not.toContain("docs/spec-state-schema.md");
  });

  it("shows 'Open graph centered here' row", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Overview"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("Open graph centered here");
    });
  });

  it("clicking graph link in section mode navigates to /graph?focus=...&section=...", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Overview"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("Open graph centered here");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const graphBtn = buttons.find((b) => b.textContent?.includes("Open graph centered here"));
    expect(graphBtn).not.toBeUndefined();
    fireEvent.click(graphBtn!);
    expect(navigate).toHaveBeenCalledWith(
      "/graph?focus=docs%2Fadr-0027.md&section=Overview"
    );
  });

  it("row click in section mode navigates to doc top (no heading anchor)", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Overview"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const rowBtn = buttons.find((b) => b.textContent?.includes("docs/spec-state-schema.md"));
    expect(rowBtn).not.toBeUndefined();
    fireEvent.click(rowBtn!);
    // Must navigate to doc top — no hash fragment for a heading
    expect(navigate).toHaveBeenCalledWith("/spec/docs/spec-state-schema.md");
  });
});

describe("LineagePopover — section-mode collapse", () => {
  it("collapses multiple rows from the same doc into one row with summed count", async () => {
    (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockLineageTwoDocsMultiRows
    );

    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Decisions"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);

    // Should show exactly 2 result rows (not 3)
    // ADR rows use "ADR-NNNN: title" format
    await waitFor(() => {
      expect(container.textContent).toContain("ADR-0015: Docs MCP");
    });

    expect(container.textContent).toContain("docs/spec-state-schema.md");

    // adr-0015 collapsed: 3+1=4 commits
    expect(container.textContent).toContain("4×");
    // spec-state-schema: 2 commits
    expect(container.textContent).toContain("2×");

    // Must NOT show §heading segments
    expect(container.textContent).not.toContain("§");

    // Count result rows (buttons that aren't the trigger and aren't graph link)
    const buttons = Array.from(container.querySelectorAll("button"));
    const rowBtns = buttons.filter(
      (b) =>
        b.textContent?.includes("ADR-0015: Docs MCP") ||
        b.textContent?.includes("docs/spec-state-schema.md")
    );
    expect(rowBtns.length).toBe(2);
  });

  it("picks last_commit from the row with highest single commit_count (ties: first row)", async () => {
    // Two rows for same doc, different counts
    const rows = [
      {
        doc_path: "docs/adr-0001-telemetry.md",
        doc_title: "Telemetry",
        category: "adr",
        heading: "Overview",
        status: "accepted",
        commit_count: 5,
        last_commit: "high_hash",
      },
      {
        doc_path: "docs/adr-0001-telemetry.md",
        doc_title: "Telemetry",
        category: "adr",
        heading: "Details",
        status: "accepted",
        commit_count: 2,
        last_commit: "low_hash",
      },
    ];
    (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Motivation"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("7×");
    });
    // Collapsed row: 5+2=7 — ADR rows display as "ADR-NNNN: title"
    expect(container.textContent).toContain("ADR-0001: Telemetry");
  });

  it("sorts collapsed rows descending by count", async () => {
    (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockLineageTwoDocsMultiRows
    );

    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading="Decisions"
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("4×");
    });

    // adr-0015 (4) should appear before spec-state-schema (2)
    // ADR rows display as "ADR-0015: Docs MCP"
    const text = container.textContent ?? "";
    const idx4 = text.indexOf("ADR-0015: Docs MCP");
    const idx2 = text.indexOf("docs/spec-state-schema.md");
    expect(idx4).toBeLessThan(idx2);
  });
});

describe("LineagePopover — doc mode (heading=null)", () => {
  beforeEach(() => {
    (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockLineageSingleRow
    );
  });

  it("calls fetchLineage without a heading param when heading is null", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading={null}
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });

    expect(fetchLineage).toHaveBeenCalledWith(
      "docs/adr-0027.md",
      undefined
    );
  });

  it("renders rows unchanged (no client collapse) in doc mode", async () => {
    (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockLineageSingleRow
    );

    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading={null}
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });

    // Both rows should be present — ADR rows use "ADR-NNNN: title" format
    expect(container.textContent).toContain("ADR-0015: Docs MCP");
    // No §heading segments
    expect(container.textContent).not.toContain("§");
    // Counts from the raw result (no summing)
    expect(container.textContent).toContain("3×");
    expect(container.textContent).toContain("1×");
  });

  it("graph link in doc mode has no section param", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading={null}
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("Open graph centered here");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const graphBtn = buttons.find((b) =>
      b.textContent?.includes("Open graph centered here")
    );
    expect(graphBtn).not.toBeUndefined();
    fireEvent.click(graphBtn!);
    // Must NOT include &section=
    expect(navigate).toHaveBeenCalledWith(
      "/graph?focus=docs%2Fadr-0027.md"
    );
    const calledWith = (navigate as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledWith).not.toContain("section");
  });

  it("row click in doc mode navigates to doc top", async () => {
    const { container } = render(
      <LineagePopover
        docPath="docs/adr-0027.md"
        heading={null}
        navigate={navigate}
      />
    );

    const trigger = container.querySelector("button")!;
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(container.textContent).toContain("docs/spec-state-schema.md");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const rowBtn = buttons.find((b) =>
      b.textContent?.includes("docs/spec-state-schema.md")
    );
    expect(rowBtn).not.toBeUndefined();
    fireEvent.click(rowBtn!);
    expect(navigate).toHaveBeenCalledWith("/spec/docs/spec-state-schema.md");
  });
});
