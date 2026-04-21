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
    expect(link!.getAttribute("href")).toBe("#/adr/0015-docs-mcp");
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
});
