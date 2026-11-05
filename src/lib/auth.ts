// Single-reader app: one shared password (APP_PASSWORD) unlocks a signed session cookie.
// Locally, with APP_PASSWORD unset, everything is open. In production it must be set:
// without it the app refuses every request rather than run open on someone's API key.

export const SESSION_COOKIE = "rr_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 90;

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

/** Production with no password configured: lock the app instead of running it open. */
export function misconfigured(): boolean {
  return process.env.NODE_ENV === "production" && !authEnabled();
}

// Signing key derives from the password (plus SESSION_SECRET if set), so changing either signs every device out.
async function key(): Promise<CryptoKey> {
  const secret = `${process.env.SESSION_SECRET ?? ""}:${process.env.APP_PASSWORD ?? ""}`;
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

async function sign(payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(`reresearch-session-v2:${payload}`));
  return Buffer.from(sig).toString("base64url");
}

/** "v2.<issued-at seconds>.<signature>" */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const issued = String(Math.floor(now / 1000));
  return `v2.${issued}.${await sign(issued)}`;
}

export async function verifySessionToken(token: string, now = Date.now()): Promise<boolean> {
  const [version, issued, sig] = token.split(".");
  if (version !== "v2" || !issued || !sig || !/^\d+$/.test(issued)) return false;
  const age = now / 1000 - Number(issued);
  if (age < -60 || age > SESSION_MAX_AGE_S) return false;
  return safeEqual(sig, await sign(issued));
}

/** Constant-time comparison (for equal lengths; a length mismatch returns early, which reveals only the length). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
