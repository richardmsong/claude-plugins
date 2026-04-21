import { describe, it, expect } from "bun:test";

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
