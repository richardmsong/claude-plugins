import React, { useEffect, useState } from "react";
import { fetchSearch, SearchResult } from "../api";

interface SearchResultsProps {
  query: string;
  navigate: (href: string) => void;
}

function docPathToHash(docPath: string, heading?: string): string {
  const adrMatch = docPath.match(/(?:^|.*\/)adr-(.+)\.md$/);
  const hash = adrMatch ? `/adr/${adrMatch[1]}` : `/spec/${docPath}`;
  if (heading) return `${hash}#${encodeURIComponent(heading)}`;
  return hash;
}

// Render FTS5 snippets: [text] → highlighted
function renderSnippet(snippet: string): React.ReactNode {
  const parts = snippet.split(/(\[[^\]]+\])/);
  return parts.map((part, i) => {
    if (part.startsWith("[") && part.endsWith("]")) {
      return (
        <mark key={i} style={{ background: "#744210", color: "#fbd38d", borderRadius: "2px" }}>
          {part.slice(1, -1)}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function SearchResults({ query, navigate }: SearchResultsProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    fetchSearch(query, { limit: 20 })
      .then((data) => {
        setResults(data);
      })
      .catch((err: unknown) => {
        const e = err as { body?: { error?: string } };
        setError(e.body?.error ?? String(err));
        setResults([]);
      })
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>
        Search: <em style={{ fontWeight: 400 }}>{query}</em>
      </h2>
      {error && (
        <div style={styles.error}>Search error: {error}</div>
      )}
      {loading && <div style={styles.loading}>Searching…</div>}
      {!loading && !error && results.length === 0 && query && (
        <div style={styles.empty}>No results for "{query}"</div>
      )}
      <ul style={styles.list}>
        {results.map((r, i) => (
          <li key={i} style={styles.item}>
            <button
              style={styles.itemButton}
              onClick={() => navigate(docPathToHash(r.doc_path, r.heading))}
            >
              <div style={styles.itemHeader}>
                <span style={styles.docPath}>{r.doc_path}</span>
                <span style={styles.sectionHeading}>§ {r.heading}</span>
              </div>
              <div style={styles.snippet}>{renderSnippet(r.snippet)}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "860px",
  },
  heading: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "#a0aec0",
    marginBottom: "1.5rem",
  },
  error: {
    color: "#fc8181",
    padding: "0.75rem",
    background: "#2d1515",
    borderRadius: "6px",
    marginBottom: "1rem",
  },
  loading: {
    color: "#718096",
    padding: "1rem 0",
  },
  empty: {
    color: "#4a5568",
    padding: "1rem 0",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  item: {},
  itemButton: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "#1a1f2e",
    border: "1px solid #2d3748",
    borderRadius: "6px",
    padding: "0.75rem 1rem",
    cursor: "pointer",
    color: "#e2e8f0",
  },
  itemHeader: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    marginBottom: "0.5rem",
  },
  docPath: {
    fontSize: "0.8rem",
    color: "#63b3ed",
    fontFamily: "monospace",
  },
  sectionHeading: {
    fontSize: "0.85rem",
    color: "#68d391",
    fontWeight: 600,
  },
  snippet: {
    fontSize: "0.85rem",
    color: "#a0aec0",
    lineHeight: 1.5,
  },
};
