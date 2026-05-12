import { describe, it, expect } from "bun:test";
import { buildStartupBanner } from "../src/server";

describe("buildStartupBanner", () => {
  it("always prints the loopback line first", () => {
    const banner = buildStartupBanner(4567, {});
    const lines = banner.split("\n");
    expect(lines[0]).toBe("Dashboard ready:");
    expect(lines[1]).toBe("  http://127.0.0.1:4567/");
  });

  it("includes a non-loopback IPv4 address from the mock interfaces", () => {
    const mockIfaces = {
      en0: [
        {
          address: "100.64.0.2",
          netmask: "255.255.255.0",
          family: "IPv4" as const,
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "100.64.0.2/24",
        },
      ],
    };
    const banner = buildStartupBanner(4567, mockIfaces);
    expect(banner).toContain("  http://100.64.0.2:4567/");
  });

  it("skips IPv6 addresses", () => {
    const mockIfaces = {
      en0: [
        {
          address: "fe80::1",
          netmask: "ffff:ffff:ffff:ffff::",
          family: "IPv6" as const,
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "fe80::1/64",
          scopeid: 0,
        },
        {
          address: "192.168.1.100",
          netmask: "255.255.255.0",
          family: "IPv4" as const,
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.100/24",
        },
      ],
    };
    const banner = buildStartupBanner(4567, mockIfaces);
    expect(banner).not.toContain("fe80::1");
    expect(banner).toContain("  http://192.168.1.100:4567/");
  });

  it("skips internal interfaces", () => {
    const mockIfaces = {
      lo0: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4" as const,
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      ],
      en0: [
        {
          address: "10.0.0.5",
          netmask: "255.255.255.0",
          family: "IPv4" as const,
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "10.0.0.5/24",
        },
      ],
    };
    const banner = buildStartupBanner(4567, mockIfaces);
    // The loopback line is always the manually added one from the function — only once
    const loopbackCount = (banner.match(/127\.0\.0\.1/g) ?? []).length;
    expect(loopbackCount).toBe(1);
    expect(banner).toContain("  http://10.0.0.5:4567/");
  });

  it("prints only the loopback line when no non-loopback IPv4 exists", () => {
    const mockIfaces = {
      lo0: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4" as const,
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      ],
    };
    const banner = buildStartupBanner(4567, mockIfaces);
    const lines = banner.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Dashboard ready:");
    expect(lines[1]).toBe("  http://127.0.0.1:4567/");
  });

  it("prints multiple non-loopback addresses in interface order", () => {
    const mockIfaces = {
      en0: [
        {
          address: "192.168.1.10",
          netmask: "255.255.255.0",
          family: "IPv4" as const,
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.10/24",
        },
      ],
      utun0: [
        {
          address: "100.64.1.5",
          netmask: "255.255.255.255",
          family: "IPv4" as const,
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "100.64.1.5/32",
        },
      ],
    };
    const banner = buildStartupBanner(4567, mockIfaces);
    const lines = banner.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("Dashboard ready:");
    expect(lines[1]).toBe("  http://127.0.0.1:4567/");
    expect(lines[2]).toBe("  http://192.168.1.10:4567/");
    expect(lines[3]).toBe("  http://100.64.1.5:4567/");
  });

  it("respects the port parameter in all lines", () => {
    const mockIfaces = {
      en0: [
        {
          address: "10.1.2.3",
          netmask: "255.255.0.0",
          family: "IPv4" as const,
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "10.1.2.3/16",
        },
      ],
    };
    const banner = buildStartupBanner(9999, mockIfaces);
    expect(banner).toContain("  http://127.0.0.1:9999/");
    expect(banner).toContain("  http://10.1.2.3:9999/");
  });

  // Contract: methodology.dashboard.banner_shows_resolved_docs_dir (ADR-0083).
  // Pre-declares the post-implementation signature:
  //   buildStartupBanner(port: number, docsDir: string, ifaces?: ...)
  // The @ts-expect-error below will be removed once buildStartupBanner is extended
  // per ADR-0083 and the second parameter becomes docsDir: string (not ifaces).
  it("includes a Docs dir line showing the resolved docs directory", () => {
    // @ts-expect-error — test pre-declares the post-implementation signature;
    // will be removed once buildStartupBanner is extended per ADR-0083
    const banner = buildStartupBanner(4567, "/tmp/some/docs/dir");
    expect(banner).toContain("Docs dir: /tmp/some/docs/dir");
    expect(banner).toContain("http://127.0.0.1:4567/");
  });
});
