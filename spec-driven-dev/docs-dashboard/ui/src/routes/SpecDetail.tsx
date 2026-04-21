import React, { useEffect, useState } from "react";
import { fetchDoc, DocResponse } from "../api";
import MarkdownView from "../components/MarkdownView";
import type { SSEEvent } from "../App";

interface SpecDetailProps {
  docPath: string;
  navigate: (href: string) => void;
  lastEvent: SSEEvent | null;
}

export default function SpecDetail({ docPath, navigate, lastEvent }: SpecDetailProps) {
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

  useEffect(() => {
    load();
  }, [docPath]);

  // Refetch if this doc was reindexed
  useEffect(() => {
    if (lastEvent?.type === "reindex" && lastEvent.changed.includes(docPath)) {
      load();
    }
  }, [lastEvent]);

  if (loading) return <div style={styles.loading}>Loading…</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!doc) return null;

  return (
    <article style={styles.article}>
      <header style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>{doc.title ?? docPath}</h1>
          <span style={styles.categoryBadge}>spec</span>
        </div>
        <div style={styles.meta}>
          <span style={styles.path}>{doc.doc_path}</span>
          {doc.commit_count > 0 && (
            <span style={styles.commitCount}>{doc.commit_count} commits</span>
          )}
        </div>
      </header>
      <MarkdownView
        markdown={doc.raw_markdown}
        docPath={doc.doc_path}
        navigate={navigate}
      />
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  article: {
    maxWidth: "860px",
  },
  header: {
    marginBottom: "2rem",
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
  categoryBadge: {
    display: "inline-block",
    padding: "0.2em 0.6em",
    borderRadius: "4px",
    fontSize: "0.8em",
    fontWeight: 600,
    background: "#1a365d",
    color: "#90cdf4",
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
