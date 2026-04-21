import React, { useEffect, useState, useRef, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { fetchGraph, GraphResponse, GraphNode } from "../api";

interface GraphProps {
  focus?: string;
  section?: string;
  navigate: (href: string) => void;
}

interface ForceNode extends GraphNode {
  id: string;
  x?: number;
  y?: number;
}

interface ForceLink {
  source: string;
  target: string;
  count: number;
}

interface ForceData {
  nodes: ForceNode[];
  links: ForceLink[];
}

// Node fill colors by category
const CATEGORY_COLORS = {
  adr: "#3182ce",    // blue
  spec: "#38a169",   // green
  null: "#718096",   // grey for unknown
};

// Status encodings (border/fill tone)
function getNodeColor(node: ForceNode): string {
  const base = CATEGORY_COLORS[node.category as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.null;
  if (node.category !== "adr") return base;
  if (node.status === "superseded") return base + "66"; // translucent
  if (node.status === "withdrawn") return "#4a5568";
  return base;
}

function getNodeRadius(node: ForceNode): number {
  return 4 + Math.sqrt(Math.max(0, node.commit_count)) * 2;
}

function docPathToHash(docPath: string): string {
  const adrMatch = docPath.match(/(?:^|.*\/)adr-(.+)\.md$/);
  if (adrMatch) return `/adr/${adrMatch[1]}`;
  return `/spec/${docPath}`;
}

export default function Graph({ focus, section: _section, navigate }: GraphProps) {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdrAdr, setShowAdrAdr] = useState(false);
  const [showSpecSpec, setShowSpecSpec] = useState(false);
  const graphRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchGraph(focus)
      .then(setData)
      .catch((err: unknown) => {
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, [focus]);

  const categoryMap = useCallback(
    (path: string) => {
      if (!data) return null;
      const node = data.nodes.find((n) => n.path === path);
      return node?.category ?? null;
    },
    [data]
  );

  // Filter edges based on sidebar toggles (global mode only)
  const filteredEdges = useCallback((): ForceLink[] => {
    if (!data) return [];
    if (focus) {
      // Local mode: show all edges
      return data.edges.map((e) => ({ source: e.from, target: e.to, count: e.count }));
    }
    // Global mode: filter by category
    return data.edges
      .filter((e) => {
        const catA = categoryMap(e.from);
        const catB = categoryMap(e.to);
        if (catA === "adr" && catB === "spec") return true;
        if (catA === "spec" && catB === "adr") return true;
        if (catA === "adr" && catB === "adr") return showAdrAdr;
        if (catA === "spec" && catB === "spec") return showSpecSpec;
        return false;
      })
      .map((e) => ({ source: e.from, target: e.to, count: e.count }));
  }, [data, focus, showAdrAdr, showSpecSpec, categoryMap]);

  const forceData: ForceData = {
    nodes: (data?.nodes ?? []).map((n) => ({ ...n, id: n.path })),
    links: filteredEdges(),
  };

  const maxEdgeCount = Math.max(1, ...forceData.links.map((l) => l.count));

  const handleNodeClick = useCallback(
    (node: ForceNode) => {
      navigate(docPathToHash(node.path));
    },
    [navigate]
  );

  if (loading) return <div style={styles.loading}>Loading graph…</div>;
  if (error) return <div style={styles.error}>Error: {error}</div>;
  if (!data) return null;

  const isLocal = !!focus;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>
          {isLocal ? `1-hop neighborhood: ${focus}` : "Global dependency graph"}
        </h2>
        {isLocal && (
          <a href="#/graph" style={styles.globalLink}>
            View global graph
          </a>
        )}
      </div>

      <div style={styles.layout}>
        <div ref={graphRef} style={styles.canvas}>
          <ForceGraph2D
            graphData={forceData}
            width={900}
            height={600}
            backgroundColor="#0f1117"
            nodeId="id"
            nodeLabel={(node) => {
              const n = node as ForceNode;
              return `${n.title ?? n.path}\n${n.status ?? ""} (${n.commit_count} commits)`;
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as ForceNode;
              const radius = getNodeRadius(n);
              const x = n.x ?? 0;
              const y = n.y ?? 0;

              ctx.beginPath();
              ctx.arc(x, y, radius, 0, 2 * Math.PI);
              ctx.fillStyle = getNodeColor(n);
              ctx.fill();

              // Border style based on ADR status
              if (n.category === "adr") {
                if (n.status === "draft") {
                  ctx.setLineDash([3, 3]);
                } else {
                  ctx.setLineDash([]);
                }
                ctx.strokeStyle =
                  n.status === "withdrawn" ? "#4a5568" : "#e2e8f0";
                ctx.lineWidth = 1.5 / globalScale;
                ctx.stroke();
                ctx.setLineDash([]);
              }

              // Label for larger nodes or at close zoom
              if (radius > 6 || globalScale > 1.5) {
                const label =
                  n.title
                    ? n.title.slice(0, 20) + (n.title.length > 20 ? "…" : "")
                    : n.path.split("/").pop()?.slice(0, 20) ?? "";
                ctx.font = `${10 / globalScale}px sans-serif`;
                ctx.fillStyle = "#e2e8f0";
                ctx.textAlign = "center";
                ctx.fillText(label, x, y + radius + 12 / globalScale);
              }
            }}
            linkWidth={(link) => {
              const l = link as ForceLink;
              return 0.5 + (l.count / maxEdgeCount) * 3;
            }}
            linkColor={() => "#4a5568"}
            onNodeClick={handleNodeClick}
            cooldownTicks={100}
          />
        </div>

        {!isLocal && (
          <aside style={styles.sidebar}>
            <h3 style={styles.sidebarTitle}>Edge filters</h3>
            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={showAdrAdr}
                onChange={(e) => setShowAdrAdr(e.target.checked)}
              />
              ADR ↔ ADR
            </label>
            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={showSpecSpec}
                onChange={(e) => setShowSpecSpec(e.target.checked)}
              />
              Spec ↔ Spec
            </label>
            <div style={styles.legend}>
              <div style={styles.legendTitle}>Nodes</div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.dot, background: CATEGORY_COLORS.adr }} />
                ADR
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.dot, background: CATEGORY_COLORS.spec }} />
                Spec
              </div>
              <div style={styles.legendSep} />
              <div style={styles.legendTitle}>ADR status</div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.dotOutline, borderStyle: "solid" }} />
                accepted / implemented
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.dotOutline, borderStyle: "dashed" }} />
                draft
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.dot, background: CATEGORY_COLORS.adr + "66" }} />
                superseded
              </div>
              <div style={styles.legendItem}>
                <span style={{ ...styles.dot, background: "#4a5568" }} />
                withdrawn
              </div>
              <div style={styles.legendSep} />
              <div style={styles.legendTitle}>Size</div>
              <div style={styles.legendItem}>
                <span style={{ fontSize: "0.75rem", color: "#718096" }}>radius ∝ √commits</span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  title: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#a0aec0",
  },
  globalLink: {
    color: "#63b3ed",
    fontSize: "0.85rem",
  },
  layout: {
    display: "flex",
    gap: "1rem",
    alignItems: "flex-start",
  },
  canvas: {
    flex: 1,
    border: "1px solid #2d3748",
    borderRadius: "8px",
    overflow: "hidden",
    background: "#0f1117",
  },
  sidebar: {
    width: "200px",
    flexShrink: 0,
    background: "#1a1f2e",
    border: "1px solid #2d3748",
    borderRadius: "8px",
    padding: "1rem",
  },
  sidebarTitle: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "#a0aec0",
    marginBottom: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.85rem",
    color: "#e2e8f0",
    cursor: "pointer",
    marginBottom: "0.5rem",
  },
  legend: {
    marginTop: "1rem",
    borderTop: "1px solid #2d3748",
    paddingTop: "0.75rem",
  },
  legendTitle: {
    fontSize: "0.7rem",
    color: "#718096",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.4rem",
    marginTop: "0.5rem",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.75rem",
    color: "#a0aec0",
    marginBottom: "0.25rem",
  },
  legendSep: {
    height: "1px",
    background: "#2d3748",
    margin: "0.5rem 0",
  },
  dot: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  dotOutline: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    border: "1.5px solid #e2e8f0",
    flexShrink: 0,
  },
  loading: {
    color: "#718096",
    padding: "2rem",
  },
  error: {
    color: "#fc8181",
    padding: "1rem",
  },
};
