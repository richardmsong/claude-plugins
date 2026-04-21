import React, { useMemo, useCallback } from "react";
import { Marked } from "marked";
import hljs from "highlight.js";
import { createRoot } from "react-dom/client";
import LineagePopover from "./LineagePopover";

// Convert a doc path to a hash route:
// - docs/adr-*.md -> #/adr/<slug>
// - docs/**/spec-*.md -> #/spec/<path>
function docLinkToHash(href: string): string | null {
  // Match ADR links (e.g. docs/adr-0015-docs-mcp.md)
  const adrMatch = href.match(/(?:^|.*\/)adr-(.+)\.md$/);
  if (adrMatch) return `#/adr/${adrMatch[1]}`;

  // Match spec links (e.g. docs/spec-state-schema.md or docs/subdir/spec-foo.md)
  if (href.match(/spec-.+\.md$/)) {
    if (href.startsWith("docs/")) return `#/spec/${href}`;
    return `#/spec/docs/${href}`;
  }

  return null;
}

interface MarkdownViewProps {
  markdown: string;
  docPath: string;
  navigate: (href: string) => void;
}

// Unique placeholder attribute for popover injection
const POPOVER_PLACEHOLDER = "data-lineage-heading";

export default function MarkdownView({ markdown, docPath, navigate }: MarkdownViewProps) {
  const html = useMemo(() => {
    // Use a fresh Marked instance per render — marked.use() mutates the global
    // instance (stacking extensions), so we must use new Marked() here.
    const markedInstance = new Marked({
      renderer: {
        // Code blocks: apply highlight.js
        code(code: string, lang: string | undefined) {
          const language = lang && hljs.getLanguage(lang) ? lang : "";
          const highlighted = language
            ? hljs.highlight(code, { language }).value
            : hljs.highlightAuto(code).value;
          return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
        },

        // Rewrite relative doc links
        link(href: string, title: string | null | undefined, text: string): string {
          const internalHash = docLinkToHash(href);
          if (internalHash) {
            return `<a href="${internalHash}" title="${title ?? ""}">${text}</a>`;
          }
          return `<a href="${href}" title="${title ?? ""}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        },

        // H2 headings get a lineage trigger placeholder
        heading(text: string, depth: number): string {
          if (depth === 2) {
            const encodedHeading = encodeURIComponent(text);
            const id = text.toLowerCase().replace(/[^\w]+/g, "-");
            return `<h2 id="${id}" style="display:flex;align-items:center;gap:0.5rem">${text}<span ${POPOVER_PLACEHOLDER}="${encodedHeading}"></span></h2>`;
          }
          const tag = `h${depth}`;
          const id = text.toLowerCase().replace(/[^\w]+/g, "-");
          return `<${tag} id="${id}">${text}</${tag}>`;
        },
      },
    });

    try {
      return markedInstance.parse(markdown) as string;
    } catch {
      return `<pre style="color:#fc8181">${markdown.replace(/</g, "&lt;")}</pre><p style="color:#fc8181">Warning: markdown parse error — showing raw source.</p>`;
    }
  }, [markdown]);

  // After render, inject React LineagePopover components into the placeholders
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const placeholders = node.querySelectorAll<HTMLSpanElement>(
        `[${POPOVER_PLACEHOLDER}]`
      );
      for (const placeholder of placeholders) {
        const heading = decodeURIComponent(
          placeholder.getAttribute(POPOVER_PLACEHOLDER) ?? ""
        );
        if (!heading) continue;
        const root = createRoot(placeholder);
        root.render(
          <LineagePopover
            docPath={docPath}
            heading={heading}
            navigate={navigate}
          />
        );
      }
    },
    [docPath, navigate]
  );

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      style={styles.container}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    color: "#e2e8f0",
    lineHeight: 1.7,
    fontSize: "0.95rem",
  },
};
