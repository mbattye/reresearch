// Single-reader app: one shared password (APP_PASSWORD) unlocks a long-lived cookie.
// With APP_PASSWORD unset (local dev), everything is open.

export const SESSION_COOKIE = "rr_session";

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

/** Deterministic token derived from the password, so changing the password logs every device out. */
export async function sessionToken(): Promise<string> {
  const secret = process.env.APP_PASSWORD ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("reresearch-session-v1"));
  return Buffer.from(sig).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
