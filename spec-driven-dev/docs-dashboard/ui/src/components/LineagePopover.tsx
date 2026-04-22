import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { fetchLineage, LineageResult } from "../api";

interface LineagePopoverProps {
  docPath: string;
  /** Section mode: non-empty string. Doc mode: null or undefined. */
  heading?: string | null;
  navigate: (href: string) => void;
}

/** Row after section-mode collapse or doc-mode pass-through. */
interface CollapsedRow {
  doc_path: string;
  commit_count: number;
  last_commit: string;
  status: string | null;
  category: string | null;
  doc_title: string | null;
}

function docPathToHash(docPath: string): string {
  const base = docPath.split("/").pop() ?? "";
  if (base.startsWith("adr-")) return `/adr/${docPath.replace(/\.md$/, "")}`;
  return `/spec/${docPath}`;
}

/**
 * Collapse section-granular LineageResult[] by doc_path.
 * - count = SUM(commit_count)
 * - last_commit taken from row with highest commit_count (ties: first row in response)
 * - status taken from row with highest commit_count (ties: first row)
 * - sorted descending by collapsed commit_count
 */
function collapseByDoc(rows: LineageResult[]): CollapsedRow[] {
  const map = new Map<
    string,
    {
      commit_count: number;
      last_commit: string;
      status: string | null;
      category: string | null;
      doc_title: string | null;
      maxSingle: number;
      maxSingleFirst: number;
    }
  >();

  rows.forEach((r, idx) => {
    const existing = map.get(r.doc_path);
    if (!existing) {
      map.set(r.doc_path, {
        commit_count: r.commit_count,
        last_commit: r.last_commit,
        status: r.status,
        category: r.category,
        doc_title: r.doc_title,
        maxSingle: r.commit_count,
        maxSingleFirst: idx,
      });
    } else {
      existing.commit_count += r.commit_count;
      // Pick last_commit (and status) from the row with the highest single commit_count;
      // ties go to the row that appeared first in the response.
      if (
        r.commit_count > existing.maxSingle ||
        (r.commit_count === existing.maxSingle && idx < existing.maxSingleFirst)
      ) {
        existing.last_commit = r.last_commit;
        existing.status = r.status;
        existing.maxSingle = r.commit_count;
        existing.maxSingleFirst = idx;
      }
    }
  });

  return Array.from(map.entries())
    .map(([doc_path, v]) => ({
      doc_path,
      commit_count: v.commit_count,
      last_commit: v.last_commit,
      status: v.status,
      category: v.category,
      doc_title: v.doc_title,
    }))
    .sort((a, b) => b.commit_count - a.commit_count);
}

/**
 * Pass-through: server already collapsed in doc mode. Convert to CollapsedRow shape.
 */
function passThrough(rows: LineageResult[]): CollapsedRow[] {
  return rows.map((r) => ({
    doc_path: r.doc_path,
    commit_count: r.commit_count,
    last_commit: r.last_commit,
    status: r.status,
    category: r.category,
    doc_title: r.doc_title,
  }));
}

/** Extract zero-padded ADR number from a doc_path like "some/prefix/adr-0033-slug.md". */
function adrNumber(docPath: string): string | null {
  const basename = docPath.split("/").pop() ?? "";
  const match = basename.match(/^adr-(\d{4})/);
  return match ? match[1] : null;
}

/** Format the display label for a lineage row. ADRs get "ADR-NNNN: title" prefix. */
function rowLabel(row: CollapsedRow): string {
  if (row.category === "adr") {
    const num = adrNumber(row.doc_path);
    const title = row.doc_title ?? row.doc_path;
    return num ? `ADR-${num}: ${title}` : title;
  }
  return row.doc_path;
}

function statusStyle(status: string | null): React.CSSProperties {
  if (status === "superseded" || status === "withdrawn") {
    return { opacity: 0.5, color: "#718096" };
  }
  if (status === "draft") {
    return { border: "1px dashed #ed8936", borderRadius: "3px", padding: "0 2px" };
  }
  return {};
}

