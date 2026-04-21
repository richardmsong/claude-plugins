import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import LineagePopover from "../components/LineagePopover";

vi.mock("../api", () => ({
  fetchLineage: vi.fn(),
}));

import { fetchLineage } from "../api";

const mockLineage = [
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
  (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue(mockLineage);
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

  it("opens popover on hover and shows lineage rows after loading", async () => {
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
      expect(container.textContent).toContain("Session KV");
    });
    expect(container.textContent).toContain("3×");
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
      expect(container.textContent).toContain("Session KV");
    });

    fireEvent.mouseLeave(trigger);
    expect(container.textContent).not.toContain("Session KV");
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
      expect(container.textContent).toContain("Session KV");
    });

    // Mouse leave should NOT close when pinned
    fireEvent.mouseLeave(trigger);
    expect(container.textContent).toContain("Session KV");
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
      expect(container.textContent).toContain("Session KV");
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.textContent).not.toContain("Session KV");
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
      expect(container.textContent).toContain("Session KV");
    });

    const outside = container.querySelector("#outside")!;
    fireEvent.mouseDown(outside);
    expect(container.textContent).not.toContain("Session KV");
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

  it("clicking graph link navigates to /graph?focus=...&section=...", async () => {
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
});
