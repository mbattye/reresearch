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
      feedRank({ score: r.paper.score, publishedAt: r.paper.publishedAt, read: !!r.interaction?.readAt, now });
    rows.sort((a, b) => rank(b) - rank(a));
  } else if (tab === "latest") {
    rows.sort((a, b) => b.paper.publishedAt.getTime() - a.paper.publishedAt.getTime());
  }
  return rows;
}

export async function getThread(paperId: string): Promise<FeedItem | null> {
  const db = await getDb();
  const [row] = await db
    .select({ paper: papers, thread: threads, interaction: interactions })
    .from(threads)
    .innerJoin(papers, eq(papers.id, threads.paperId))
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
      sql`case ${papers.status} when 'summarising' then 0 when 'failed' then 1 else 2 end`,
      desc(papers.requested),
      desc(papers.score),
      desc(papers.publishedAt),
    )
    .limit(150);
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