export default function LineagePopover({
  docPath,
  heading,
  navigate,
}: LineagePopoverProps) {
  const isDocMode = !heading; // heading is null, undefined, or ""
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [rawResults, setRawResults] = useState<LineageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  const displayRows: CollapsedRow[] = isDocMode
    ? passThrough(rawResults)
    : collapseByDoc(rawResults);

  const load = useCallback(async () => {
    if (rawResults.length > 0 || loading) return;
    setLoading(true);
    try {
      const data = await fetchLineage(docPath, heading ?? undefined);
      setRawResults(data);
    } catch {
      setRawResults([]);
    } finally {
      setLoading(false);
    }
  }, [docPath, heading, rawResults.length, loading]);

  const handleMouseEnter = useCallback(() => {
    setOpen(true);
    load();
  }, [load]);

  const handleMouseLeave = useCallback(() => {
    if (!pinned) setOpen(false);
  }, [pinned]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (pinned) {
        setPinned(false);
        setOpen(false);
      } else {
        setPinned(true);
        setOpen(true);
        load();
      }
    },
    [pinned, load]
  );

  // Dismiss on Esc or outside click
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    }

    function handleOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setPinned(false);
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  // Graph link target differs by mode
  const graphHref = isDocMode
    ? `/graph?focus=${encodeURIComponent(docPath)}`
    : `/graph?focus=${encodeURIComponent(docPath)}&section=${encodeURIComponent(heading ?? "")}`;

  const popoverTitle = isDocMode ? docPath : heading ?? "";

  return (
    <span ref={containerRef} style={styles.wrapper}>
      <button
        style={styles.trigger}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        title={isDocMode ? "View doc-level lineage" : "View lineage for this section"}
        aria-label={isDocMode ? `Doc lineage for ${docPath}` : `Lineage for ${heading ?? ""}`}
      >
        ≡
      </button>
      {open && (
        <div
          style={styles.popover}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={handleMouseLeave}
        >
          <div style={styles.popoverHeader}>
            Lineage: {popoverTitle}
            {pinned && <span style={styles.pinnedBadge}>pinned</span>}
          </div>
          {loading && <div style={styles.loadingText}>Loading…</div>}
          {!loading && displayRows.length === 0 && (
            <div style={styles.emptyText}>No co-committed sections found.</div>
          )}
          {!loading &&
            displayRows.map((r, i) => (
              <button
                key={i}
                style={{ ...styles.resultRow, ...statusStyle(r.status) }}
                onClick={() => {
                  const hash = docPathToHash(r.doc_path);
                  navigate(hash);
                  setPinned(false);
                  setOpen(false);
                }}
              >
                <span style={styles.count}>{r.commit_count}×</span>
                <span style={styles.path}>{rowLabel(r)}</span>
              </button>
            ))}
          <button
            style={styles.graphLink}
            onClick={() => {
              navigate(graphHref);
              setPinned(false);
              setOpen(false);
            }}
          >
            Open graph centered here
          </button>
        </div>
      )}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "inline-block",
    marginLeft: "0.5rem",
    verticalAlign: "middle",
  },
  trigger: {
    background: "transparent",
    border: "none",
    color: "#4a5568",
    cursor: "pointer",
    fontSize: "1rem",
    padding: "0 0.25rem",
    borderRadius: "3px",
    lineHeight: 1,
    transition: "color 0.15s",
  },
  popover: {
    position: "absolute",
    top: "1.5rem",
    left: 0,
    zIndex: 1000,
    background: "#1a1f2e",
    border: "1px solid #4a5568",
    borderRadius: "8px",
    padding: "0.5rem 0",
    minWidth: "360px",
    maxWidth: "480px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  },
  popoverHeader: {
    padding: "0.25rem 0.75rem 0.5rem",
    fontSize: "0.75rem",
    color: "#718096",
    borderBottom: "1px solid #2d3748",
    marginBottom: "0.25rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  pinnedBadge: {
    fontSize: "0.65rem",
    background: "#2d3748",
    padding: "0.1em 0.4em",
    borderRadius: "3px",
    color: "#a0aec0",
  },
  loadingText: {
    padding: "0.5rem 0.75rem",
    color: "#718096",
    fontSize: "0.875rem",
  },
  emptyText: {
    padding: "0.5rem 0.75rem",
    color: "#4a5568",
    fontSize: "0.875rem",
  },
  resultRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.375rem 0.75rem",
    background: "transparent",
    border: "none",
    color: "#e2e8f0",
    cursor: "pointer",
    fontSize: "0.8rem",
    width: "100%",
    textAlign: "left",
    transition: "background 0.1s",
  },
  count: {
    color: "#63b3ed",
    fontWeight: 700,
    flexShrink: 0,
    fontSize: "0.75rem",
  },
  path: {
    color: "#a0aec0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  graphLink: {
    display: "block",
    padding: "0.375rem 0.75rem",
    background: "transparent",
    border: "none",
    borderTop: "1px solid #2d3748",
    color: "#63b3ed",
    cursor: "pointer",
    fontSize: "0.8rem",
    width: "100%",
    textAlign: "left",
    marginTop: "0.25rem",
  },
};
