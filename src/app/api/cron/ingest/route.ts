import { sendRequestDigest } from "@/lib/access";
import { safeEqual } from "@/lib/auth-config";
import { activeReaders } from "@/lib/feed";
import { collectBatches, ingest } from "@/lib/pipeline";

// Fetching for several readers and summarising takes a while; this needs the long function timeout.
export const maxDuration = 300;

/** Called by Vercel Cron (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  // First, and on its own, so a slow or failed reader can't hold up the admins' digest.
  const digest = await sendRequestDigest().catch((err) => {
    console.error("[cron] digest failed", err);
    return null;
  });
  try {
    const collected = await collectBatches();
    const readers = await activeReaders();
    const results: Record<string, unknown> = {};
    // One reader at a time: arXiv asks for a pause between requests, and each reader pays with their own key.
    for (const reader of readers) {
      try {
        // Scheduled runs use the half-price batch (Anthropic keys) unless SUMMARY_BATCH=false.
        const r = await ingest(reader, { batch: process.env.SUMMARY_BATCH !== "false" });
        results[reader.id] = { inserted: r.inserted, batchId: r.batchId, summarised: r.summarised.length, failed: r.failed.length };
      } catch (err) {
        // Only the cron caller (holder of CRON_SECRET) sees this; it shows in the Vercel cron log.
        console.error("[cron] ingest failed for", reader.id, err);
        results[reader.id] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return Response.json({ digest, collected, readers: readers.length, results });
  } catch (err) {
    console.error("[cron] run failed", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
