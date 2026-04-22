import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// SSE broker is module-level state in server.ts. We test its logic
// by extracting the relevant parts and testing them in isolation.

// Writer interface matching the SSE broker
interface Writer {
  write: (chunk: string) => void;
  close: () => void;
}

function createBroker() {
  const clients = new Set<Writer>();

  function broadcast(event: { type: string; changed?: string[] }): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const writer of clients) {
      try {
        writer.write(payload);
      } catch {
        clients.delete(writer);
      }
    }
  }

  function connect(writer: Writer): () => void {
    clients.add(writer);
    // Send hello on connect
    writer.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    return () => {
      clients.delete(writer);
    };
  }

  return { clients, broadcast, connect };
}

describe("SSE broker", () => {
  it("sends hello event on connect", () => {
    const { connect } = createBroker();
    const received: string[] = [];
    const writer: Writer = {
      write: (chunk) => received.push(chunk),
      close: () => {},
    };

    connect(writer);
    expect(received.length).toBe(1);
    const parsed = JSON.parse(received[0].replace(/^data: /, "").trim());
    expect(parsed.type).toBe("hello");
  });

  it("broadcasts reindex event to all connected clients", () => {
    const { connect, broadcast } = createBroker();
    const received1: string[] = [];
    const received2: string[] = [];

    const w1: Writer = { write: (c) => received1.push(c), close: () => {} };
    const w2: Writer = { write: (c) => received2.push(c), close: () => {} };

    connect(w1);
    connect(w2);

    broadcast({ type: "reindex", changed: ["docs/adr-0001.md"] });

    // Each client received hello + broadcast
    expect(received1.length).toBe(2);
    expect(received2.length).toBe(2);

    const event1 = JSON.parse(received1[1].replace(/^data: /, "").trim());
    expect(event1.type).toBe("reindex");
    expect(event1.changed).toEqual(["docs/adr-0001.md"]);
  });

  it("removes client after disconnect", () => {
    const { clients, connect } = createBroker();
    const w: Writer = { write: () => {}, close: () => {} };

    const disconnect = connect(w);
    expect(clients.size).toBe(1);

    disconnect();
    expect(clients.size).toBe(0);
  });

  it("removes dirty client on write error", () => {
    const { clients, connect, broadcast } = createBroker();

    // A writer that throws on write (simulating dirty disconnect)
    let callCount = 0;
    const w: Writer = {
      write: () => {
        callCount++;
        if (callCount > 1) throw new Error("Stream closed");
      },
      close: () => {},
    };

    connect(w); // hello is write #1
    expect(clients.size).toBe(1);

    // This write (callCount = 2) will throw → client should be removed
    broadcast({ type: "reindex", changed: [] });
    expect(clients.size).toBe(0);
  });

  it("broadcasts to remaining clients after one disconnects", () => {
    const { connect, broadcast } = createBroker();
    const received1: string[] = [];
    const received2: string[] = [];

    const w1: Writer = { write: (c) => received1.push(c), close: () => {} };
    const w2: Writer = { write: (c) => received2.push(c), close: () => {} };

    const disconnect1 = connect(w1);
    connect(w2);

    disconnect1();

    broadcast({ type: "reindex", changed: ["docs/spec.md"] });

    // w1 was disconnected — should not receive the broadcast
    expect(received1.length).toBe(1); // only the hello
    // w2 should receive hello + broadcast
    expect(received2.length).toBe(2);
  });

  it("SSE payload format: data line + double newline", () => {
    const { connect } = createBroker();
    const received: string[] = [];
    const w: Writer = { write: (c) => received.push(c), close: () => {} };
    connect(w);

    const msg = received[0];
    expect(msg.startsWith("data: ")).toBe(true);
    expect(msg.endsWith("\n\n")).toBe(true);
  });
});

// ---- SSE heartbeat (ADR-0037) ----
//
// The heartbeat is a per-connection setInterval that enqueues `:heartbeat\n\n`
// every 15 s into the ReadableStream controller. We test the logic directly
// without the full ReadableStream plumbing by simulating the same pattern used
// in server.ts: an `enqueue` function, an interval, and a cancel callback.

interface HeartbeatController {
  enqueue: (chunk: string) => void;
}

function createHeartbeatSession(intervalMs: number) {
  const chunks: string[] = [];
  let closed = false;

  const controller: HeartbeatController = {
    enqueue: (chunk: string) => {
      if (closed) throw new Error("Controller already closed");
      chunks.push(chunk);
    },
  };

  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  // Mirrors the `start()` callback in server.ts handleSSE()
  heartbeatInterval = setInterval(() => {
    try {
      controller.enqueue(":heartbeat\n\n");
    } catch {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    }
  }, intervalMs);

  // Mirrors the `cancel()` callback in server.ts handleSSE()
  function cancel() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    closed = true;
  }

  function closeController() {
    closed = true;
  }

  return { chunks, cancel, closeController, getInterval: () => heartbeatInterval };
}

describe("SSE heartbeat (ADR-0037)", () => {
  it("heartbeat comment uses SSE comment format (:heartbeat\\n\\n)", async () => {
    // Use a very short interval to fire immediately in tests
    const session = createHeartbeatSession(10);

    await new Promise((resolve) => setTimeout(resolve, 30));

    session.cancel();

    expect(session.chunks.length).toBeGreaterThan(0);
    for (const chunk of session.chunks) {
      expect(chunk).toBe(":heartbeat\n\n");
    }
  });

  it("cancel() clears the interval so no more heartbeats are sent", async () => {
    const session = createHeartbeatSession(20);

    // Let one heartbeat fire
    await new Promise((resolve) => setTimeout(resolve, 30));
    const countAfterFirst = session.chunks.length;
    expect(countAfterFirst).toBeGreaterThan(0);

    // Cancel — interval must be cleared
    session.cancel();
    expect(session.getInterval()).toBeNull();

    // Wait longer — no new chunks should arrive
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(session.chunks.length).toBe(countAfterFirst);
  });

  it("heartbeat stops gracefully when controller is already closed (dirty disconnect)", async () => {
    const session = createHeartbeatSession(20);

    // Simulate the controller closing before cancel() is called
    session.closeController();

    // The interval will fire and the enqueue will throw; the interval clears itself
    await new Promise((resolve) => setTimeout(resolve, 50));

    // After self-clearing, no further chunks should be enqueued; also, the
    // process should not have crashed (the try/catch inside the interval handles it).
    // We just verify the chunks list has at most 0 entries (since we closed before first fire).
    expect(session.chunks.length).toBe(0);
  });

  it("heartbeat interval is independent per connection", async () => {
    const session1 = createHeartbeatSession(20);
    const session2 = createHeartbeatSession(20);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Cancel only session1
    session1.cancel();
    const count1 = session1.chunks.length;
    const count2Before = session2.chunks.length;

    await new Promise((resolve) => setTimeout(resolve, 40));

    // session1 stopped; session2 keeps going
    expect(session1.chunks.length).toBe(count1);
    expect(session2.chunks.length).toBeGreaterThan(count2Before);

    session2.cancel();
  });
});
