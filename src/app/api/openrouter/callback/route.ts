import { connection, NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { baseURL } from "@/lib/auth-config";
import { saveKey } from "@/lib/keys";
import { CONNECT_COOKIE, CONNECT_COOKIE_PATH, exchangeCode, readConnectCookie } from "@/lib/openrouter-connect";
import { preferProviderIfStuck } from "@/lib/pipeline";

/** OpenRouter sends the reader back here with a one-time code, which becomes their saved key. */
export async function GET(request: NextRequest) {
  await connection();
  const reader = await requireUser();
  const params = request.nextUrl.searchParams;
  const saved = readConnectCookie(request.cookies.get(CONNECT_COOKIE)?.value);
  const code = params.get("code");

  let outcome: "connected" | "cancelled" | "failed" = "failed";
  if (!code) {
    outcome = "cancelled";
  } else if (saved && params.get("state") === saved.state) {
    try {
      await saveKey(reader.id, "openrouter", await exchangeCode(code, saved.verifier));
      await preferProviderIfStuck(reader, "openrouter");
      outcome = "connected";
    } catch (err) {
      console.error("[openrouter] connect failed", err instanceof Error ? err.message : err);
    }
  }

  // A first connection from the welcome goes back to the feed, where the welcome offers the first fetch.
  const to = outcome === "connected" && saved?.from === "welcome" ? "/" : `/settings?openrouter=${outcome}#keys`;
  const res = NextResponse.redirect(new URL(to, baseURL()));
  res.cookies.delete({ name: CONNECT_COOKIE, path: CONNECT_COOKIE_PATH });
  return res;
}
