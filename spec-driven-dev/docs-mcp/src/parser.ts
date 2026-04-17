export interface ParsedSection {
  heading: string;
  content: string;
  lineStart: number; // 1-based, the ## line itself
  lineEnd: number;   // 1-based, inclusive
}

export interface ParsedDoc {
  title: string | null;
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
export function parseMarkdown(content: string): ParsedDoc {
  const lines = content.split("\n");
  let title: string | null = null;
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

  return { title, sections };
}

/**
 * Classify a document category from its filename (basename).
 */
export function classifyCategory(filename: string): "design" | "spec" | null {
  // Strip directory components
  const base = filename.split("/").pop() ?? filename;
  if (/^(plan-|design-)/.test(base)) return "design";
  if (/^(spec-|schema-|ui-spec|feature-list)/.test(base)) return "spec";
  return null;
}
