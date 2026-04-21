export interface ParsedSection {
  heading: string;
  content: string;
  lineStart: number; // 1-based, the ## line itself
  lineEnd: number;   // 1-based, inclusive
}

export type AdrStatus = "draft" | "accepted" | "implemented" | "superseded" | "withdrawn";

export interface ParsedDoc {
  title: string | null;
  status: AdrStatus | null;
  lastStatusChange: string | null;
  sections: ParsedSection[];
}

/**
 * Parse a markdown file into H2 sections.
 *
 * - H1 (first `# ` line) becomes the document title.
 * - Preamble before the first `## ` (including H1) is NOT a section.
 * - Each `## ` line starts a new section. The section runs to the line
 *   before the next `## ` or EOF.
 * - Sub-headings (###, ####) are included in the parent section's content.
 */
const STATUS_RE = /^\*\*Status\*\*:\s*(draft|accepted|implemented|superseded|withdrawn)\s*$/i;
const STATUS_HISTORY_MARKER_RE = /^\*\*Status history\*\*:\s*$/i;
const HISTORY_LINE_RE = /^\s*-\s*(\d{4}-\d{2}-\d{2}):/;

export function parseMarkdown(content: string): ParsedDoc {
  const lines = content.split("\n");
  let title: string | null = null;
  let status: AdrStatus | null = null;
  let lastStatusChange: string | null = null;
  const sections: ParsedSection[] = [];

  let currentHeading: string | null = null;
  let currentStart = 0;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-based

    // H1 title extraction (first # heading, not ##)
    if (title === null && /^# /.test(line)) {
      title = line.replace(/^# /, "").trim();
      continue;
    }

    // Status extraction — scan only first 20 lines to avoid false positives in body
    if (status === null && lineNum <= 20) {
      const m = STATUS_RE.exec(line);
      if (m) {
        status = m[1].toLowerCase() as AdrStatus;
      }
    }

    // Status history extraction — find the bold marker, then collect dates from bullets
    if (lastStatusChange === null && STATUS_HISTORY_MARKER_RE.test(line)) {
      const dates: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const histLine = lines[j];
        const hm = HISTORY_LINE_RE.exec(histLine);
        if (hm) {
          dates.push(hm[1]);
          j++;
        } else {
          break;
        }
      }
      if (dates.length > 0) {
        // Lexicographic max = most recent ISO date
        lastStatusChange = dates.reduce((a, b) => (a > b ? a : b));
      }
    }

    // H2 section boundary
    if (/^## /.test(line)) {
      // Flush previous section
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join("\n").trimEnd(),
          lineStart: currentStart,
          lineEnd: lineNum - 1,
        });
      }

      currentHeading = line.replace(/^## /, "").trim();
      currentStart = lineNum;
      currentLines = [line];
    } else if (currentHeading !== null) {
      currentLines.push(line);
    }
  }

  // Flush last section
  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join("\n").trimEnd(),
      lineStart: currentStart,
      lineEnd: lines.length,
    });
  }

  return { title, status, lastStatusChange, sections };
}

/**
 * Classify a document category from its filename (basename).
 *
 * adr-*          → 'adr'
 * spec-*         → 'spec'
 * feature-list*  → 'spec'
 * everything else → null
 */
export function classifyCategory(filename: string): "adr" | "spec" | null {
  // Strip directory components
  const base = filename.split("/").pop() ?? filename;
  if (/^adr-/.test(base)) return "adr";
  if (/^(spec-|feature-list)/.test(base)) return "spec";
  return null;
}
