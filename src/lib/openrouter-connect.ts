import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { baseURL } from "./auth-config";

// "Connect OpenRouter": OpenRouter's OAuth PKCE flow hands back a key the reader controls, so
// they never copy or paste one. https://openrouter.ai/docs/guides/overview/auth/oauth
// The verifier and state wait in a short-lived httpOnly cookie between the two requests.

export const CONNECT_COOKIE = "rr_openrouter";
export const CONNECT_COOKIE_PATH = "/api/openrouter";
export const CONNECT_MINUTES = 10;

export type ConnectFrom = "welcome" | "settings";

export function connectFrom(value: string | null | undefined): ConnectFrom {
  return value === "welcome" ? "welcome" : "settings";
}

export function callbackURL(): string {
  return `${baseURL()}${CONNECT_COOKIE_PATH}/callback`;
}

/** Where to send the reader, and the cookie that the callback checks. */
export function startConnect(from: ConnectFrom): { url: string; cookie: string } {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://openrouter.ai/auth");
  url.searchParams.set("callback_url", callbackURL());
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("key_label", "reresearch");
  return { url: url.toString(), cookie: [state, verifier, from].join(".") };
}

export function readConnectCookie(value: string | undefined): { state: string; verifier: string; from: ConnectFrom } | null {
  const [state, verifier, from] = (value ?? "").split(".");
  if (!state || !verifier) return null;
  return { state, verifier, from: connectFrom(from) };
}

/** Swaps the one-time code (valid for 10 minutes) for the reader's new key. */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenRouter didn't accept the sign-in (${res.status})`);
  const body = (await res.json()) as { key?: unknown };
  if (typeof body.key !== "string") throw new Error("OpenRouter didn't send a key");
  return body.key;
}
