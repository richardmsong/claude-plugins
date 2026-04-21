import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { seedTestDb, insertLineage, createTestDb } from "./testutil";
import {
  handleAdrs,
  handleSpecs,
  handleDoc,
  handleLineage,
  handleSearch,
  handleGraph,
} from "../src/routes";

const ADR_CONTENT = `# ADR: Test Feature

**Status**: accepted
**Status history**:
- 2026-01-15: accepted
- 2026-01-01: draft

## Overview

This is a test ADR for unit testing.

## Implementation

Details about implementation go here.
`;

const SPEC_CONTENT = `# Spec: Test Component

## Role

Describes the test component.

## Endpoints

Lists all endpoints.
`;

let db: Database;
let repoRoot: string;
let cleanup: () => void;

beforeEach(() => {
  const result = seedTestDb({
    "adr-0001-test-feature.md": ADR_CONTENT,
    "spec-test-component.md": SPEC_CONTENT,
  });
  db = result.db;
  repoRoot = result.repoRoot;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ---- /api/adrs ----

describe("handleAdrs", () => {
  it("returns all ADRs when no status filter", async () => {
    const url = new URL("http://localhost/api/adrs");
    const res = handleAdrs(db, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { doc_path: string; status: string; last_status_change: string }[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const adr = data.find((d) => d.doc_path.includes("adr-0001"));
    expect(adr).toBeDefined();
    expect(adr!.status).toBe("accepted");
    expect(adr!.last_status_change).toBe("2026-01-15");
  });

  it("filters ADRs by status", async () => {
    const url = new URL("http://localhost/api/adrs?status=accepted");
    const res = handleAdrs(db, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string }[];
    for (const doc of data) {
      expect(doc.status).toBe("accepted");
    }
  });

  it("returns 400 for invalid status", () => {
    const url = new URL("http://localhost/api/adrs?status=bogus");
    const res = handleAdrs(db, url);
    expect(res.status).toBe(400);
  });
});

// ---- /api/specs ----

describe("handleSpecs", () => {
  it("returns spec documents", async () => {
    const res = handleSpecs(db);
    expect(res.status).toBe(200);
    const data = await res.json() as { doc_path: string; category: string }[];
    expect(Array.isArray(data)).toBe(true);
    const spec = data.find((d) => d.doc_path.includes("spec-test-component"));
    expect(spec).toBeDefined();
    expect(spec!.category).toBe("spec");
  });
});

// ---- /api/doc ----

describe("handleDoc", () => {
  it("returns full DocResponse with raw_markdown and sections", async () => {
    const url = new URL(
      "http://localhost/api/doc?path=" +
        encodeURIComponent("docs/adr-0001-test-feature.md")
    );
    const res = handleDoc(db, repoRoot, url);
    expect(res.status).toBe(200);
    const data = await res.json() as {
      doc_path: string;
      raw_markdown: string;
      status: string;
      sections: { heading: string }[];
    };
    expect(data.doc_path).toBe("docs/adr-0001-test-feature.md");
    expect(data.raw_markdown).toContain("# ADR: Test Feature");
    expect(data.status).toBe("accepted");
    expect(Array.isArray(data.sections)).toBe(true);
    expect(data.sections.length).toBeGreaterThan(0);
  });

  it("returns 400 when path is missing", () => {
    const url = new URL("http://localhost/api/doc");
    const res = handleDoc(db, repoRoot, url);
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown doc", async () => {
    const url = new URL(
      "http://localhost/api/doc?path=" +
        encodeURIComponent("docs/nonexistent.md")
    );
    const res = handleDoc(db, repoRoot, url);
    expect(res.status).toBe(404);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("not found");
  });
});

// ---- /api/lineage ----

describe("handleLineage", () => {
  it("returns lineage results (empty when none exist)", async () => {
    const url = new URL(
      "http://localhost/api/lineage?doc=" +
        encodeURIComponent("docs/adr-0001-test-feature.md") +
        "&heading=" +
        encodeURIComponent("Overview")
    );
    const res = handleLineage(db, url);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 400 when doc is missing", () => {
    const url = new URL(
      "http://localhost/api/lineage?heading=" + encodeURIComponent("Overview")
    );
    const res = handleLineage(db, url);
    expect(res.status).toBe(400);
  });

  it("returns 200 (doc mode) when heading is absent (ADR-0031)", async () => {
    // heading is now optional — absent heading triggers doc-level aggregation,
    // not a 400 error.
    const url = new URL(
      "http://localhost/api/lineage?doc=" +
        encodeURIComponent("docs/adr-0001-test-feature.md")
    );
    const res = handleLineage(db, url);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 200 (doc mode) when heading is empty string (ADR-0031)", async () => {
    const url = new URL(
      "http://localhost/api/lineage?doc=" +
        encodeURIComponent("docs/adr-0001-test-feature.md") +
        "&heading="
    );
    const res = handleLineage(db, url);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("doc mode: aggregates multiple section-pairs into one row per co-committed doc (ADR-0031)", async () => {
    // Seed two lineage edges from the ADR to the spec, via different sections
    insertLineage(db, [
      {
        section_a_doc: "docs/adr-0001-test-feature.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-test-component.md",
        section_b_heading: "Role",
        commit_count: 3,
        last_commit: "aaa000",
      },
      {
        section_a_doc: "docs/adr-0001-test-feature.md",
        section_a_heading: "Implementation",
        section_b_doc: "docs/spec-test-component.md",
        section_b_heading: "Endpoints",
        commit_count: 2,
        last_commit: "bbb111",
      },
    ]);

    // Doc mode: no heading param → aggregate by section_b_doc
    const url = new URL(
      "http://localhost/api/lineage?doc=" +
        encodeURIComponent("docs/adr-0001-test-feature.md")
    );
    const res = handleLineage(db, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { doc_path: string; commit_count: number; heading: string }[];

    // Only one row for the spec doc (aggregated from two section-pairs)
    expect(data.length).toBe(1);
    expect(data[0].doc_path).toBe("docs/spec-test-component.md");
    expect(data[0].commit_count).toBe(5); // 3 + 2
    expect(data[0].heading).toBe("");     // empty string in doc mode
  });

  it("re-throws (does not return 404) when a non-NotFoundError is thrown — e.g. closed DB", () => {
    // Close the DB to force a real SQLiteError (not a NotFoundError).
    // The old (buggy) code returned notFound(docPath) for ALL errors.
    // The fixed code re-throws non-NotFoundError, so handleLineage should throw.
    const { db: brokenDb, cleanup: cleanupBroken } = createTestDb();
    brokenDb.close();

    const url = new URL(
      "http://localhost/api/lineage?doc=" +
        encodeURIComponent("docs/adr-0001-test-feature.md") +
        "&heading=" +
        encodeURIComponent("Overview")
    );

    expect(() => handleLineage(brokenDb, url)).toThrow();
    cleanupBroken();
  });
});

// ---- /api/search ----

describe("handleSearch", () => {
  it("returns search results", async () => {
    const url = new URL(
      "http://localhost/api/search?q=" + encodeURIComponent("test")
    );
    const res = handleSearch(db, url);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 400 when q is missing", () => {
    const url = new URL("http://localhost/api/search");
    const res = handleSearch(db, url);
    expect(res.status).toBe(400);
  });

  it("supports limit, category, status filters", async () => {
    const url = new URL(
      "http://localhost/api/search?q=test&limit=5&category=adr&status=accepted"
    );
    const res = handleSearch(db, url);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ---- /api/graph ----

describe("handleGraph", () => {
  it("returns global graph (nodes + edges)", async () => {
    const url = new URL("http://localhost/api/graph");
    const res = handleGraph(db, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
    expect(data.nodes.length).toBeGreaterThan(0);
  });

  it("returns local graph for a known focus doc", async () => {
    insertLineage(db, [
      {
        section_a_doc: "docs/adr-0001-test-feature.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-test-component.md",
        section_b_heading: "Role",
        commit_count: 3,
        last_commit: "abc1234",
      },
    ]);

    const url = new URL(
      "http://localhost/api/graph?focus=" +
        encodeURIComponent("docs/adr-0001-test-feature.md")
    );
    const res = handleGraph(db, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { nodes: { path: string }[]; edges: { from: string; to: string; count: number; last_commit: string }[] };
    expect(data.nodes.length).toBeGreaterThan(0);
    const paths = data.nodes.map((n) => n.path);
    expect(paths).toContain("docs/adr-0001-test-feature.md");
    expect(paths).toContain("docs/spec-test-component.md");
    // Edge must include last_commit
    expect(data.edges.length).toBe(1);
    expect(data.edges[0].last_commit).toBe("abc1234");
  });

  it("edges in global graph include last_commit field", async () => {
    insertLineage(db, [
      {
        section_a_doc: "docs/adr-0001-test-feature.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-test-component.md",
        section_b_heading: "Role",
        commit_count: 4,
        last_commit: "feedcafe",
      },
    ]);

    const url = new URL("http://localhost/api/graph");
    const res = handleGraph(db, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { nodes: unknown[]; edges: { from: string; to: string; count: number; last_commit: string }[] };
    expect(data.edges.length).toBeGreaterThan(0);
    for (const edge of data.edges) {
      expect(typeof edge.last_commit).toBe("string");
      expect(edge.last_commit.length).toBeGreaterThan(0);
    }
    // Verify the specific edge
    const edge = data.edges.find(
      (e) =>
        (e.from.includes("adr-0001") && e.to.includes("spec-test")) ||
        (e.to.includes("adr-0001") && e.from.includes("spec-test"))
    );
    expect(edge).toBeDefined();
    expect(edge!.last_commit).toBe("feedcafe");
  });

  it("returns only focus node for a focus doc with no lineage", async () => {
    const url = new URL(
      "http://localhost/api/graph?focus=" +
        encodeURIComponent("docs/adr-0001-test-feature.md")
    );
    const res = handleGraph(db, url);
    expect(res.status).toBe(200);
    const data = await res.json() as { nodes: { path: string }[]; edges: unknown[] };
    // Only the focus node, no edges
    expect(data.edges.length).toBe(0);
    expect(data.nodes.length).toBe(1);
  });
});
