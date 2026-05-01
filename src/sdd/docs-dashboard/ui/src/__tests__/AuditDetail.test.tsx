import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import AuditDetail from "../routes/AuditDetail";

// Mock the api module — AuditDetail only uses fetchDoc.
vi.mock("../api", () => ({
  fetchDoc: vi.fn(),
}));

import { fetchDoc } from "../api";

// Mock MarkdownView so we can verify it is used (and blame/lineage components are not).
vi.mock("../components/MarkdownView", () => ({
  default: (props: { markdown?: string; [key: string]: unknown }) =>
    React.createElement("div", {
      "data-testid": "markdown-view",
      "data-markdown": props.markdown ?? "",
    }),
}));

// These components must NOT appear in an AuditDetail render (ADR-0074).
vi.mock("../components/LineagePopover", () => ({
  default: () => React.createElement("div", { "data-testid": "lineage-popover" }),
}));

vi.mock("../components/BlameGutter", () => ({
  default: () => React.createElement("div", { "data-testid": "blame-gutter" }),
}));

vi.mock("../components/LineBlamePopover", () => ({
  default: () => React.createElement("div", { "data-testid": "line-blame-popover" }),
}));

const mockAuditDoc = {
  doc_path: "docs/audits/spec-docs-dashboard-2026-05-01.md",
  title: "Spec Alignment Audit — Docs Dashboard",
  category: "audit",
  status: null,
  commit_count: 1,
  raw_markdown: "# Spec Alignment Audit\n\nAll CLEAN.",
  sections: [],
};

const navigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (fetchDoc as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuditDoc);
});

// ---------------------------------------------------------------------------

describe("AuditDetail — successful render", () => {
  it("fetches the doc by docPath on mount", async () => {
    render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );
    await waitFor(() => {
      expect(fetchDoc).toHaveBeenCalledWith(
        "docs/audits/spec-docs-dashboard-2026-05-01.md",
      );
    });
  });

  it("renders the document title", async () => {
    const { container } = render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );
    await waitFor(() => {
      expect(container.textContent).toContain(
        "Spec Alignment Audit — Docs Dashboard",
      );
    });
  });

  it("renders MarkdownView with the raw_markdown content", async () => {
    const { container } = render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );
    await waitFor(() => {
      const mv = container.querySelector("[data-testid='markdown-view']");
      expect(mv).not.toBeNull();
      expect((mv as HTMLElement).dataset.markdown).toContain(
        "# Spec Alignment Audit",
      );
    });
  });

  it("renders a back button that navigates to /", async () => {
    const { container } = render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );
    await waitFor(() => {
      expect(container.textContent).toContain("← Back");
    });

    const backBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("← Back"),
    );
    expect(backBtn).not.toBeUndefined();
    fireEvent.click(backBtn!);
    expect(navigate).toHaveBeenCalledWith("/");
  });
});

// ---------------------------------------------------------------------------

describe("AuditDetail — 404 error state", () => {
  it("shows an error message when fetchDoc returns 404", async () => {
    (fetchDoc as ReturnType<typeof vi.fn>).mockRejectedValue({
      status: 404,
      message: "not found",
    });

    const { container } = render(
      <AuditDetail
        docPath="docs/audits/missing-report.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );

    await waitFor(() => {
      expect(container.textContent).toContain(
        "Audit report not found: docs/audits/missing-report.md",
      );
    });
  });

  it("shows a back button on error state", async () => {
    (fetchDoc as ReturnType<typeof vi.fn>).mockRejectedValue({
      status: 404,
      message: "not found",
    });

    const { container } = render(
      <AuditDetail
        docPath="docs/audits/missing-report.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );

    await waitFor(() => {
      expect(container.textContent).toContain("Back to index");
    });

    const backBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Back to index"),
    );
    expect(backBtn).not.toBeUndefined();
    fireEvent.click(backBtn!);
    expect(navigate).toHaveBeenCalledWith("/");
  });
});

// ---------------------------------------------------------------------------

describe("AuditDetail — reindex refetch", () => {
  it("refetches the doc when a matching reindex event arrives", async () => {
    const { rerender } = render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );

    await waitFor(() => {
      expect(fetchDoc).toHaveBeenCalledTimes(1);
    });

    // Simulate a reindex event that includes this doc.
    rerender(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={{
          type: "reindex",
          changed: ["docs/audits/spec-docs-dashboard-2026-05-01.md"],
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchDoc).toHaveBeenCalledTimes(2);
    });
  });

  it("does NOT refetch when reindex event does not include this doc", async () => {
    const { rerender } = render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );

    await waitFor(() => {
      expect(fetchDoc).toHaveBeenCalledTimes(1);
    });

    rerender(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={{
          type: "reindex",
          changed: ["docs/audits/some-other-report.md"],
        }}
      />,
    );

    // Should still be only 1 call.
    await waitFor(() => {
      expect(fetchDoc).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------

describe("AuditDetail — absence of blame and lineage components (ADR-0074)", () => {
  it("does not render a BlameGutter", async () => {
    const { container } = render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector("[data-testid='markdown-view']")).not.toBeNull();
    });
    expect(container.querySelector("[data-testid='blame-gutter']")).toBeNull();
  });

  it("does not render a LineagePopover", async () => {
    const { container } = render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector("[data-testid='markdown-view']")).not.toBeNull();
    });
    expect(container.querySelector("[data-testid='lineage-popover']")).toBeNull();
  });

  it("does not render a LineBlamePopover", async () => {
    const { container } = render(
      <AuditDetail
        docPath="docs/audits/spec-docs-dashboard-2026-05-01.md"
        navigate={navigate}
        lastEvent={null}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector("[data-testid='markdown-view']")).not.toBeNull();
    });
    expect(container.querySelector("[data-testid='line-blame-popover']")).toBeNull();
  });
});
