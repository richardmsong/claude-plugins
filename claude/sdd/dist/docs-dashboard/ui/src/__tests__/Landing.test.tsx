import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import Landing from "../routes/Landing";

// Mock the api module
vi.mock("../api", () => ({
  fetchAdrs: vi.fn(),
  fetchSpecs: vi.fn(),
  fetchAudits: vi.fn(),
}));

import { fetchAdrs, fetchSpecs, fetchAudits } from "../api";

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

const mockAudits = [
  {
    doc_path: "docs/audits/spec-docs-dashboard-2026-04-22.md",
    title: "Spec Alignment Audit — Docs Dashboard",
    category: "audit",
    status: null,
    commit_count: 1,
    last_status_change: "2026-04-22",
    sections: [],
  },
  {
    doc_path: "docs/audits/impl-docs-dashboard-2026-05-01.md",
    title: "Implementation Audit — Docs Dashboard",
    category: "audit",
    status: null,
    commit_count: 1,
    last_status_change: "2026-05-01",
    sections: [],
  },
  {
    doc_path: "docs/audits/design-version-sync-2026-04-28.md",
    title: "Design Audit — Version Sync",
    category: "audit",
    status: null,
    commit_count: 1,
    last_status_change: "2026-04-28",
    sections: [],
  },
];

const navigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (fetchAdrs as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdrs);
  (fetchSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(mockSpecs);
  (fetchAudits as ReturnType<typeof vi.fn>).mockResolvedValue(mockAudits);
});

describe("Landing", () => {
  it("renders ADRs bucketed by status — draft ADR visible by default", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      // Draft bucket should be expanded by default — Feature A is visible with ADR number prefix
      expect(container.textContent).toContain("ADR-0001: Feature A");
    });
  });

  it("all buckets are expanded by default (ADR-0035)", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      // All status buckets expanded — draft, accepted, and implemented items all visible
      expect(container.textContent).toContain("ADR-0001: Feature A");
      expect(container.textContent).toContain("ADR-0002: Feature B");
      expect(container.textContent).toContain("ADR-0003: Feature C");
    });
  });

  it("clicking an expanded bucket collapses it, clicking again re-expands it", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      // All buckets expanded by default — Feature B (accepted) is visible
      expect(container.textContent).toContain("ADR-0002: Feature B");
    });

    // Click accepted bucket header to collapse it
    const buttons = Array.from(container.querySelectorAll("button"));
    const acceptedBtn = buttons.find((b) => b.textContent?.includes("accepted"));
    expect(acceptedBtn).not.toBeUndefined();
    fireEvent.click(acceptedBtn!);

    // Feature B should now be hidden
    await waitFor(() => {
      expect(container.textContent).not.toContain("ADR-0002: Feature B");
    });

    // Click again to re-expand
    fireEvent.click(acceptedBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain("ADR-0002: Feature B");
    });
  });

  it("clicking an ADR navigates to /adr/<doc_path-minus-.md>", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("ADR-0001: Feature A");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const featureABtn = buttons.find((b) => b.textContent?.includes("ADR-0001: Feature A"));
    expect(featureABtn).not.toBeUndefined();
    fireEvent.click(featureABtn!);
    // URL uses full doc_path minus .md extension (works for nested docs dirs too)
    expect(navigate).toHaveBeenCalledWith("/adr/docs/adr-0001-feature-a");
  });

  it("clicking an ADR with nested doc_path navigates to full path route", async () => {
    (fetchAdrs as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        doc_path: "spec-driven-dev/docs/adr-0031-doc-level-lineage.md",
        title: "Doc Level Lineage",
        category: "adr",
        status: "draft",
        commit_count: 2,
        last_status_change: "2026-04-20",
        sections: [],
      },
    ]);

    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("ADR-0031: Doc Level Lineage");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const adrBtn = buttons.find((b) => b.textContent?.includes("ADR-0031: Doc Level Lineage"));
    expect(adrBtn).not.toBeUndefined();
    fireEvent.click(adrBtn!);
    // Full nested path used, so the route can reconstruct doc_path correctly
    expect(navigate).toHaveBeenCalledWith("/adr/spec-driven-dev/docs/adr-0031-doc-level-lineage");
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

    // Draft bucket is expanded by default — both items should be visible immediately with ADR number prefix
    await waitFor(() => {
      expect(container.textContent).toContain("ADR-0011: Newer Draft");
      expect(container.textContent).toContain("ADR-0010: Older Draft");
    });

    // Newer Draft should come first (most recent date first)
    const idx1 = container.textContent!.indexOf("ADR-0011: Newer Draft");
    const idx2 = container.textContent!.indexOf("ADR-0010: Older Draft");
    expect(idx1).toBeLessThan(idx2);
  });
});

// ---------------------------------------------------------------------------
// Audits section (ADR-0074)
// ---------------------------------------------------------------------------

describe("Landing — Audits section", () => {
  it("renders the Audits section heading", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Audits");
    });
  });

  it("groups spec-* audits under 'Spec alignment reports'", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Spec alignment reports");
      expect(container.textContent).toContain("Spec Alignment Audit — Docs Dashboard");
    });
  });

  it("groups impl-* audits under 'Implementation compliance reports'", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Implementation compliance reports");
      expect(container.textContent).toContain("Implementation Audit — Docs Dashboard");
    });
  });

  it("groups design-* audits under 'Design audit reports'", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Design audit reports");
      expect(container.textContent).toContain("Design Audit — Version Sync");
    });
  });

  it("clicking an audit navigates to /audit/<doc_path>", async () => {
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Spec Alignment Audit — Docs Dashboard");
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const auditBtn = buttons.find((b) =>
      b.textContent?.includes("Spec Alignment Audit — Docs Dashboard"),
    );
    expect(auditBtn).not.toBeUndefined();
    fireEvent.click(auditBtn!);
    expect(navigate).toHaveBeenCalledWith(
      "/audit/docs/audits/spec-docs-dashboard-2026-04-22.md",
    );
  });

  it("shows 'No audit reports found.' when fetchAudits returns an empty list", async () => {
    (fetchAudits as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { container } = render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("No audit reports found.");
    });
  });

  it("calls fetchAudits on mount", async () => {
    render(<Landing navigate={navigate} lastEvent={null} />);
    await waitFor(() => {
      expect(fetchAudits).toHaveBeenCalledTimes(1);
    });
  });
});

