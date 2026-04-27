import React, { useState } from "react";

export type BlameRangeMode = "all" | "since" | "branch";

export interface BlameRange {
  mode: BlameRangeMode;
  since?: string;   // ISO date string, used when mode === "since"
  ref?: string;     // branch name, used when mode === "branch"
}

interface BlameRangeFilterProps {
  value: BlameRange;
  onChange: (range: BlameRange) => void;
}

export default function BlameRangeFilter({ value, onChange }: BlameRangeFilterProps) {
  const [sinceInput, setSinceInput] = useState(value.since ?? "");
  const [refInput, setRefInput] = useState(value.ref ?? "");

  function handleModeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const mode = e.target.value as BlameRangeMode;
    if (mode === "all") {
      onChange({ mode: "all" });
    } else if (mode === "since") {
      onChange({ mode: "since", since: sinceInput || undefined });
    } else {
      onChange({ mode: "branch", ref: refInput || undefined });
    }
  }

  function handleSinceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSinceInput(val);
    onChange({ mode: "since", since: val || undefined });
  }

  function handleRefChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setRefInput(val);
    onChange({ mode: "branch", ref: val || undefined });
  }

  return (
    <div style={styles.container}>
      <label style={styles.label} htmlFor="blame-range-mode">
        Blame range:
      </label>
      <select
        id="blame-range-mode"
        style={styles.select}
        value={value.mode}
        onChange={handleModeChange}
      >
        <option value="all">All time</option>
        <option value="since">Since date</option>
        <option value="branch">Branch</option>
      </select>

      {value.mode === "since" && (
        <input
          type="date"
          style={styles.input}
          value={sinceInput}
          onChange={handleSinceChange}
          placeholder="YYYY-MM-DD"
          aria-label="Since date"
        />
      )}

      {value.mode === "branch" && (
        <input
          type="text"
          style={styles.input}
          value={refInput}
          onChange={handleRefChange}
          placeholder="branch name"
          aria-label="Branch name"
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "1rem",
    padding: "0.4rem 0.75rem",
    background: "#1a1f2e",
    border: "1px solid #2d3748",
    borderRadius: "6px",
    fontSize: "0.82rem",
    color: "#e2e8f0",
  },
  label: {
    color: "#718096",
    flexShrink: 0,
  },
  select: {
    background: "#0d1117",
    border: "1px solid #2d3748",
    borderRadius: "4px",
    color: "#e2e8f0",
    padding: "0.2rem 0.4rem",
    fontSize: "0.82rem",
    cursor: "pointer",
  },
  input: {
    background: "#0d1117",
    border: "1px solid #2d3748",
    borderRadius: "4px",
    color: "#e2e8f0",
    padding: "0.2rem 0.4rem",
    fontSize: "0.82rem",
    width: "160px",
  },
};
