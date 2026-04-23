import React, { useMemo, useCallback } from "react";
import { Marked } from "marked";
import hljs from "highlight.js";
import { createRoot } from "react-dom/client";
import LineagePopover from "./LineagePopover";
import "./markdown-body.css";
import type { BlameBlock } from "../api";

// Convert a doc path to a hash route:
// - **/adr-*.md -> #/adr/<full-path-without-extension>
// - **/spec-*.md -> #/spec/<full-path>
function docLinkToHash(href: string): string | null {
  const base = href.split("/").pop() ?? "";
  if (base.startsWith("adr-")) return `#/adr/${href.replace(/\.md$/, "")}`;
  if (base.startsWith("spec-")) return `#/spec/${href}`;
  return null;
}

/** Compute per-block line ranges from the markdown source using the marked lexer. */
interface BlockLineRange {
  lineStart: number;
  lineEnd: number;
  type: string;
}

function computeBlockLineRanges(markdown: string, markedInstance: Marked): BlockLineRange[] {
  const tokens = markedInstance.lexer(markdown);
  const ranges: BlockLineRange[] = [];
  let charOffset = 0;

  for (const tok of tokens) {
    if (!tok.raw) continue;
    const lineStart = markdown.slice(0, charOffset).split("\n").length;
    const rawEnd = charOffset + tok.raw.length;
    // lineEnd: count lines in the raw text (trim trailing newline so it doesn't count as an extra line)
    const rawTrimmed = tok.raw.replace(/\n$/, "");
    const lineEnd = lineStart + rawTrimmed.split("\n").length - 1;
    // Emit a range entry for all content-bearing tokens (skip space tokens)
    if (tok.type !== "space") {
      ranges.push({ lineStart, lineEnd, type: tok.type });
    }
    charOffset = rawEnd;
  }

  return ranges;
}

/** Find the BlameBlock that covers the given line range (by overlap). */
function findBlameBlock(
  lineStart: number,
  lineEnd: number,
  blameBlocks: BlameBlock[],
): BlameBlock | null {
  for (const b of blameBlocks) {
    // Overlapping ranges
    if (b.line_start <= lineEnd && b.line_end >= lineStart) {
      return b;
    }
  }
  return null;
}

/** Check if all lines in a range are uncommitted. */
function isRangeUncommitted(
  lineStart: number,
  lineEnd: number,
  uncommittedLines: number[],
): boolean {
  if (uncommittedLines.length === 0) return false;
  const uncommittedSet = new Set(uncommittedLines);
  for (let l = lineStart; l <= lineEnd; l++) {
    if (!uncommittedSet.has(l)) return false;
  }
  return lineEnd >= lineStart;
}

interface MarkdownViewProps {
  markdown: string;
  docPath: string;
  navigate: (href: string) => void;
  /** Blame blocks for the document. Empty = no blame data loaded yet. */
  blameBlocks?: BlameBlock[];
  /** Line numbers with no blame (working copy changes). */
  uncommittedLines?: number[];
  /** Called when the user hovers a rendered block. Passes the element's bounding rect
   *  so callers can anchor the popover to the block element (not the cursor). */
  onBlockHover?: (
    block: BlameBlock | null,
    isUncommitted: boolean,
    lineStart: number,
    lineEnd: number,
    rect: DOMRect,
  ) => void;
  /** Called when the user stops hovering a block. */
  onBlockLeave?: () => void;
}

// Unique placeholder attribute for popover injection
const POPOVER_PLACEHOLDER = "data-lineage-heading";
// Attribute for blame line tracking
const LINE_START_ATTR = "data-line-start";
const LINE_END_ATTR = "data-line-end";
// Highlight style (applied inline to avoid CSS class collisions)
const HOVER_BG = "rgba(99,179,237,0.08)";

