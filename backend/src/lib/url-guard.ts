import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { env } from "./env.js";

/**
 * Rejects URLs that would make the server fetch its own network: loopback,
 * RFC 1918 ranges, link-local (cloud metadata), multicast and friends.
 *
 * This is a best-effort guard. It stops the obvious SSRF attempts; it cannot
 * pin the resolved address, so a DNS-rebinding host could still pass the check
 * and resolve differently when Playwright connects.
 */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export type ResolvedHost = { address: string; family: number };
export type HostResolver = (hostname: string) => Promise<ResolvedHost[]>;

const resolveWithDns: HostResolver = async (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return true;
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return true;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true; // 192.0.0.0/24, 192.0.2.0/24, 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0) return true; // 203.0.113.0/24
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** `::ffff:7f00:1` and `::ffff:127.0.0.1` both denote an IPv4-mapped address. */
function ipv4FromMapped(address: string): string | null {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  const dottedAddress = dotted?.[1];
  if (dottedAddress !== undefined) return dottedAddress;

  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  const highPart = hex?.[1];
  const lowPart = hex?.[2];
  if (highPart === undefined || lowPart === undefined) return null;

  const high = Number.parseInt(highPart, 16);
  const low = Number.parseInt(lowPart, 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function isPrivateIpv6(address: string): boolean {
  const addr = address.toLowerCase().split("%")[0] ?? "";

  if (addr === "::" || addr === "::1") return true;

  const mapped = ipv4FromMapped(addr);
  if (mapped !== null) return isPrivateIpv4(mapped);

  // 64:ff9b::/96 (NAT64) can embed a private IPv4 address.
  if (addr.startsWith("64:ff9b:")) return true;

  const groups = addr.split(":");
  const firstGroup = groups[0] ?? "";
  const secondGroup = groups[1];
  const first = firstGroup === "" ? 0 : Number.parseInt(firstGroup, 16);
  if (Number.isNaN(first)) return true;

  if (first >= 0xfc00 && first <= 0xfdff) return true; // unique local
  if (first >= 0xfe80 && first <= 0xfebf) return true; // link-local
  if (first >= 0xff00) return true; // multicast

  const second =
    secondGroup === undefined ? Number.NaN : Number.parseInt(secondGroup, 16);
  if (first === 0x2001 && second === 0x0db8) return true; // documentation

  return false;
}

/** True when the address must never be fetched by the server. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

export type UrlGuardOptions = {
  resolve?: HostResolver;
  allowPrivateHosts?: boolean;
};

/**
 * Validate a user-supplied audit URL and return it parsed.
 *
 * `allowPrivateHosts` defaults to `ALLOW_PRIVATE_HOSTS`, which exists so local
 * development can audit `http://localhost:3000`; production must leave it off.
 */
export async function assertPublicUrl(
  raw: string,
  options: UrlGuardOptions = {},
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BlockedUrlError("URL is not valid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BlockedUrlError("URL must use http or https.");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new BlockedUrlError("URL must not contain credentials.");
  }

  const allowPrivateHosts = options.allowPrivateHosts ?? env.ALLOW_PRIVATE_HOSTS;
  if (allowPrivateHosts) return parsed;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "" || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new BlockedUrlError("URL host must be a public address.");
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedAddress(hostname)) {
      throw new BlockedUrlError("URL host must be a public address.");
    }
    return parsed;
  }

  const resolve = options.resolve ?? resolveWithDns;
  let addresses: ResolvedHost[];
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new BlockedUrlError("URL host could not be resolved.");
  }

  if (addresses.length === 0) {
    throw new BlockedUrlError("URL host could not be resolved.");
  }
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new BlockedUrlError("URL host must be a public address.");
  }

  return parsed;
}
