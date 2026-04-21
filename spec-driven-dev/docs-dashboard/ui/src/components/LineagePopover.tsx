import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { fetchLineage, LineageResult } from "../api";

interface LineagePopoverProps {
  docPath: string;
  heading: string;
  navigate: (href: string) => void;
}

function docPathToHash(docPath: string): string {
  // docs/adr-*.md → #/adr/<slug>
  const adrMatch = docPath.match(/(?:^|.*\/)adr-(.+)\.md$/);
  if (adrMatch) return `/adr/${adrMatch[1]}`;

  // docs/**/spec-*.md → #/spec/<path>
  const specMatch = docPath.match(/spec-.+\.md$/);
  if (specMatch) return `/spec/${docPath}`;

  return `/spec/${docPath}`;
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
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [results, setResults] = useState<LineageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  const load = useCallback(async () => {
    if (results.length > 0 || loading) return;
    setLoading(true);
    try {
      const data = await fetchLineage(docPath, heading);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [docPath, heading, results.length, loading]);

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

  return (
    <span ref={containerRef} style={styles.wrapper}>
      <button
        style={styles.trigger}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        title="View lineage for this section"
        aria-label={`Lineage for ${heading}`}
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
            Lineage: {heading}
            {pinned && <span style={styles.pinnedBadge}>pinned</span>}
          </div>
          {loading && <div style={styles.loadingText}>Loading…</div>}
          {!loading && results.length === 0 && (
            <div style={styles.emptyText}>No co-committed sections found.</div>
          )}
          {!loading &&
            results.map((r, i) => (
              <button
                key={i}
                style={{ ...styles.resultRow, ...statusStyle(r.status) }}
                onClick={() => {
                  const hash = docPathToHash(r.doc_path);
                  navigate(`${hash}#${encodeURIComponent(r.heading)}`);
                  setPinned(false);
                  setOpen(false);
                }}
              >
                <span style={styles.count}>{r.commit_count}×</span>
                <span style={styles.path}>{r.doc_path}</span>
                <span style={styles.sectionLabel}>§{r.heading}</span>
              </button>
            ))}
          <button
            style={styles.graphLink}
            onClick={() => {
              navigate(
                `/graph?focus=${encodeURIComponent(docPath)}&section=${encodeURIComponent(heading)}`
              );
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
  sectionLabel: {
    color: "#68d391",
    flexShrink: 0,
    fontSize: "0.75rem",
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
