import React, { useEffect, useState } from "react";
import { fetchAdrs, fetchSpecs, ListDoc } from "../api";
import StatusBadge from "../components/StatusBadge";
import type { SSEEvent } from "../App";

interface LandingProps {
  navigate: (href: string) => void;
  lastEvent: SSEEvent | null;
}

type AdrStatus =
  | "draft"
  | "accepted"
  | "implemented"
  | "superseded"
  | "withdrawn"
  | "unspecified";

const STATUS_ORDER: AdrStatus[] = [
  "draft",
  "accepted",
  "implemented",
  "superseded",
  "withdrawn",
  "unspecified",
];

// By default, only drafts are expanded
const DEFAULT_EXPANDED: Record<string, boolean> = { draft: true };

function adrSlug(docPath: string): string {
  return docPath.replace(/^docs\//, "").replace(/\.md$/, "").replace(/^adr-/, "");
}

function groupByDirectory(specs: ListDoc[]): Record<string, ListDoc[]> {
  const groups: Record<string, ListDoc[]> = {};
  for (const spec of specs) {
    const parts = spec.doc_path.split("/");
    // e.g. "docs/spec-foo.md" → dir = "docs/"
    // e.g. "docs/mclaude-docs-mcp/spec-foo.md" → dir = "docs/mclaude-docs-mcp/"
    const dir =
      parts.length > 2
        ? parts.slice(0, parts.length - 1).join("/") + "/"
        : "docs/";
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(spec);
  }
  return groups;
}

export default function Landing({ navigate, lastEvent }: LandingProps) {
  const [adrs, setAdrs] = useState<ListDoc[]>([]);
  const [specs, setSpecs] = useState<ListDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(DEFAULT_EXPANDED);

  async function load() {
    try {
      const [adrData, specData] = await Promise.all([fetchAdrs(), fetchSpecs()]);
      setAdrs(adrData);
      setSpecs(specData);
    } catch (err) {
      console.error("Landing: load failed", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Refetch on reindex
  useEffect(() => {
    if (lastEvent?.type === "reindex") {
      load();
    }
  }, [lastEvent]);

  // Bucket ADRs by status
  const buckets: Record<AdrStatus, ListDoc[]> = {
    draft: [],
    accepted: [],
    implemented: [],
    superseded: [],
    withdrawn: [],
    unspecified: [],
  };

  for (const adr of adrs) {
    const s = (adr.status as AdrStatus) ?? "unspecified";
    const key: AdrStatus = STATUS_ORDER.includes(s) ? s : "unspecified";
    buckets[key].push(adr);
  }

  // Sort each bucket by last_status_change desc (most recent first)
  for (const status of STATUS_ORDER) {
    buckets[status].sort((a, b) => {
      const da = a.last_status_change ?? "0000-00-00";
      const db = b.last_status_change ?? "0000-00-00";
      return db.localeCompare(da);
    });
  }

  const specGroups = groupByDirectory(specs);

  if (loading) {
    return <div style={styles.loading}>Loading…</div>;
  }

  return (
    <div style={styles.layout}>
      {/* Left: ADRs by status */}
      <section style={styles.leftCol}>
        <h2 style={styles.sectionTitle}>ADRs</h2>
        {STATUS_ORDER.map((status) => {
          const bucket = buckets[status];
          if (bucket.length === 0) return null;
          const isExpanded = expanded[status] ?? false;

          return (
            <div key={status} style={styles.bucket}>
              <button
                style={styles.bucketHeader}
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [status]: !isExpanded }))
                }
                aria-expanded={isExpanded}
              >
                <StatusBadge status={status === "unspecified" ? null : status} />
                <span style={styles.bucketLabel}>
                  {status === "unspecified" ? "Unspecified" : ""}
                </span>
                <span style={styles.bucketCount}>{bucket.length}</span>
                <span style={styles.chevron}>{isExpanded ? "▾" : "▸"}</span>
              </button>
              {isExpanded && (
                <ul style={styles.bucketList}>
                  {bucket.map((adr) => (
                    <li key={adr.doc_path} style={styles.bucketItem}>
                      <button
                        style={styles.docLink}
                        onClick={() => navigate(`/adr/${adrSlug(adr.doc_path)}`)}
                      >
                        <span style={styles.docTitle}>
                          {adr.title ?? adrSlug(adr.doc_path)}
                        </span>
                        <span style={styles.docMeta}>
                          {adr.last_status_change ?? ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {/* Right: Specs by directory */}
      <section style={styles.rightCol}>
        <h2 style={styles.sectionTitle}>Specs</h2>
        {Object.entries(specGroups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dir, dirSpecs]) => {
            const isExpanded = expanded[`specs:${dir}`] ?? true;
            return (
              <div key={dir} style={styles.bucket}>
                <button
                  style={styles.bucketHeader}
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [`specs:${dir}`]: !isExpanded,
                    }))
                  }
                  aria-expanded={isExpanded}
                >
                  <span style={styles.dirLabel}>{dir}</span>
                  <span style={styles.bucketCount}>{dirSpecs.length}</span>
                  <span style={styles.chevron}>{isExpanded ? "▾" : "▸"}</span>
                </button>
                {isExpanded && (
                  <ul style={styles.bucketList}>
                    {dirSpecs.map((spec) => (
                      <li key={spec.doc_path} style={styles.bucketItem}>
                        <button
                          style={styles.docLink}
                          onClick={() => navigate(`/spec/${spec.doc_path}`)}
                        >
                          <span style={styles.docTitle}>
                            {spec.title ?? spec.doc_path}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "2rem",
    alignItems: "start",
  },
  leftCol: {},
  rightCol: {},
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#a0aec0",
    marginBottom: "1rem",
    paddingBottom: "0.5rem",
    borderBottom: "1px solid #2d3748",
  },
  bucket: {
    marginBottom: "0.5rem",
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid #2d3748",
  },
  bucketHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    background: "#1a1f2e",
    border: "none",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    color: "#e2e8f0",
  },
  bucketLabel: {
    fontSize: "0.85rem",
    color: "#a0aec0",
    flex: 1,
  },
  bucketCount: {
    fontSize: "0.75rem",
    color: "#718096",
    background: "#2d3748",
    padding: "0.1em 0.4em",
    borderRadius: "10px",
  },
  chevron: {
    color: "#4a5568",
    fontSize: "0.75rem",
  },
  bucketList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    background: "#111827",
  },
  bucketItem: {
    borderTop: "1px solid #1a1f2e",
  },
  docLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.4rem 0.75rem",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#e2e8f0",
    width: "100%",
    textAlign: "left",
  },
  docTitle: {
    fontSize: "0.85rem",
    color: "#cbd5e0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  docMeta: {
    fontSize: "0.75rem",
    color: "#4a5568",
    flexShrink: 0,
    marginLeft: "0.5rem",
  },
  dirLabel: {
    fontSize: "0.8rem",
    color: "#63b3ed",
    fontFamily: "monospace",
    flex: 1,
  },
  loading: {
    color: "#718096",
    padding: "2rem",
    textAlign: "center",
  },
};
