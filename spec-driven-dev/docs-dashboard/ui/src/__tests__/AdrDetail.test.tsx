import React from "react";
import { render, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import AdrDetail from "../routes/AdrDetail";

// Mock api module
vi.mock("../api", () => ({
  fetchDoc: vi.fn(),
  fetchLineage: vi.fn(),
}));

import { fetchDoc, fetchLineage } from "../api";

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
  (fetchDoc as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);
  (fetchLineage as ReturnType<typeof vi.fn>).mockResolvedValue([]);
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
