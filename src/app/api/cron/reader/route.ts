import { eq } from "drizzle-orm";
import { after } from "next/server";
import { claimDailyRun, cronAuthorised } from "@/lib/daily";
import { getDb, schema } from "@/lib/db";
import { ingest } from "@/lib/pipeline";

// One reader's fetch and write-ups, with the whole time limit to themselves.
export const maxDuration = 300;

/** One reader's morning. Called by the daily run with the same secret as the cron job. */
export async function POST(request: Request) {
  if (!cronAuthorised(request)) return new Response("Unauthorized", { status: 401 });
  const { userId } = (await request.json().catch(() => ({}))) as { userId?: unknown };
  if (typeof userId !== "string") return new Response("Missing userId", { status: 400 });

  const db = await getDb();
  const [reader] = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  if (!reader) return new Response("Unknown reader", { status: 404 });
  if (!(await claimDailyRun(userId))) return Response.json({ skipped: true });

  after(async () => {
    try {
      // Scheduled runs use the half-price batch (Anthropic keys) unless SUMMARY_BATCH=false.
      const r = await ingest(reader, { batch: process.env.SUMMARY_BATCH !== "false" });
      console.log("[cron] reader", reader.id, JSON.stringify({ inserted: r.inserted, batchId: r.batchId, summarised: r.summarised.length, failed: r.failed.length }));
    } catch (err) {
      console.error("[cron] ingest failed for", reader.id, err);
    }
  });
  return Response.json({ started: true }, { status: 202 });
}
