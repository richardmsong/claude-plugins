import React from "react";
import { render } from "@testing-library/react";
import { vi, describe, it, expect } from "bun:test";
import MarkdownView from "../components/MarkdownView";

const navigate = vi.fn();

describe("MarkdownView", () => {
  it("renders markdown content as HTML", () => {
    const { container } = render(
      <MarkdownView
        markdown={"# Hello\n\nThis is a paragraph."}
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    expect(container.querySelector("h1")).not.toBeNull();
    expect(container.querySelector("p")).not.toBeNull();
  });

  it("rewrites ADR links to hash routes", () => {
    const { container } = render(
      <MarkdownView
        markdown="See [ADR-0015](docs/adr-0015-docs-mcp.md) for details."
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const link = container.querySelector("a") as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("#/adr/docs/adr-0015-docs-mcp");
  });

  it("rewrites nested ADR links preserving full path", () => {
    const { container } = render(
      <MarkdownView
        markdown="See [ADR-0031](spec-driven-dev/docs/adr-0031-doc-level-lineage.md) for details."
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const link = container.querySelector("a") as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("#/adr/spec-driven-dev/docs/adr-0031-doc-level-lineage");
  });

  it("rewrites spec links to hash routes", () => {
    const { container } = render(
      <MarkdownView
        markdown="See [spec](docs/spec-state-schema.md) for details."
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const link = container.querySelector("a") as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("#/spec/docs/spec-state-schema.md");
  });

  it("rewrites nested spec links to hash routes", () => {
    const { container } = render(
      <MarkdownView
        markdown="See [spec](docs/mclaude-docs-mcp/spec-docs-mcp.md) for details."
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const link = container.querySelector("a") as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(
      "#/spec/docs/mclaude-docs-mcp/spec-docs-mcp.md"
    );
  });

  it("leaves external links with target=_blank", () => {
    const { container } = render(
      <MarkdownView
        markdown="See [external](https://example.com) for details."
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const link = container.querySelector("a") as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("https://example.com");
    expect(link!.getAttribute("target")).toBe("_blank");
  });

  it("renders code blocks", () => {
    const { container } = render(
      <MarkdownView
        markdown={"```ts\nconst x = 1;\n```"}
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    expect(container.querySelector("code")).not.toBeNull();
  });

  it("renders H2 headings with popover placeholder attribute", () => {
    const { container } = render(
      <MarkdownView
        markdown={"## My Section\n\nContent here."}
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    // The H2 should have a span with data-lineage-heading attribute
    const span = container.querySelector("[data-lineage-heading]");
    expect(span).not.toBeNull();
    expect(span?.getAttribute("data-lineage-heading")).toBe(
      encodeURIComponent("My Section")
    );
  });

  it("emits data-line-start and data-line-end on paragraph elements (ADR-0040)", () => {
    const { container } = render(
      <MarkdownView
        markdown={"# Title\n\nFirst paragraph.\n\nSecond paragraph.\n"}
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const paragraphs = container.querySelectorAll("p[data-line-start]");
    expect(paragraphs.length).toBeGreaterThan(0);
    // First paragraph starts at line 3 (after heading + blank line)
    const firstP = paragraphs[0] as HTMLElement;
    const lineStart = parseInt(firstP.getAttribute("data-line-start") ?? "0", 10);
    const lineEnd = parseInt(firstP.getAttribute("data-line-end") ?? "0", 10);
    expect(lineStart).toBeGreaterThan(0);
    expect(lineEnd).toBeGreaterThanOrEqual(lineStart);
  });

  it("emits data-line-start and data-line-end on heading elements (ADR-0040)", () => {
    const { container } = render(
      <MarkdownView
        markdown={"# Title\n\n## Section\n\nContent.\n"}
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const h1 = container.querySelector("h1[data-line-start]") as HTMLElement | null;
    const h2 = container.querySelector("h2[data-line-start]") as HTMLElement | null;
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(parseInt(h1!.getAttribute("data-line-start") ?? "0", 10)).toBe(1);
  });

  it("emits data-line-start and data-line-end on pre (code block) elements (ADR-0040)", () => {
    const { container } = render(
      <MarkdownView
        markdown={"# Title\n\n```ts\nconst x = 1;\n```\n"}
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const pre = container.querySelector("pre[data-line-start]") as HTMLElement | null;
    expect(pre).not.toBeNull();
    const lineStart = parseInt(pre!.getAttribute("data-line-start") ?? "0", 10);
    expect(lineStart).toBeGreaterThan(0);
  });

  it("emits data-line-start on list items (ADR-0040)", () => {
    const { container } = render(
      <MarkdownView
        markdown={"# Title\n\n- item one\n- item two\n"}
        docPath="docs/adr-0001-test.md"
        navigate={navigate}
      />
    );
    const lis = container.querySelectorAll("li[data-line-start]");
    expect(lis.length).toBeGreaterThan(0);
  });
});
