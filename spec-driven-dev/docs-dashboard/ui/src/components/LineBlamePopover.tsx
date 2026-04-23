import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { BlameBlock, fetchDiff } from "../api";

interface LineBlamePopoverProps {
  /** The blame block for the currently hovered block. Null means uncommitted. */
  block: BlameBlock | null;
  /** True if the block's lines are uncommitted (working copy). */
  isUncommitted: boolean;
  /** Section-level lineage heading (used for uncommitted fallback label). */
  sectionHeading?: string | null;
  /** Position hint for the popover, anchored to the hovered block's bounding rect. */
  anchorTop: number;
  anchorLeft: number;
  /** Doc path (for fetching diffs). */
  docPath: string;
  /** Whether the popover is pinned (won't close on mouse leave). */
  pinned: boolean;
  /** Called when user clicks to pin. */
  onPin: () => void;
  /** Called when user dismisses (Esc or outside click). */
  onDismiss: () => void;
  /**
   * Called when the mouse enters the popover. The parent uses this to maintain
   * the block's highlighted state (hover bridge — moving block → popover must
   * not dismiss).
   */
  onMouseEnter?: () => void;
  /**
   * Called when the mouse leaves the popover entirely. The parent uses this to
   * clear the highlighted state when the cursor moves to empty space.
   */
  onMouseLeave?: () => void;
}

interface DiffState {
  loading: boolean;
  diff: string | null;
}

function statusBadgeStyle(status: string | null): React.CSSProperties {
  if (!status) return {};
  if (status === "implemented") return { background: "#1a365d", color: "#90cdf4" };
  if (status === "accepted") return { background: "#1c4532", color: "#9ae6b4" };
  if (status === "draft") return { border: "1px dashed #ed8936", color: "#ed8936" };
  if (status === "superseded" || status === "withdrawn") return { opacity: 0.6, color: "#718096" };
  return {};
}

function adrNumber(docPath: string): string | null {
  const base = docPath.split("/").pop() ?? "";
  const m = base.match(/^adr-(\d{4})/);
  return m ? m[1] : null;
}

