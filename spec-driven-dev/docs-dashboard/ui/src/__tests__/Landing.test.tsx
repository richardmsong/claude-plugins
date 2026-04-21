import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import Landing from "../routes/Landing";

// Mock the api module
vi.mock("../api", () => ({
  fetchAdrs: vi.fn(),
  fetchSpecs: vi.fn(),
}));

import { fetchAdrs, fetchSpecs } from "../api";

const mockAdrs = [
  {
    doc_path: "docs/adr-0001-feature-a.md",
    title: "Feature A",
    category: "adr",
    status: "draft",
    commit_count: 3,
    last_status_change: "2026-04-10",
    sections: [],
  },
  {
    doc_path: "docs/adr-0002-feature-b.md",
    title: "Feature B",
    category: "adr",
    status: "accepted",
    commit_count: 5,
    last_status_change: "2026-04-15",
    sections: [],
  },
  {
    doc_path: "docs/adr-0003-feature-c.md",
    title: "Feature C",
    category: "adr",
    status: "implemented",
    commit_count: 8,
    last_status_change: "2026-03-01",
    sections: [],
  },
];

const mockSpecs = [
  {
    doc_path: "docs/spec-state-schema.md",
    title: "State Schema",
    category: "spec",
    status: null,
    commit_count: 4,
    last_status_change: null,
    sections: [],
  },
  {
    doc_path: "docs/mclaude-docs-mcp/spec-docs-mcp.md",
    title: "Docs MCP Spec",
    category: "spec",
    status: null,
    commit_count: 2,
    last_status_change: null,
    sections: [],
  },
];

const navigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (fetchAdrs as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdrs);
  (fetchSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(mockSpecs);
});

describe("Landing", () => {
  it("renders ADRs bucketed by status — draft ADR visible by default", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      // Draft bucket should be expanded by default — Feature A is visible
      expect(container.textContent).toContain("Feature A");
    });
  });

  it("draft bucket is expanded by default, accepted is collapsed", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Feature A");
    });
    // Feature B (accepted) should NOT be visible until expanded
    expect(container.textContent).not.toContain("Feature B");
  });

  it("clicking a collapsed bucket expands it", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Feature A");
    });

    // Find and click the accepted bucket header (contains "accepted" text)
    const buttons = Array.from(container.querySelectorAll("button"));
    const acceptedBtn = buttons.find((b) => b.textContent?.includes("accepted"));
    expect(acceptedBtn).not.toBeUndefined();
    fireEvent.click(acceptedBtn!);

    // Feature B should now be visible
    await waitFor(() => {
      expect(container.textContent).toContain("Feature B");
    });
  });

  it("clicking an ADR navigates to /adr/<slug>", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Feature A");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const featureABtn = buttons.find((b) => b.textContent?.trim() === "Feature A" || b.textContent?.includes("Feature A"));
    expect(featureABtn).not.toBeUndefined();
    fireEvent.click(featureABtn!);
    expect(navigate).toHaveBeenCalledWith("/adr/0001-feature-a");
  });

  it("renders spec groups by directory", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("State Schema");
    });
    // Both specs should be visible (spec groups are expanded by default)
    expect(container.textContent).toContain("State Schema");
    expect(container.textContent).toContain("Docs MCP Spec");
  });

  it("clicking a spec navigates to /spec/<path>", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("State Schema");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const specBtn = buttons.find((b) => b.textContent?.trim() === "State Schema" || b.textContent?.includes("State Schema"));
    expect(specBtn).not.toBeUndefined();
    fireEvent.click(specBtn!);
    expect(navigate).toHaveBeenCalledWith("/spec/docs/spec-state-schema.md");
  });

  it("sorts ADRs within a bucket by last_status_change descending", async () => {
    // Use draft status so the bucket is expanded by default (no click needed)
    (fetchAdrs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        doc_path: "docs/adr-0010-older.md",
        title: "Older Draft",
        category: "adr",
        status: "draft",
        commit_count: 1,
        last_status_change: "2026-01-01",
        sections: [],
      },
      {
        doc_path: "docs/adr-0011-newer.md",
        title: "Newer Draft",
        category: "adr",
        status: "draft",
        commit_count: 2,
        last_status_change: "2026-03-15",
        sections: [],
      },
    ]);

    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);

    // Draft bucket is expanded by default — both items should be visible immediately
    await waitFor(() => {
      expect(container.textContent).toContain("Newer Draft");
      expect(container.textContent).toContain("Older Draft");
    });

    // Newer Draft should come first (most recent date first)
    const idx1 = container.textContent!.indexOf("Newer Draft");
    const idx2 = container.textContent!.indexOf("Older Draft");
    expect(idx1).toBeLessThan(idx2);
  });
});
