import { describe, expect, it } from "vitest";

import {
  assertPublicUrl,
  BlockedUrlError,
  isBlockedAddress,
  type HostResolver,
} from "./url-guard.js";

const resolvesTo =
  (...addresses: string[]): HostResolver =>
  async () =>
    addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));

describe("isBlockedAddress", () => {
  it("allows public IPv4 and IPv6 addresses", () => {
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks loopback, private, link-local and reserved IPv4 ranges", () => {
    for (const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.20.0.1",
      "192.0.0.1",
      "192.168.1.1",
      "198.18.0.1",
      "203.0.113.5",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it("blocks loopback, unique-local, link-local and mapped IPv6 addresses", () => {
    for (const address of [
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:10.0.0.5",
      "64:ff9b::7f00:1",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it("blocks values that are not IP addresses at all", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
    expect(isBlockedAddress("999.1.1.1")).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  it("accepts a hostname that resolves to a public address", async () => {
    const url = await assertPublicUrl("https://example.com/path?q=1", {
      resolve: resolvesTo("93.184.216.34"),
    });

    expect(url.hostname).toBe("example.com");
    expect(url.pathname).toBe("/path");
  });

  it("accepts a public IP literal without a DNS lookup", async () => {
    const resolve: HostResolver = async () => {
      throw new Error("should not resolve an IP literal");
    };

    await expect(
      assertPublicUrl("http://8.8.8.8/", { resolve }),
    ).resolves.toBeInstanceOf(URL);
  });

  it("rejects non-http protocols", async () => {
    for (const raw of ["ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)"]) {
      await expect(assertPublicUrl(raw, { resolve: resolvesTo("8.8.8.8") })).rejects.toBeInstanceOf(
        BlockedUrlError,
      );
    }
  });

  it("rejects URLs with embedded credentials", async () => {
    await expect(
      assertPublicUrl("https://user:secret@example.com/", {
        resolve: resolvesTo("8.8.8.8"),
      }),
    ).rejects.toThrow(/credentials/i);
  });

  it("rejects localhost names", async () => {
    for (const raw of ["http://localhost:3000", "http://api.localhost", "http://IP6-LOCALHOST/"]) {
      await expect(assertPublicUrl(raw, { resolve: resolvesTo("127.0.0.1") })).rejects.toBeInstanceOf(
        BlockedUrlError,
      );
    }
  });

  it("rejects private IP literals in both families", async () => {
    for (const raw of [
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[::ffff:127.0.0.1]/",
    ]) {
      await expect(assertPublicUrl(raw, { resolve: resolvesTo("8.8.8.8") })).rejects.toThrow(
        /public address/i,
      );
    }
  });

  it("rejects a hostname that resolves to a private address", async () => {
    await expect(
      assertPublicUrl("https://internal.example.com/", { resolve: resolvesTo("10.0.0.7") }),
    ).rejects.toThrow(/public address/i);
  });

  it("rejects when any resolved address is private", async () => {
    await expect(
      assertPublicUrl("https://rebind.example.com/", {
        resolve: resolvesTo("93.184.216.34", "127.0.0.1"),
      }),
    ).rejects.toThrow(/public address/i);
  });

  it("rejects hosts that cannot be resolved", async () => {
    const resolve: HostResolver = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(assertPublicUrl("https://nope.invalid/", { resolve })).rejects.toThrow(
      /could not be resolved/i,
    );

    await expect(
      assertPublicUrl("https://empty.invalid/", { resolve: resolvesTo() }),
    ).rejects.toThrow(/could not be resolved/i);
  });

  it("rejects a malformed URL", async () => {
    await expect(assertPublicUrl("not a url", { resolve: resolvesTo("8.8.8.8") })).rejects.toThrow(
      /not valid/i,
    );
  });

  it("allows private hosts when the escape hatch is on", async () => {
    await expect(
      assertPublicUrl("http://localhost:3000/", {
        resolve: resolvesTo("127.0.0.1"),
        allowPrivateHosts: true,
      }),
    ).resolves.toBeInstanceOf(URL);
  });
});
