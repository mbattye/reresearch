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
  try {
    // Scheduled runs use the half-price batch unless SUMMARY_BATCH=false.
    const report = await ingest({ batch: process.env.SUMMARY_BATCH !== "false" });
    return Response.json(report);
  } catch (err) {
    // Only the cron caller (holder of CRON_SECRET) sees this; it shows in the Vercel cron log.
    console.error("[cron] ingest failed", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
