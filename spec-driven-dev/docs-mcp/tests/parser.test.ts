import { describe, test, expect } from "bun:test";
import { parseMarkdown, classifyCategory } from "../src/parser.js";

describe("parseMarkdown", () => {
  test("extracts H1 title", () => {
    const md = `# My Title\n\nSome preamble.\n\n## Section One\n\nContent here.\n`;
    const result = parseMarkdown(md);
    expect(result.title).toBe("My Title");
  });

  test("returns null title when no H1", () => {
    const md = `## Section One\n\nContent.\n`;
    const result = parseMarkdown(md);
    expect(result.title).toBeNull();
  });

  test("splits on ## headings", () => {
    const md = `# Doc\n\n## Alpha\n\nAlpha content.\n\n## Beta\n\nBeta content.\n`;
    const result = parseMarkdown(md);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].heading).toBe("Alpha");
    expect(result.sections[1].heading).toBe("Beta");
  });

  test("section content includes sub-headings", () => {
    const md = `# Doc\n\n## Main\n\nIntro.\n\n### Sub\n\nSub content.\n`;
    const result = parseMarkdown(md);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].content).toContain("### Sub");
    expect(result.sections[0].content).toContain("Sub content.");
  });

  test("preamble before first ## is not a section", () => {
    const md = `# Title\n\nThis is preamble.\n\n## First Section\n\nContent.\n`;
    const result = parseMarkdown(md);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].heading).toBe("First Section");
  });

  test("line numbers are 1-based and correct", () => {
    const lines = [
      "# Title",       // 1
      "",              // 2
      "## Section A",  // 3
      "Content A.",    // 4
      "",              // 5
      "## Section B",  // 6
      "Content B.",    // 7
    ];
    const md = lines.join("\n");
    const result = parseMarkdown(md);

    expect(result.sections[0].heading).toBe("Section A");
    expect(result.sections[0].lineStart).toBe(3);
    expect(result.sections[0].lineEnd).toBe(5);

    expect(result.sections[1].heading).toBe("Section B");
    expect(result.sections[1].lineStart).toBe(6);
    expect(result.sections[1].lineEnd).toBe(7);
  });

  test("single section spans to EOF", () => {
    // 6 lines: "# Doc", "", "## Only Section", "", "All content.", "More content."
    const md = `# Doc\n\n## Only Section\n\nAll content.\nMore content.`;
    const result = parseMarkdown(md);
    expect(result.sections).toHaveLength(1);
    // section starts at line 3 and ends at line 6 (total 6 lines)
    expect(result.sections[0].lineStart).toBe(3);
    expect(result.sections[0].lineEnd).toBe(6);
  });

  test("empty document returns no sections", () => {
    const result = parseMarkdown("");
    expect(result.title).toBeNull();
    expect(result.sections).toHaveLength(0);
  });

  test("heading text stripped of ## prefix", () => {
    const md = `## The Heading\n\nContent.`;
    const result = parseMarkdown(md);
    expect(result.sections[0].heading).toBe("The Heading");
  });
});

describe("parseMarkdown — lastStatusChange", () => {
  test("extracts the latest date from a status history list", () => {
    const md = [
      "# ADR: Foo",
      "",
      "**Status**: implemented",
      "**Status history**:",
      "- 2026-04-19: accepted",
      "- 2026-04-20: implemented",
      "",
      "## Overview",
      "Content.",
    ].join("\n");
    const result = parseMarkdown(md);
    expect(result.lastStatusChange).toBe("2026-04-20");
  });

  test("returns the lexicographically maximum date when dates are out of order", () => {
    const md = [
      "# ADR: Foo",
      "",
      "**Status**: implemented",
      "**Status history**:",
      "- 2026-04-21: accepted",
      "- 2026-04-19: draft",
      "- 2026-04-20: implemented",
      "",
      "## Overview",
      "Content.",
    ].join("\n");
    const result = parseMarkdown(md);
    expect(result.lastStatusChange).toBe("2026-04-21");
  });

  test("returns null when no status history marker present", () => {
    const md = "# ADR: Foo\n\n**Status**: accepted\n\n## Overview\n\nContent.\n";
    expect(parseMarkdown(md).lastStatusChange).toBeNull();
  });

  test("returns null when history list is empty (marker present, no bullets)", () => {
    const md = [
      "# ADR: Foo",
      "",
      "**Status**: accepted",
      "**Status history**:",
      "",
      "## Overview",
      "Content.",
    ].join("\n");
    expect(parseMarkdown(md).lastStatusChange).toBeNull();
  });

  test("stops scanning history on first non-bullet line", () => {
    const md = [
      "# ADR: Foo",
      "",
      "**Status**: accepted",
      "**Status history**:",
      "- 2026-04-19: accepted",
      "not a bullet",
      "- 2026-04-25: implemented",  // should NOT be picked up
      "",
      "## Overview",
      "Content.",
    ].join("\n");
    // Only "2026-04-19" is in the consecutive run
    expect(parseMarkdown(md).lastStatusChange).toBe("2026-04-19");
  });

  test("returns null for a spec doc with no status history", () => {
    const md = "# State Schema\n\n## KV Buckets\n\nBuckets here.\n";
    expect(parseMarkdown(md).lastStatusChange).toBeNull();
  });

  test("single history entry returns that date", () => {
    const md = [
      "# ADR: Bar",
      "",
      "**Status**: accepted",
      "**Status history**:",
      "- 2026-04-17: accepted",
      "",
      "## Overview",
      "Content.",
    ].join("\n");
    expect(parseMarkdown(md).lastStatusChange).toBe("2026-04-17");
  });
});

describe("classifyCategory", () => {
  test("adr- prefix → adr", () => {
    expect(classifyCategory("docs/adr-2026-04-10-k8s-integration.md")).toBe("adr");
    expect(classifyCategory("adr-2026-04-19-foo.md")).toBe("adr");
  });

  test("spec- prefix → spec", () => {
    expect(classifyCategory("spec-tailscale-dns.md")).toBe("spec");
    expect(classifyCategory("docs/spec-ui.md")).toBe("spec");
    expect(classifyCategory("spec-state-schema.md")).toBe("spec");
  });

  test("feature-list → spec", () => {
    expect(classifyCategory("feature-list.md")).toBe("spec");
    expect(classifyCategory("feature-list-v2.md")).toBe("spec");
  });

  test("plan- prefix → null (removed)", () => {
    expect(classifyCategory("plan-k8s-integration.md")).toBeNull();
    expect(classifyCategory("docs/plan-foo.md")).toBeNull();
  });

  test("design- prefix → null (removed)", () => {
    expect(classifyCategory("design-overview.md")).toBeNull();
    expect(classifyCategory("docs/design-xyz.md")).toBeNull();
  });

  test("unrecognized → null", () => {
    expect(classifyCategory("README.md")).toBeNull();
    expect(classifyCategory("notes.md")).toBeNull();
    expect(classifyCategory("docs/other.md")).toBeNull();
  });
});
