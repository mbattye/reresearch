import { after } from "next/server";
import { cronAuthorised, runDaily } from "@/lib/daily";

// Handing out a large morning's work takes a while; this needs the long function timeout.
export const maxDuration = 300;

/** Called by Vercel Cron (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`. */
export function GET(request: Request) {
  if (!cronAuthorised(request)) return new Response("Unauthorized", { status: 401 });
  const continuing = new URL(request.url).searchParams.has("continue");
  after(() => runDaily(continuing).catch((err) => console.error("[cron] run failed", err)));
  return Response.json({ started: true, continuing }, { status: 202 });
}
