import React from "react";
import { render, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "bun:test";
import Graph from "../routes/Graph";

// Mock the api module
vi.mock("../api", () => ({
  fetchGraph: vi.fn(),
}));

import { fetchGraph } from "../api";

// Captured linkLabel from the ForceGraph2D mock, so tests can assert its output
let capturedLinkLabel: ((link: unknown) => string) | null = null;

// Mock react-force-graph-2d — it's canvas-based and won't work in jsdom
vi.mock("react-force-graph-2d", () => ({
  default: ({
    graphData,
    linkLabel,
  }: {
    graphData: { nodes: { id: string }[]; links: unknown[] };
    linkLabel?: (link: unknown) => string;
  }) => {
    capturedLinkLabel = linkLabel ?? null;
    return (
      <div data-testid="force-graph">
        {graphData.nodes.map((n) => (
          <div key={n.id} data-nodeid={n.id}>
            {n.id}
          </div>
        ))}
      </div>
    );
  },
}));

const fixtureResponse = {
  nodes: [
    {
      path: "docs/adr-0001-feature-a.md",
      title: "Feature A",
      category: "adr",
      status: "accepted",
      commit_count: 3,
    },
    {
      path: "docs/spec-component-b.md",
      title: "Component B",
      category: "spec",
      status: null,
      commit_count: 2,
    },
  ],
  edges: [
    {
      from: "docs/adr-0001-feature-a.md",
      to: "docs/spec-component-b.md",
      count: 5,
      last_commit: "abc1234",
    },
  ],
};

const navigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  capturedLinkLabel = null;
  (fetchGraph as ReturnType<typeof vi.fn>).mockResolvedValue(fixtureResponse);
});

describe("Graph", () => {
  it("renders loading state initially", () => {
    const { container } = render(<Graph navigate={navigate} />);
    expect(container.textContent).toContain("Loading graph");
  });

  it("renders the force graph after data loads", async () => {
    const { container } = render(<Graph navigate={navigate} />);
    await waitFor(() => {
      expect(container.querySelector("[data-testid='force-graph']")).not.toBeNull();
    });
  });

  it("renders nodes from the fixture response", async () => {
    const { container } = render(<Graph navigate={navigate} />);
    await waitFor(() => {
      const node = container.querySelector("[data-nodeid='docs/adr-0001-feature-a.md']");
      expect(node).not.toBeNull();
    });
    const specNode = container.querySelector("[data-nodeid='docs/spec-component-b.md']");
    expect(specNode).not.toBeNull();
  });

  it("shows global graph title in global mode", async () => {
    const { container } = render(<Graph navigate={navigate} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Global dependency graph");
    });
  });

  it("shows local graph title in local mode", async () => {
    const { container } = render(<Graph focus="docs/adr-0001-feature-a.md" navigate={navigate} />);
    await waitFor(() => {
      expect(container.textContent).toContain("1-hop neighborhood");
    });
  });

  it("renders sidebar edge filters in global mode", async () => {
    const { container } = render(<Graph navigate={navigate} />);
    await waitFor(() => {
      expect(container.textContent).toContain("ADR ↔ ADR");
      expect(container.textContent).toContain("Spec ↔ Spec");
    });
  });

  it("does not render sidebar in local mode", async () => {
    const { container } = render(<Graph focus="docs/adr-0001-feature-a.md" navigate={navigate} />);
    await waitFor(() => {
      // Local mode has no sidebar filters
      expect(container.textContent).not.toContain("ADR ↔ ADR");
    });
  });

  it("shows error message on fetch failure", async () => {
    (fetchGraph as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );
    const { container } = render(<Graph navigate={navigate} />);
    await waitFor(() => {
      expect(container.textContent).toContain("Error:");
    });
  });

  it("linkLabel shows count and last_commit short hash on edge hover", async () => {
    render(<Graph navigate={navigate} />);
    await waitFor(() => {
      // The ForceGraph2D mock should have received a linkLabel prop
      expect(capturedLinkLabel).not.toBeNull();
    });

    // Invoke the captured linkLabel with a ForceLink object
    const label = capturedLinkLabel!({
      source: "docs/adr-0001-feature-a.md",
      target: "docs/spec-component-b.md",
      count: 5,
      last_commit: "abc1234",
    });
    // Format per spec: "<count>× — <last_commit_short_hash>"
    expect(label).toContain("5×");
    expect(label).toContain("abc1234");
  });

  it("linkLabel includes count and last_commit in local mode", async () => {
    render(<Graph focus="docs/adr-0001-feature-a.md" navigate={navigate} />);
    await waitFor(() => {
      expect(capturedLinkLabel).not.toBeNull();
    });

    const label = capturedLinkLabel!({
      source: "docs/adr-0001-feature-a.md",
      target: "docs/spec-component-b.md",
      count: 5,
      last_commit: "abc1234",
    });
    expect(label).toContain("5×");
    expect(label).toContain("abc1234");
  });
});
