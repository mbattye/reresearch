import "server-only";
import { desc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Interaction, Paper, Thread } from "./db/schema";
import { feedRank } from "./ranking";

const { papers, threads, interactions, termAffinity } = schema;

export type FeedTab = "foryou" | "latest" | "saved" | "queue";

export interface FeedItem {
  paper: Paper;
  thread: Thread;
  interaction: Interaction | null;
}

const FEED_WINDOW = 300;

export async function getFeed(tab: Exclude<FeedTab, "queue">): Promise<FeedItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ paper: papers, thread: threads, interaction: interactions })
    .from(threads)
    .innerJoin(papers, eq(papers.id, threads.paperId))
    .leftJoin(interactions, eq(interactions.paperId, papers.id))
    .where(
      tab === "saved"
        ? eq(interactions.saved, true)
        : sql`coalesce(${interactions.hidden}, false) = false`,
    )
    .orderBy(tab === "saved" ? desc(interactions.updatedAt) : desc(threads.createdAt))
    .limit(FEED_WINDOW);

  if (tab === "foryou") {
    const now = new Date();
    const rank = (r: FeedItem) =>
      // Papers the reader asked for float to the top until read.
      (r.paper.requested && !r.interaction?.readAt ? 10 : 0) +
      feedRank({
        score: r.paper.score,
        // "New to you": a trending or recommended paper counts as fresh when it was found, not when it was posted.
        publishedAt: new Date(Math.max(r.paper.publishedAt.getTime(), r.paper.createdAt.getTime())),
        read: !!r.interaction?.readAt,
        now,
      });
    rows.sort((a, b) => rank(b) - rank(a));
  } else if (tab === "latest") {
    rows.sort((a, b) => b.paper.publishedAt.getTime() - a.paper.publishedAt.getTime());
  }
  return rows;
}

/** A paper with its thread if one has been written yet. */
export async function getPaperView(
  paperId: string,
): Promise<{ paper: Paper; thread: Thread | null; interaction: Interaction | null } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ paper: papers, thread: threads, interaction: interactions })
    .from(papers)
    .leftJoin(threads, eq(threads.paperId, papers.id))
    .leftJoin(interactions, eq(interactions.paperId, papers.id))
    .where(eq(papers.id, paperId));
  return row ?? null;
}

/** Candidates not yet summarised, best first, plus anything in progress or failed. */
export async function getQueue(): Promise<Paper[]> {
  const db = await getDb();
  return db
    .select()
    .from(papers)
    .where(ne(papers.status, "ready"))
    .orderBy(
      sql`case ${papers.status} when 'summarising' then 0 when 'batched' then 1 when 'failed' then 2 else 3 end`,
      desc(papers.requested),
      desc(papers.score),
      desc(papers.publishedAt),
    )
    .limit(150);
}

export async function getSpend() {
  const db = await getDb();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  // Raw sql params bypass the column's type mapping, so pass an ISO string and cast it; a bare Date
  // is sent as "Sun Nov 01 2026 …" by postgres-js, which Postgres rejects (PGlite happens to accept it).
  const since = sql`${monthStart.toISOString()}::timestamptz`;
  const [row] = await db
    .select({
      month: sql<number>`coalesce(sum(${threads.costUsd}) filter (where ${threads.createdAt} >= ${since}), 0)::float`,
      monthCount: sql<number>`count(*) filter (where ${threads.createdAt} >= ${since})::int`,
      total: sql<number>`coalesce(sum(${threads.costUsd}), 0)::float`,
      count: sql<number>`count(${threads.costUsd})::int`,
    })
    .from(threads);
  return row;
}

export async function getStatusCounts() {
  const db = await getDb();
  const rows = await db
    .select({ status: papers.status, n: sql<number>`count(*)::int` })
    .from(papers)
    .groupBy(papers.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<Paper["status"], number>>;
}

type Flag = "liked" | "saved" | "hidden";

// How much each signal moves the paper's tags in term_affinity.
const AFFINITY_DELTA: Record<Flag, number> = { liked: 1, saved: 1.5, hidden: -1.5 };

/** Toggle a flag and teach the ranker from it via the thread's tags. */
export async function setFlag(paperId: string, flag: Flag, value: boolean): Promise<void> {
  const db = await getDb();
  const [existing] = await db.select().from(interactions).where(eq(interactions.paperId, paperId));
  if ((existing?.[flag] ?? false) === value) return;

  await db
    .insert(interactions)
    .values({ paperId, [flag]: value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: interactions.paperId, set: { [flag]: value, updatedAt: new Date() } });

  const [thread] = await db.select({ tags: threads.tags }).from(threads).where(eq(threads.paperId, paperId));
  if (!thread?.tags.length) return;
  const delta = AFFINITY_DELTA[flag] * (value ? 1 : -1);
  for (const term of thread.tags) {
    await db
      .insert(termAffinity)
      .values({ term, weight: delta })
      .onConflictDoUpdate({
        target: termAffinity.term,
        set: { weight: sql`${termAffinity.weight} + ${delta}`, updatedAt: new Date() },
      });
  }
}

export async function markRead(paperId: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(interactions)
    .values({ paperId, readAt: new Date() })
    .onConflictDoUpdate({
      target: interactions.paperId,
      set: { readAt: sql`coalesce(${interactions.readAt}, now())` },
    });
}

export async function getTopAffinities(limit = 20) {
  const db = await getDb();
  return db
    .select()
    .from(termAffinity)
    .where(ne(termAffinity.weight, 0))
    .orderBy(desc(sql`abs(${termAffinity.weight})`))
    .limit(limit);
}
