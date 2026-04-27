import React from "react";
import { BlameBlock } from "../api";

export interface GutterEntry {
  /** The BlameBlock this annotation covers. */
  block: BlameBlock;
  /** The rendered block element this annotation is aligned to (may span multiple blocks). */
  blockIndex: number;
}

interface BlameGutterProps {
  /** All blame blocks for the document. */
  blocks: BlameBlock[];
  /** The index of the block currently highlighted (from hover). */
  hoveredBlockIndex: number | null;
  /** Called when the user hovers a gutter annotation. */
  onAnnotationHover: (blockIndex: number, event: React.MouseEvent) => void;
  /** Called when the user leaves a gutter annotation. */
  onAnnotationLeave: () => void;
}

/**
 * Groups consecutive blocks with the same commit into a single gutter annotation.
 * Returns an array of { block, firstBlockIndex, lastBlockIndex }.
 */
function groupConsecutiveBlocks(
  blocks: BlameBlock[],
): { block: BlameBlock; firstIndex: number; lastIndex: number }[] {
  if (blocks.length === 0) return [];

  const groups: { block: BlameBlock; firstIndex: number; lastIndex: number }[] = [];
  let groupStart = 0;

  for (let i = 1; i <= blocks.length; i++) {
    const prev = blocks[i - 1];
    const curr = blocks[i];
    const sameCommit = curr && curr.commit === prev.commit;
    if (!sameCommit) {
      groups.push({ block: prev, firstIndex: groupStart, lastIndex: i - 1 });
      groupStart = i;
    }
  }

  return groups;
}

/** Abbreviate commit hash to 7 chars. */
function abbrev(commit: string): string {
  return commit.slice(0, 7);
}

export default function BlameGutter({
  blocks,
  hoveredBlockIndex,
  onAnnotationHover,
  onAnnotationLeave,
}: BlameGutterProps) {
  if (blocks.length === 0) return null;

  const groups = groupConsecutiveBlocks(blocks);

  return (
    <div style={styles.gutter} aria-label="Blame gutter">
      {groups.map((group, gi) => {
        // Is any block in this group currently hovered?
        const isHighlighted =
          hoveredBlockIndex !== null &&
          hoveredBlockIndex >= group.firstIndex &&
          hoveredBlockIndex <= group.lastIndex;

        return (
          <div
            key={gi}
            style={{
              ...styles.annotation,
              ...(isHighlighted ? styles.annotationHighlighted : {}),
            }}
            onMouseEnter={(e) => onAnnotationHover(group.firstIndex, e)}
            onMouseLeave={onAnnotationLeave}
            title={`${group.block.commit}\n${group.block.author}\n${group.block.date}\n${group.block.summary}`}
          >
            <span style={styles.hash}>{abbrev(group.block.commit)}</span>
            <span style={styles.author}>{group.block.author.split(" ")[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  gutter: {
    display: "flex",
    flexDirection: "column",
    minWidth: "140px",
    maxWidth: "160px",
    flexShrink: 0,
    background: "#1a1f2e",
    borderRight: "1px solid #2d3748",
    paddingRight: "0.5rem",
    userSelect: "none",
    fontSize: "0.72rem",
    fontFamily: "monospace",
    color: "#4a5568",
    overflowX: "hidden",
  },
  annotation: {
    display: "flex",
    flexDirection: "column",
    padding: "0.25rem 0.5rem",
    cursor: "pointer",
    borderRadius: "2px",
    transition: "background 0.1s",
    lineHeight: 1.4,
    minHeight: "2rem",
    justifyContent: "center",
  },
  annotationHighlighted: {
    background: "rgba(99,179,237,0.08)",
    color: "#e2e8f0",
  },
  hash: {
    color: "#63b3ed",
    fontWeight: 600,
  },
  author: {
    color: "#718096",
    fontSize: "0.68rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};
