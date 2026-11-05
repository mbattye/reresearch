import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { USER_AGENT } from "./sources/types";

/**
 * fetch() for URLs that come from third-party metadata (PDF links from OpenAlex,
 * Semantic Scholar, publishers). Only http(s) on default ports, never to private,
 * loopback or link-local addresses, and every redirect hop is checked again, so a
 * crafted link can't make the server call internal services.
 */
export async function safeFetch(rawUrl: string, init: { timeoutMs?: number } = {}): Promise<Response> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Blocked URL scheme ${url.protocol}`);
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error(`Blocked port ${url.port}`);
  if (url.username || url.password) throw new Error("Blocked URL with credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error(`Blocked non-public host ${host}`);
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast and reserved
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}
