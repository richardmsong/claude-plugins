import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { seedTestDb, insertLineage, setCommitCount } from "./testutil";
import { globalGraphQuery, localGraphQuery } from "../src/graph-queries";

const ADR_CONTENT = `# ADR: Feature A

**Status**: accepted
**Status history**:
- 2026-01-10: accepted

## Overview

Overview section.
`;

const SPEC_CONTENT = `# Spec: Component B

## Role

Role section.

## Implementation

Implementation section.
`;

const ADR2_CONTENT = `# ADR: Feature C

**Status**: draft
**Status history**:
- 2026-02-01: draft

## Background

Background section.
`;

let db: Database;
let cleanup: () => void;

beforeEach(() => {
  const result = seedTestDb({
    "adr-0001-feature-a.md": ADR_CONTENT,
    "spec-component-b.md": SPEC_CONTENT,
    "adr-0002-feature-c.md": ADR2_CONTENT,
  });
  db = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("globalGraphQuery", () => {
  it("returns all docs as nodes", () => {
    const { nodes } = globalGraphQuery(db);
    expect(nodes.length).toBe(3);
    const paths = nodes.map((n) => n.path);
    expect(paths).toContain("docs/adr-0001-feature-a.md");
    expect(paths).toContain("docs/spec-component-b.md");
    expect(paths).toContain("docs/adr-0002-feature-c.md");
  });

  it("returns no edges when lineage is empty", () => {
    const { edges } = globalGraphQuery(db);
    expect(edges.length).toBe(0);
  });

  it("aggregates section-level rows into doc-pair edges", () => {
    insertLineage(db, [
      {
        section_a_doc: "docs/adr-0001-feature-a.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-component-b.md",
        section_b_heading: "Role",
        commit_count: 3,
        last_commit: "abc1234",
      },
      {
        section_a_doc: "docs/adr-0001-feature-a.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-component-b.md",
        section_b_heading: "Implementation",
        commit_count: 2,
        last_commit: "def5678",
      },
    ]);

    const { edges } = globalGraphQuery(db);
    // Two section-level rows between the same two docs should collapse to one edge
    expect(edges.length).toBe(1);
    const edge = edges[0];
    expect(edge.count).toBe(5); // 3 + 2 aggregated
  });

  it("canonicalizes undirected edges (from < to)", () => {
    insertLineage(db, [
      {
        section_a_doc: "docs/spec-component-b.md",
        section_a_heading: "Role",
        section_b_doc: "docs/adr-0001-feature-a.md",
        section_b_heading: "Overview",
        commit_count: 1,
        last_commit: "a1b2c3",
      },
    ]);

    const { edges } = globalGraphQuery(db);
    expect(edges.length).toBe(1);
    const edge = edges[0];
    // MIN(a, b) — the lexicographically smaller path should be `from`
    expect(edge.from <= edge.to).toBe(true);
  });

  it("excludes self-edges (section_a_doc == section_b_doc)", () => {
    insertLineage(db, [
      {
        section_a_doc: "docs/adr-0001-feature-a.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/adr-0001-feature-a.md",
        section_b_heading: "Overview",
        commit_count: 5,
        last_commit: "self000",
      },
    ]);

    const { edges } = globalGraphQuery(db);
    // Self-edge should be excluded by WHERE clause
    expect(edges.length).toBe(0);
  });

  it("includes commit_count on nodes", () => {
    setCommitCount(db, "docs/adr-0001-feature-a.md", 7);
    const { nodes } = globalGraphQuery(db);
    const adr = nodes.find((n) => n.path === "docs/adr-0001-feature-a.md");
    expect(adr?.commit_count).toBe(7);
  });
});

describe("localGraphQuery", () => {
  it("returns only the focus node when no lineage edges exist", () => {
    const { nodes, edges } = localGraphQuery(db, "docs/adr-0001-feature-a.md");
    expect(edges.length).toBe(0);
    expect(nodes.length).toBe(1);
    expect(nodes[0].path).toBe("docs/adr-0001-feature-a.md");
  });

  it("returns focus + neighbors for a 1-hop query", () => {
    insertLineage(db, [
      {
        section_a_doc: "docs/adr-0001-feature-a.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-component-b.md",
        section_b_heading: "Role",
        commit_count: 3,
        last_commit: "abc1234",
      },
    ]);

    const { nodes, edges } = localGraphQuery(db, "docs/adr-0001-feature-a.md");
    expect(edges.length).toBe(1);
    expect(nodes.length).toBe(2);
    const paths = nodes.map((n) => n.path);
    expect(paths).toContain("docs/adr-0001-feature-a.md");
    expect(paths).toContain("docs/spec-component-b.md");
  });

  it("edges are incident to focus doc only", () => {
    insertLineage(db, [
      {
        section_a_doc: "docs/adr-0001-feature-a.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-component-b.md",
        section_b_heading: "Role",
        commit_count: 3,
        last_commit: "abc1234",
      },
      // Edge between spec and adr2 — should NOT appear in local query for adr1
      {
        section_a_doc: "docs/spec-component-b.md",
        section_a_heading: "Role",
        section_b_doc: "docs/adr-0002-feature-c.md",
        section_b_heading: "Background",
        commit_count: 1,
        last_commit: "xyz9999",
      },
    ]);

    const { edges } = localGraphQuery(db, "docs/adr-0001-feature-a.md");
    // Only the edge touching adr-0001 should appear
    expect(edges.length).toBe(1);
    for (const e of edges) {
      const touchesFocus =
        e.from === "docs/adr-0001-feature-a.md" ||
        e.to === "docs/adr-0001-feature-a.md";
      expect(touchesFocus).toBe(true);
    }
  });

  it("aggregates commit_count across sections for local edges", () => {
    insertLineage(db, [
      {
        section_a_doc: "docs/adr-0001-feature-a.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-component-b.md",
        section_b_heading: "Role",
        commit_count: 2,
        last_commit: "abc1234",
      },
      {
        section_a_doc: "docs/adr-0001-feature-a.md",
        section_a_heading: "Overview",
        section_b_doc: "docs/spec-component-b.md",
        section_b_heading: "Implementation",
        commit_count: 4,
        last_commit: "abc5678",
      },
    ]);

    const { edges } = localGraphQuery(db, "docs/adr-0001-feature-a.md");
    expect(edges.length).toBe(1);
    expect(edges[0].count).toBe(6); // 2 + 4
  });
});
