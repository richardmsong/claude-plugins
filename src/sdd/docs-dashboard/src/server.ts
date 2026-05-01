import { networkInterfaces } from "os";
import { Database } from "bun:sqlite";
import { resolveDocsRoot } from "docs-mcp/resolve-docs-root";
import { boot } from "./boot.js";
import {
  handleAdrs,
  handleSpecs,
  handleAudits,
  handleDoc,
  handleLineage,
  handleSearch,
  handleGraph,
  handleBlame,
  handleDiff,
} from "./routes.js";

// ---- CLI flag parsing ----

function parseArgs(argv: string[]): { port: number; dbPath: string | null; root: string | null } {
  let port = 4567;
  let dbPath: string | null = null;
  let root: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      if (isNaN(n) || n <= 0 || n > 65535) {
        console.error(`Error: invalid port "${argv[i + 1]}"`);
        process.exit(1);
      }
      port = n;
      i++;
    } else if (argv[i] === "--db-path" && argv[i + 1]) {
      dbPath = argv[i + 1];
      i++;
    } else if (argv[i] === "--root" && argv[i + 1]) {
      root = argv[i + 1];
      i++;
    }
  }

  return { port, dbPath, root };
}

// ---- Startup banner ----

/**
 * Build the multi-line startup banner.
 *
 * Format per spec-dashboard.md § Startup banner:
 *   Dashboard ready:
 *     http://127.0.0.1:<port>/
 *     http://<iface-ipv4>:<port>/   (for each non-loopback IPv4)
 *
 * Loopback line is always first. Every subsequent line is a non-internal IPv4
 * address from os.networkInterfaces(), in the order the OS returns them.
 * IPv6 and interfaces flagged internal:true are skipped. If the host has no
 * non-loopback IPv4, only the loopback line is included.
 */
export function buildStartupBanner(
  port: number,
  ifaces: ReturnType<typeof networkInterfaces> = networkInterfaces()
): string {
  const lines: string[] = [`Dashboard ready:`, `  http://127.0.0.1:${port}/`];

  for (const ifaceList of Object.values(ifaces)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      lines.push(`  http://${iface.address}:${port}/`);
    }
  }

  return lines.join("\n");
}

// ---- SSE broker ----

type Writer = { write: (chunk: string) => void; close: () => void };
const clients = new Set<Writer>();

function broadcast(event: { type: string; changed?: string[] }): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const writer of clients) {
    try {
      writer.write(payload);
    } catch {
      // Dirty disconnect: stream already closed; remove defensively
      clients.delete(writer);
    }
  }
}

function handleSSE(): Response {
  const encoder = new TextEncoder();

  // `writer` and `heartbeatInterval` must be declared OUTSIDE the ReadableStream
  // options object. `start` and `cancel` are sibling callbacks — a `const` inside
  // `start` is invisible to `cancel` (JavaScript scoping). Hoisting to this shared
  // scope lets `cancel` clean up the exact same references `start` registered.
  let writer: Writer | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      writer = {
        write: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
        close: () => {
          try {
            controller.close();
          } catch {}
        },
      };
      clients.add(writer);
      // Send hello immediately so the client knows it's connected
      writer.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
      // SSE comment heartbeat every 15 s — keeps the connection alive so Bun
      // doesn't close the ReadableStream when there's nothing left to enqueue.
      // SSE comments (lines starting with `:`) are silently ignored by the
      // browser's EventSource API.
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":heartbeat\n\n"));
        } catch {
          // Controller is already closed (client gone); clear the interval.
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 15_000);
    },
    cancel() {
      // Fires when the client disconnects cleanly (tab close, etc.)
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (writer) clients.delete(writer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ---- Main entry point ----

async function main() {
  const argv = process.argv.slice(2);
  const { port, dbPath, root } = parseArgs(argv);

  // Step 1: Resolve docsRoot via priority chain (ADR-0050)
  const docsRoot = resolveDocsRoot(root, process.env.CLAUDE_PROJECT_DIR, process.cwd());

  let db: Database;
  let gitRoot: string | null;
  let stopWatcher: () => void;

  try {
    ({ gitRoot, db, stopWatcher } = boot(docsRoot, dbPath, (changed: string[]) => {
      broadcast({ type: "reindex", changed });
    }));
  } catch (err) {
    console.error(`[dashboard] Boot failed: ${err}`);
    process.exit(1);
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    stopWatcher();
    db.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stopWatcher();
    db.close();
    process.exit(0);
  });

  const server = Bun.serve({
    hostname: "0.0.0.0",
    port,
    fetch(req) {
      const url = new URL(req.url);

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // SSE endpoint
      if (req.method === "GET" && url.pathname === "/events") {
        return handleSSE();
      }

      // API routes
      if (req.method === "GET" && url.pathname === "/api/adrs") {
        return handleAdrs(db, url);
      }
      if (req.method === "GET" && url.pathname === "/api/specs") {
        return handleSpecs(db);
      }
      if (req.method === "GET" && url.pathname === "/api/audits") {
        return handleAudits(db);
      }
      if (req.method === "GET" && url.pathname === "/api/doc") {
        return handleDoc(db, gitRoot, url);
      }
      if (req.method === "GET" && url.pathname === "/api/lineage") {
        return handleLineage(db, url);
      }
      if (req.method === "GET" && url.pathname === "/api/search") {
        return handleSearch(db, url);
      }
      if (req.method === "GET" && url.pathname === "/api/graph") {
        return handleGraph(db, url);
      }
      if (req.method === "GET" && url.pathname === "/api/blame") {
        return handleBlame(db, gitRoot, url);
      }
      if (req.method === "GET" && url.pathname === "/api/diff") {
        return handleDiff(gitRoot, url);
      }

      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },
    error(err) {
      // Port in use
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        console.error(
          `Error: port ${port} is in use. Use --port <n> or stop the other process.`
        );
        process.exit(1);
      }
      console.error(`[dashboard] Server error: ${err}`);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  console.log(buildStartupBanner(server.port ?? port));
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`[dashboard] Fatal: ${err}`);
    process.exit(1);
  });
}
