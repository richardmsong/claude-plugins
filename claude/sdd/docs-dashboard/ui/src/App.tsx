import React, { useEffect, useRef, useState, useCallback } from "react";
import Landing from "./routes/Landing";
import AdrDetail from "./routes/AdrDetail";
import SpecDetail from "./routes/SpecDetail";
import SearchResults from "./routes/SearchResults";
import Graph from "./routes/Graph";
import SearchBar from "./components/SearchBar";

// ---- SSE hook ----

export interface ReindexEvent {
  type: "reindex";
  changed: string[];
}

export interface HelloEvent {
  type: "hello";
}

export type SSEEvent = ReindexEvent | HelloEvent;

export function useEventSource(url: string) {
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const refetchCounterRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let es: EventSource;

    function connect() {
      es = new EventSource(url);

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as SSEEvent;
          setLastEvent(event);
          if (event.type === "reindex") {
            // Bump refetch counter for each changed path
            for (const path of event.changed) {
              refetchCounterRef.current[path] =
                (refetchCounterRef.current[path] ?? 0) + 1;
            }
          }
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        // EventSource auto-reconnects; on reconnect, server sends hello
        // which triggers a full refetch on the client
      };
    }

    connect();

    return () => {
      es?.close();
    };
  }, [url]);

  return { lastEvent, refetchCounterRef };
}

// ---- Hash router ----

function parseHash(): { route: string; params: URLSearchParams } {
  const hash = window.location.hash.slice(1) || "/";
  const [path, query] = hash.split("?");
  return {
    route: path || "/",
    params: new URLSearchParams(query || ""),
  };
}

export default function App() {
  const [{ route, params }, setLocation] = useState(parseHash);
  const { lastEvent } = useEventSource("/events");

  useEffect(() => {
    function onHashChange() {
      setLocation(parseHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // When hello arrives (reconnect), trigger a full-page refetch by bumping state
  useEffect(() => {
    if (lastEvent?.type === "hello") {
      setLocation(parseHash());
    }
  }, [lastEvent]);

  const navigate = useCallback((href: string) => {
    window.location.hash = href;
  }, []);

  // Route matching
  let content: React.ReactNode;

  if (route === "/") {
    content = <Landing navigate={navigate} lastEvent={lastEvent} />;
  } else if (route.startsWith("/adr/")) {
    const slug = route.slice("/adr/".length);
    content = <AdrDetail slug={slug} navigate={navigate} lastEvent={lastEvent} />;
  } else if (route.startsWith("/spec/")) {
    const specPath = route.slice("/spec/".length);
    content = <SpecDetail docPath={specPath} navigate={navigate} lastEvent={lastEvent} />;
  } else if (route === "/search") {
    const q = params.get("q") ?? "";
    content = <SearchResults query={q} navigate={navigate} />;
  } else if (route === "/graph") {
    const focus = params.get("focus") ?? undefined;
    const section = params.get("section") ?? undefined;
    content = <Graph focus={focus} section={section} navigate={navigate} />;
  } else {
    content = (
      <div style={styles.center}>
        <p>Page not found: {route}</p>
        <a href="#/" style={{ color: "#63b3ed" }}>
          Go home
        </a>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <nav style={styles.nav}>
        <a href="#/" style={styles.brand}>
          Docs Dashboard
        </a>
        <SearchBar navigate={navigate} />
        <a href="#/graph" style={styles.navLink}>
          Graph
        </a>
      </nav>
      <main style={styles.main}>{content}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    padding: "0.75rem 1.5rem",
    background: "#1a1f2e",
    borderBottom: "1px solid #2d3748",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  brand: {
    color: "#63b3ed",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "1.1rem",
    marginRight: "auto",
  },
  navLink: {
    color: "#a0aec0",
    textDecoration: "none",
    fontSize: "0.9rem",
  },
  main: {
    flex: 1,
    padding: "1.5rem",
    maxWidth: "1400px",
    margin: "0 auto",
    width: "100%",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "50vh",
    gap: "1rem",
  },
};
