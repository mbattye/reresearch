import { ingest } from "@/lib/pipeline";
import { safeEqual } from "@/lib/auth";

// Summaries of full PDFs take a while; this needs the long function timeout.
export const maxDuration = 300;

/** Called by Vercel Cron (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const report = await ingest();
  return Response.json(report);
}
