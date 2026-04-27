import React, { useEffect, useState, useCallback, useRef } from "react";
import { fetchDoc, fetchBlame, DocResponse, BlameBlock, BlameResponse } from "../api";
import StatusBadge from "../components/StatusBadge";
import MarkdownView from "../components/MarkdownView";
import LineagePopover from "../components/LineagePopover";
import BlameGutter from "../components/BlameGutter";
import BlameRangeFilter, { BlameRange } from "../components/BlameRangeFilter";
import LineBlamePopover from "../components/LineBlamePopover";
import type { SSEEvent } from "../App";

interface AdrDetailProps {
  slug: string;
  navigate: (href: string) => void;
  lastEvent: SSEEvent | null;
}

function slugToDocPath(slug: string): string {
  return `${slug}.md`;
}

interface PopoverState {
  block: BlameBlock | null;
  isUncommitted: boolean;
  lineStart: number;
  lineEnd: number;
  top: number;
  left: number;
  pinned: boolean;
}

export default function AdrDetail({ slug, navigate, lastEvent }: AdrDetailProps) {
  const [doc, setDoc] = useState<DocResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [blameData, setBlameData] = useState<BlameResponse | null>(null);
  const [blameRange, setBlameRange] = useState<BlameRange>({ mode: "all" });

  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dismiss timer: started on block mouseleave, cancelled if the mouse enters the
  // popover before it fires (hover bridge — ADR-0041).
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const docPath = slugToDocPath(slug);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDoc(docPath);
      setDoc(data);
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { error?: string } };
      if (e.status === 404) {
        setError(`Document not found: ${docPath}`);
      } else {
        setError(`Failed to load: ${e.body?.error ?? String(err)}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadBlame(range: BlameRange) {
    try {
      const data = await fetchBlame(
        docPath,
        range.mode === "since" ? range.since : undefined,
        range.mode === "branch" ? range.ref : undefined,
      );
      setBlameData(data);
    } catch {
      setBlameData({ blocks: [], uncommitted_lines: [] });
    }
  }

  useEffect(() => {
    load();
  }, [slug]);

  useEffect(() => {
    loadBlame(blameRange);
  }, [slug]);

  // Refetch if this doc was reindexed
  useEffect(() => {
    if (lastEvent?.type === "reindex" && lastEvent.changed.includes(docPath)) {
      load();
      loadBlame(blameRange);
    }
  }, [lastEvent]);

  function handleRangeChange(range: BlameRange) {
    setBlameRange(range);
    loadBlame(range);
  }

  const handleBlockHover = useCallback(
    (
      block: BlameBlock | null,
      isUncommitted: boolean,
      lineStart: number,
      lineEnd: number,
      rect: DOMRect,
    ) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Find block index for gutter highlight
      const blocks = blameData?.blocks ?? [];
      const idx = blocks.findIndex((b) => b.line_start === lineStart && b.line_end === lineEnd);
      setHoveredBlockIndex(idx >= 0 ? idx : null);

      debounceRef.current = setTimeout(() => {
        if (popover?.pinned) return;
        // Anchor to the block element's bounding rect — overlap by 4px so there is
        // no gap between the block and the popover (prevents dismiss on mouse transition).
        setPopover({
          block,
          isUncommitted,
          lineStart,
          lineEnd,
          top: rect.bottom - 4,
          left: rect.left,
          pinned: false,
        });
      }, 300);
    },
    [blameData, popover],
  );

  const handleBlockLeave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setHoveredBlockIndex(null);
    if (!popover?.pinned) {
      // Use a short delay instead of immediately dismissing. If the mouse enters
      // the popover before the timer fires, handlePopoverMouseEnter cancels it
      // (hover bridge — ADR-0041). 80ms is enough for the cursor to cross into
      // the overlapping popover without feeling sluggish.
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setPopover(null);
      }, 80);
    }
  }, [popover]);

  const handleGutterHover = useCallback(
    (blockIndex: number, event: React.MouseEvent) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setHoveredBlockIndex(blockIndex);
      const block = blameData?.blocks[blockIndex] ?? null;
      if (block) {
        // Anchor to the gutter annotation element's bounding rect
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        setPopover({
          block,
          isUncommitted: false,
          lineStart: block.line_start,
          lineEnd: block.line_end,
          top: rect.top,
          left: rect.right - 4,
          pinned: popover?.pinned ?? false,
        });
      }
    },
    [blameData, popover],
  );

  const handleGutterLeave = useCallback(() => {
    setHoveredBlockIndex(null);
    if (!popover?.pinned) setPopover(null);
  }, [popover]);

  const handlePin = useCallback(() => {
    setPopover((prev) => prev ? { ...prev, pinned: !prev.pinned } : prev);
  }, []);

  const handleDismiss = useCallback(() => {
    setPopover(null);
    setHoveredBlockIndex(null);
  }, []);

  // Hover bridge: entering the popover keeps the block highlighted.
  // Leaving the popover (to empty space) dismisses if not pinned.
  const handlePopoverMouseEnter = useCallback(() => {
    // Cancel any pending show-debounce — don't re-trigger popover from scratch
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Cancel any pending dismiss — the user moved from block → popover (ADR-0041).
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    setHoveredBlockIndex(null);
    if (!popover?.pinned) setPopover(null);
  }, [popover]);

  if (loading) return <div style={styles.loading}>Loading…</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!doc) return null;

  const blocks = blameData?.blocks ?? [];
  const uncommittedLines = blameData?.uncommitted_lines ?? [];

  return (
    <article style={styles.article}>
      <header style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>{doc.title ?? slug}</h1>
          <LineagePopover docPath={doc.doc_path} heading={null} navigate={navigate} />
          <StatusBadge status={doc.status} />
        </div>
        <div style={styles.meta}>
          <span style={styles.path}>{doc.doc_path}</span>
          {doc.commit_count > 0 && (
            <span style={styles.commitCount}>{doc.commit_count} commits</span>
          )}
        </div>
      </header>

      <BlameRangeFilter value={blameRange} onChange={handleRangeChange} />

      <div style={styles.contentRow}>
        {blocks.length > 0 && (
          <BlameGutter
            blocks={blocks}
            hoveredBlockIndex={hoveredBlockIndex}
            onAnnotationHover={handleGutterHover}
            onAnnotationLeave={handleGutterLeave}
          />
        )}
        <div style={styles.markdownWrapper}>
          <MarkdownView
            markdown={doc.raw_markdown}
            docPath={doc.doc_path}
            navigate={navigate}
            blameBlocks={blocks}
            uncommittedLines={uncommittedLines}
            onBlockHover={handleBlockHover}
            onBlockLeave={handleBlockLeave}
          />
        </div>
      </div>

      {popover && (
        <LineBlamePopover
          block={popover.block}
          isUncommitted={popover.isUncommitted}
          anchorTop={popover.top}
          anchorLeft={popover.left}
          docPath={doc.doc_path}
          pinned={popover.pinned}
          onPin={handlePin}
          onDismiss={handleDismiss}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
        />
      )}
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  article: {
    maxWidth: "960px",
  },
  header: {
    marginBottom: "1rem",
    paddingBottom: "1rem",
    borderBottom: "1px solid #2d3748",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "0.5rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#f7fafc",
  },
  meta: {
    display: "flex",
    gap: "1rem",
    alignItems: "center",
  },
  path: {
    fontSize: "0.8rem",
    color: "#4a5568",
    fontFamily: "monospace",
  },
  commitCount: {
    fontSize: "0.8rem",
    color: "#718096",
  },
  contentRow: {
    display: "flex",
    gap: "0",
    alignItems: "flex-start",
  },
  markdownWrapper: {
    flex: 1,
    minWidth: 0,
    paddingLeft: "1rem",
  },
  loading: {
    color: "#718096",
    padding: "2rem",
  },
  error: {
    color: "#fc8181",
    padding: "1rem",
    background: "#2d1515",
    borderRadius: "6px",
    border: "1px solid #c53030",
  },
};
