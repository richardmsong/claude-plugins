import React, { useState, useRef, useCallback } from "react";

interface SearchBarProps {
  navigate: (href: string) => void;
  initialQuery?: string;
}

const DEBOUNCE_MS = 150;

export default function SearchBar({ navigate, initialQuery = "" }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setQuery(q);

      if (timerRef.current) clearTimeout(timerRef.current);
      if (!q.trim()) return;

      timerRef.current = setTimeout(() => {
        navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }, DEBOUNCE_MS);
    },
    [navigate]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && query.trim()) {
        if (timerRef.current) clearTimeout(timerRef.current);
        navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    },
    [navigate, query]
  );

  return (
    <input
      type="search"
      placeholder="Search docs… (FTS5)"
      value={query}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      style={styles.input}
      aria-label="Search documentation"
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  input: {
    padding: "0.4rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid #4a5568",
    background: "#2d3748",
    color: "#e2e8f0",
    fontSize: "0.875rem",
    width: "280px",
    outline: "none",
  },
};