export default function MarkdownView({
  markdown,
  docPath,
  navigate,
  blameBlocks = [],
  uncommittedLines = [],
  onBlockHover,
  onBlockLeave,
}: MarkdownViewProps) {
  // We need a stable Marked instance to both compute line ranges and parse.
  // Create once per markdown string using useMemo.
  const { html } = useMemo(() => {
    // Use a fresh Marked instance per render — marked.use() mutates the global
    // instance (stacking extensions), so we must use new Marked() here.
    const markedInstance = new Marked({
      breaks: true,
    });

    // Pre-compute block line ranges using the lexer (before rendering)
    const blockLineRanges = computeBlockLineRanges(markdown, markedInstance);

    // Use a counter to track which block the renderer is currently on
    let blockIndex = 0;

    function nextLineRange(): { lineStart: number; lineEnd: number } | null {
      if (blockIndex < blockLineRanges.length) {
        return blockLineRanges[blockIndex++];
      }
      return null;
    }

    function lineAttrs(range: { lineStart: number; lineEnd: number } | null): string {
      if (!range) return "";
      return ` ${LINE_START_ATTR}="${range.lineStart}" ${LINE_END_ATTR}="${range.lineEnd}"`;
    }

    markedInstance.use({
      renderer: {
        // Code blocks: apply highlight.js
        code(code: string, lang: string | undefined) {
          const language = lang && hljs.getLanguage(lang) ? lang : "";
          const highlighted = language
            ? hljs.highlight(code, { language }).value
            : hljs.highlightAuto(code).value;
          const range = nextLineRange();
          return `<pre${lineAttrs(range)}><code class="hljs language-${language}">${highlighted}</code></pre>`;
        },

        // Rewrite relative doc links
        link(href: string, title: string | null | undefined, text: string): string {
          const internalHash = docLinkToHash(href);
          if (internalHash) {
            return `<a href="${internalHash}" title="${title ?? ""}">${text}</a>`;
          }
          return `<a href="${href}" title="${title ?? ""}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        },

        // H2 headings get a lineage trigger placeholder; all headings get line attrs
        heading(text: string, depth: number): string {
          const range = nextLineRange();
          const attrs = lineAttrs(range);
          if (depth === 2) {
            const encodedHeading = encodeURIComponent(text);
            const id = text.toLowerCase().replace(/[^\w]+/g, "-");
            return `<h2 id="${id}"${attrs} style="display:flex;align-items:center;gap:0.5rem">${text}<span ${POPOVER_PLACEHOLDER}="${encodedHeading}"></span></h2>`;
          }
          const tag = `h${depth}`;
          const id = text.toLowerCase().replace(/[^\w]+/g, "-");
          return `<${tag} id="${id}"${attrs}>${text}</${tag}>`;
        },

        // Paragraphs
        paragraph(text: string): string {
          const range = nextLineRange();
          return `<p${lineAttrs(range)}>${text}</p>\n`;
        },

        // List items
        listitem(text: string): string {
          const range = nextLineRange();
          return `<li${lineAttrs(range)}>${text}</li>\n`;
        },

        // Table rows
        tablerow(content: string): string {
          const range = nextLineRange();
          return `<tr${lineAttrs(range)}>${content}</tr>\n`;
        },
      },
    });

    let renderedHtml: string;
    try {
      renderedHtml = markedInstance.parse(markdown) as string;
    } catch {
      renderedHtml = `<pre style="color:#fc8181">${markdown.replace(/</g, "&lt;")}</pre><p style="color:#fc8181">Warning: markdown parse error — showing raw source.</p>`;
    }

    return { html: renderedHtml };
  }, [markdown]);

  // After render, inject React LineagePopover components and attach hover listeners
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;

      // Inject LineagePopover placeholders
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

      // Attach hover listeners to blame-annotated blocks
      if (!onBlockHover) return;

      const blockEls = node.querySelectorAll<HTMLElement>(
        `[${LINE_START_ATTR}]`
      );

      for (const el of blockEls) {
        const lineStart = parseInt(el.getAttribute(LINE_START_ATTR) ?? "0", 10);
        const lineEnd = parseInt(el.getAttribute(LINE_END_ATTR) ?? "0", 10);
        if (!lineStart) continue;

        el.addEventListener("mouseenter", () => {
          el.style.backgroundColor = HOVER_BG;
          const block = findBlameBlock(lineStart, lineEnd, blameBlocks);
          const uncommitted = isRangeUncommitted(lineStart, lineEnd, uncommittedLines);
          // Pass the element's bounding rect so the caller can anchor the popover
          // to the block element (no gap between block and popover).
          const rect = el.getBoundingClientRect();
          onBlockHover(block, uncommitted, lineStart, lineEnd, rect);
        });
        el.addEventListener("mouseleave", () => {
          el.style.backgroundColor = "";
          if (onBlockLeave) onBlockLeave();
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docPath, navigate, blameBlocks, uncommittedLines, onBlockHover, onBlockLeave]
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