export default function LineBlamePopover({
  block,
  isUncommitted,
  sectionHeading,
  anchorTop,
  anchorLeft,
  docPath,
  pinned,
  onPin,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}: LineBlamePopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Per-ADR diff expansion state: key = doc_path
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, DiffState>>({});

  // Dismiss on Esc or outside click
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    function handleOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onDismiss();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [onDismiss]);

  const toggleDiff = useCallback(
    async (adrDocPath: string) => {
      if (!block) return;
      const existing = expandedDiffs[adrDocPath];
      if (existing) {
        // Collapse
        setExpandedDiffs((prev) => {
          const next = { ...prev };
          delete next[adrDocPath];
          return next;
        });
        return;
      }
      // Expand: fetch diff
      setExpandedDiffs((prev) => ({
        ...prev,
        [adrDocPath]: { loading: true, diff: null },
      }));
      try {
        const result = await fetchDiff(
          docPath,
          block.commit,
          block.line_start,
          block.line_end
        );
        setExpandedDiffs((prev) => ({
          ...prev,
          [adrDocPath]: { loading: false, diff: result.diff },
        }));
      } catch {
        setExpandedDiffs((prev) => ({
          ...prev,
          [adrDocPath]: { loading: false, diff: "(failed to load diff)" },
        }));
      }
    },
    [block, docPath, expandedDiffs]
  );

  const popoverStyle: React.CSSProperties = {
    ...styles.popover,
    top: anchorTop,
    left: anchorLeft,
  };

  return (
    <div
      ref={containerRef}
      style={popoverStyle}
      role="dialog"
      aria-label="Line blame"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={styles.header}>
        {isUncommitted ? (
          <span style={styles.headerTitle}>
            Working copy
            {sectionHeading ? ` — ${sectionHeading}` : ""}
          </span>
        ) : block ? (
          <span style={styles.headerTitle}>Blame: lines {block.line_start}–{block.line_end}</span>
        ) : null}
        <button style={styles.pinBtn} onClick={onPin} title={pinned ? "Unpin" : "Pin"}>
          {pinned ? "pinned" : "pin"}
        </button>
      </div>

      {isUncommitted && (
        <div style={styles.uncommittedNote}>
          (working copy) — section-level lineage shown
        </div>
      )}

      {block && !isUncommitted && (
        <>
          {/* ADR entries */}
          {block.adrs.length === 0 ? (
            <div style={styles.emptyNote}>No co-committed ADRs found.</div>
          ) : (
            block.adrs.map((adr, i) => {
              const num = adrNumber(adr.doc_path);
              const label = num
                ? `ADR-${num}${adr.title ? `: ${adr.title}` : ""}`
                : adr.doc_path;
              const diffState = expandedDiffs[adr.doc_path];
              const isExpanded = !!diffState;

              return (
                <div key={i} style={styles.adrEntry}>
                  <div style={styles.adrRow}>
                    <span style={styles.adrLabel}>{label}</span>
                    {adr.status && (
                      <span
                        style={{ ...styles.statusBadge, ...statusBadgeStyle(adr.status) }}
                      >
                        {adr.status}
                      </span>
                    )}
                    <button
                      style={styles.expandBtn}
                      onClick={() => toggleDiff(adr.doc_path)}
                      title={isExpanded ? "Collapse diff" : "Expand diff"}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  </div>
                  {isExpanded && (
                    <div style={styles.diffContainer}>
                      {diffState.loading ? (
                        <div style={styles.diffLoading}>Loading diff…</div>
                      ) : diffState.diff ? (
                        <pre style={styles.diffPre}>{diffState.diff}</pre>
                      ) : (
                        <div style={styles.diffLoading}>No diff available.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Commit secondary info */}
          <div style={styles.commitInfo}>
            <div style={styles.commitHash}>{block.commit.slice(0, 7)}</div>
            <div style={styles.commitMeta}>
              {block.author} · {block.date}
            </div>
            <div style={styles.commitSummary}>{block.summary}</div>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  popover: {
    position: "fixed",
    zIndex: 2000,
    background: "#1a1f2e",
    border: "1px solid #4a5568",
    borderRadius: "8px",
    padding: "0.5rem 0",
    minWidth: "320px",
    maxWidth: "480px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.25rem 0.75rem 0.5rem",
    borderBottom: "1px solid #2d3748",
    marginBottom: "0.25rem",
  },
  headerTitle: {
    fontSize: "0.75rem",
    color: "#718096",
  },
  pinBtn: {
    background: "#2d3748",
    border: "none",
    borderRadius: "3px",
    color: "#a0aec0",
    cursor: "pointer",
    fontSize: "0.65rem",
    padding: "0.1em 0.5em",
  },
  uncommittedNote: {
    padding: "0.4rem 0.75rem",
    fontSize: "0.78rem",
    color: "#a0aec0",
    fontStyle: "italic",
  },
  emptyNote: {
    padding: "0.4rem 0.75rem",
    fontSize: "0.8rem",
    color: "#4a5568",
  },
  adrEntry: {
    borderBottom: "1px solid #2d3748",
  },
  adrRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.35rem 0.75rem",
  },
  adrLabel: {
    fontSize: "0.82rem",
    color: "#e2e8f0",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statusBadge: {
    fontSize: "0.65rem",
    padding: "0.1em 0.4em",
    borderRadius: "3px",
    flexShrink: 0,
  },
  expandBtn: {
    background: "transparent",
    border: "none",
    color: "#63b3ed",
    cursor: "pointer",
    fontSize: "0.7rem",
    padding: "0.1em 0.3em",
    flexShrink: 0,
  },
  diffContainer: {
    background: "#0d1117",
    margin: "0 0.5rem 0.5rem",
    borderRadius: "4px",
    maxHeight: "200px",
    overflowY: "auto",
  },
  diffPre: {
    fontSize: "0.72rem",
    fontFamily: "monospace",
    color: "#e2e8f0",
    padding: "0.5rem",
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  diffLoading: {
    padding: "0.5rem",
    fontSize: "0.75rem",
    color: "#718096",
  },
  commitInfo: {
    padding: "0.4rem 0.75rem",
    borderTop: "1px solid #2d3748",
    marginTop: "0.25rem",
  },
  commitHash: {
    fontFamily: "monospace",
    fontSize: "0.75rem",
    color: "#63b3ed",
  },
  commitMeta: {
    fontSize: "0.75rem",
    color: "#718096",
    marginTop: "0.1rem",
  },
  commitSummary: {
    fontSize: "0.78rem",
    color: "#a0aec0",
    marginTop: "0.2rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};
