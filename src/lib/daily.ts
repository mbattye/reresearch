import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { sendRequestDigest } from "./access";
import { baseURL, isAdmin, safeEqual } from "./auth-config";
import { getDb, schema } from "./db";
import { collectBatches, type Reader } from "./pipeline";

// One function can't do everyone's morning: Vercel stops it after 300 seconds, and a reader who
// writes live takes minutes. So this one only hands out the work, and each reader gets a function
// of their own. If there are too many to hand out in time, it passes the rest to a fresh copy.
const TIME_BUDGET_MS = 240_000;
// Readers' fetches overlap otherwise, and arXiv asks for a few seconds between requests.
const STAGGER_MS = 10_000;
// Short of a full day, so a run that starts a little earlier tomorrow still counts them as due.
const RUN_AGAIN_AFTER_MS = 20 * 60 * 60 * 1000;

export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

const notRunRecently = () =>
  or(
    isNull(schema.userSettings.lastDailyRunAt),
    lt(schema.userSettings.lastDailyRunAt, new Date(Date.now() - RUN_AGAIN_AFTER_MS)),
  );

/** Readers with a usable key who haven't had today's run, longest wait first. */
async function readersDue(): Promise<Reader[]> {
  const db = await getDb();
  const [rows, keys] = await Promise.all([
    db
      .select({ id: schema.user.id, email: schema.user.email, provider: schema.userSettings.summaryProvider })
      .from(schema.user)
      .innerJoin(schema.userSettings, eq(schema.userSettings.userId, schema.user.id))
      .where(notRunRecently())
      .orderBy(sql`${schema.userSettings.lastDailyRunAt} asc nulls first`),
    db.select({ userId: schema.userKeys.userId, provider: schema.userKeys.provider }).from(schema.userKeys),
  ]);
  const hasKey = new Set(keys.map((k) => `${k.userId}:${k.provider}`));
  return rows.filter((r) => {
    const provider = r.provider ?? "anthropic";
    return hasKey.has(`${r.id}:${provider}`) || (provider === "anthropic" && isAdmin(r.email) && !!process.env.ANTHROPIC_API_KEY);
  });
}

/** Marks today's run as taken, so an overlapping or repeated call can't do a reader twice. */
export async function claimDailyRun(userId: string): Promise<boolean> {
  const db = await getDb();
  const claimed = await db
    .update(schema.userSettings)
    .set({ lastDailyRunAt: new Date() })
    .where(and(eq(schema.userSettings.userId, userId), notRunRecently()))
    .returning({ userId: schema.userSettings.userId });
  return claimed.length > 0;
}

function callSelf(path: string, init: RequestInit = {}) {
  return fetch(`${baseURL()}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(20_000),
  });
}

/** Hands out the day's work. Called again with `continuing` when there were too many readers for one go. */
export async function runDaily(continuing: boolean) {
  const startedAt = Date.now();
  let digest: number | null = null;
  let collected = 0;
  if (!continuing) {
    // First, and on their own, so a problem with a reader can't hold up the admins' digest.
    digest = await sendRequestDigest().catch((err) => {
      console.error("[cron] digest failed", err);
      return null;
    });
    collected = await collectBatches().catch((err) => {
      console.error("[cron] collecting batches failed", err);
      return 0;
    });
  }

  const due = await readersDue();
  let attempted = 0;
  const failed: string[] = [];
  for (const reader of due) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    attempted++;
    const res = await callSelf("/api/cron/reader", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: reader.id }),
    }).catch(() => null);
    if (!res?.ok) failed.push(reader.id);
    if (attempted < due.length) await new Promise((r) => setTimeout(r, STAGGER_MS));
  }

  const remaining = due.length - attempted;
  if (remaining > 0) await callSelf("/api/cron/ingest?continue=1").catch((err) => console.error("[cron] couldn't continue", err));
  console.log("[cron]", JSON.stringify({ continuing, digest, collected, started: attempted - failed.length, failed, passedOn: remaining }));
}
