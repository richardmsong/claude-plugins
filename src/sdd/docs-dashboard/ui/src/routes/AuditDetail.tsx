import React, { useEffect, useState } from "react";
import { fetchDoc, DocResponse } from "../api";
import MarkdownView from "../components/MarkdownView";
import type { SSEEvent } from "../App";

interface AuditDetailProps {
  docPath: string;
  navigate: (href: string) => void;
  lastEvent: SSEEvent | null;
}

/**
 * Renders an audit report markdown document (ADR-0074).
 *
 * No blame gutter or lineage popovers — audit docs are ephemeral reports,
 * not versioned specs. Only MarkdownView is used.
 */
export default function AuditDetail({ docPath, navigate, lastEvent }: AuditDetailProps) {
  const [doc, setDoc] = useState<DocResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDoc(docPath);
      setDoc(data);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 404) {
        setError(`Audit report not found: ${docPath}`);
      } else {
        setError(`Failed to load audit report: ${e.message ?? String(err)}`);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [docPath]);

  // Refetch when the doc is updated
  useEffect(() => {
    if (lastEvent?.type === "reindex") {
      if (lastEvent.changed.includes(docPath)) {
        load();
      }
    }
  }, [lastEvent]);

  if (loading) {
    return <div style={styles.loading}>Loading…</div>;
  }

  if (error || !doc) {
    return (
      <div style={styles.error}>
        <p>{error ?? "Unknown error"}</p>
        <button onClick={() => navigate("/")} style={styles.backBtn}>
          ← Back to index
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={() => navigate("/")} style={styles.backBtn}>
          ← Back
        </button>
        <h1 style={styles.title}>{doc.title ?? docPath}</h1>
      </div>
      <MarkdownView
        markdown={doc.raw_markdown}
        docPath={docPath}
        navigate={navigate}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "900px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: "1rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap",
  },
  title: {
    fontSize: "1.4rem",
    fontWeight: 700,
    color: "#e2e8f0",
    margin: 0,
    flex: 1,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #2d3748",
    color: "#63b3ed",
    cursor: "pointer",
    fontSize: "0.85rem",
    padding: "0.3rem 0.6rem",
    borderRadius: "4px",
    flexShrink: 0,
  },
  loading: {
    color: "#718096",
    padding: "2rem",
    textAlign: "center",
  },
  error: {
    color: "#fc8181",
    padding: "2rem",
    textAlign: "center",
  },
};
