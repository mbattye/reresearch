import "server-only";
import { and, desc, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Paper, Thread, ThreadJob, UserPaper } from "./db/schema";
import { feedRank } from "./ranking";

const { papers, threads, threadJobs, userPapers, userTerms } = schema;

export type FeedTab = "foryou" | "latest" | "saved" | "queue";

export interface FeedItem {
  paper: Paper;
  thread: Thread;
  /** This reader's score, likes and so on for the paper. */
  interaction: UserPaper;
}

const FEED_WINDOW = 300;

/** Prefer the thread at the reader's level, else the nearest level (ties go to the more detailed one). */
function bestThread(list: Thread[], level: number): Thread {
  return [...list].sort(
    (a, b) => Math.abs(a.readingLevel - level) - Math.abs(b.readingLevel - level) || b.readingLevel - a.readingLevel,
  )[0];
}

export async function getFeed(userId: string, level: number, tab: Exclude<FeedTab, "queue">): Promise<FeedItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ paper: papers, thread: threads, interaction: userPapers })
    .from(userPapers)
    .innerJoin(papers, eq(papers.id, userPapers.paperId))
    .innerJoin(threads, eq(threads.paperId, userPapers.paperId))
    .where(
      and(eq(userPapers.userId, userId), tab === "saved" ? eq(userPapers.saved, true) : eq(userPapers.hidden, false)),
    )
    .orderBy(tab === "saved" ? desc(userPapers.updatedAt) : desc(threads.createdAt))
    .limit(FEED_WINDOW * 3);

  // One item per paper, showing the thread closest to the reader's level.
  const byPaper = new Map<string, { item: FeedItem; threads: Thread[] }>();
  for (const r of rows) {
    const entry = byPaper.get(r.paper.id);
    if (entry) entry.threads.push(r.thread);
    else byPaper.set(r.paper.id, { item: r, threads: [r.thread] });
  }
  const items = [...byPaper.values()].slice(0, FEED_WINDOW).map(({ item, threads: list }) => ({
    ...item,
    thread: bestThread(list, level),
  }));

  if (tab === "foryou") {
    const now = new Date();
    const rank = (r: FeedItem) =>
      // Papers the reader asked for float to the top until read.
      (r.interaction.requested && !r.interaction.readAt ? 10 : 0) +
      feedRank({
        score: r.interaction.score,
        // "New to you": a trending or recommended paper counts as fresh when it was found, not when it was posted.
        publishedAt: new Date(Math.max(r.paper.publishedAt.getTime(), r.interaction.createdAt.getTime())),
        read: !!r.interaction.readAt,
        now,
      });
    items.sort((a, b) => rank(b) - rank(a));
  } else if (tab === "latest") {
    items.sort((a, b) => b.paper.publishedAt.getTime() - a.paper.publishedAt.getTime());
  }
  return items;
}

/** Work in progress is visible to everyone at that level; a failure only to the reader it failed for. */
function visibleJob(userId: string) {
  return or(ne(threadJobs.status, "failed"), eq(threadJobs.userId, userId));
}

export interface PaperView {
  paper: Paper;
  thread: Thread | null;
  interaction: UserPaper | null;
  /** Writing, batched or failed at the reader's level, if anything is. */
  job: ThreadJob | null;
}

/** A paper with the reader's best thread for it (if any has been written) and any job at their level. */
export async function getPaperView(userId: string, paperId: string, level: number): Promise<PaperView | null> {
  const db = await getDb();
  const [paper] = await db.select().from(papers).where(eq(papers.id, paperId));
  if (!paper) return null;
  const [list, [interaction], [job]] = await Promise.all([
    db.select().from(threads).where(eq(threads.paperId, paperId)),
    db.select().from(userPapers).where(and(eq(userPapers.userId, userId), eq(userPapers.paperId, paperId))),
    db
      .select()
      .from(threadJobs)
      .where(and(eq(threadJobs.paperId, paperId), eq(threadJobs.readingLevel, level), visibleJob(userId))),
  ]);
  return { paper, thread: list.length ? bestThread(list, level) : null, interaction: interaction ?? null, job: job ?? null };
}

export interface QueueItem {
  paper: Paper;
  interaction: UserPaper;
  job: ThreadJob | null;
}

/** The reader's papers with no thread yet, best first, with anything in progress or failed on top. */
export async function getQueue(userId: string, level: number): Promise<QueueItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ paper: papers, interaction: userPapers, job: threadJobs })
    .from(userPapers)
    .innerJoin(papers, eq(papers.id, userPapers.paperId))
    .leftJoin(
      threadJobs,
      and(eq(threadJobs.paperId, userPapers.paperId), eq(threadJobs.readingLevel, level), visibleJob(userId)),
    )
    .where(
      and(
        eq(userPapers.userId, userId),
        eq(userPapers.hidden, false),
        notExists(db.select().from(threads).where(eq(threads.paperId, userPapers.paperId))),
      ),
    )
    .orderBy(
      sql`case ${threadJobs.status} when 'writing' then 0 when 'batched' then 1 when 'failed' then 2 else 3 end`,
      desc(userPapers.requested),
      desc(userPapers.score),
      desc(papers.publishedAt),
    )
    .limit(150);
  return rows;
}

/** This reader's spend: threads their key paid for. */
export async function getSpend(userId: string) {
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
    .from(threads)
    .where(eq(threads.writtenBy, userId));
  return row;
}

/** Jobs this reader's key is paying for right now. */
export async function getJobCounts(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ status: threadJobs.status, n: sql<number>`count(*)::int` })
    .from(threadJobs)
    .where(and(eq(threadJobs.userId, userId), ne(threadJobs.status, "failed")))
    .groupBy(threadJobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ThreadJob["status"], number>>;
}

type Flag = "liked" | "saved" | "hidden";

// How much each signal moves the paper's tags in the reader's learned interests.
const AFFINITY_DELTA: Record<Flag, number> = { liked: 1, saved: 1.5, hidden: -1.5 };

/** Toggle a flag and teach this reader's ranker from it via the thread's tags. */
export async function setFlag(userId: string, paperId: string, flag: Flag, value: boolean): Promise<void> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(userPapers)
    .where(and(eq(userPapers.userId, userId), eq(userPapers.paperId, paperId)));
  if ((existing?.[flag] ?? false) === value) return;

  await db
    .insert(userPapers)
    .values({ userId, paperId, [flag]: value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [userPapers.userId, userPapers.paperId],
      set: { [flag]: value, updatedAt: new Date() },
    });

  const tagRows = await db.select({ tags: threads.tags }).from(threads).where(eq(threads.paperId, paperId));
  const tags = [...new Set(tagRows.flatMap((t) => t.tags))];
  if (!tags.length) return;
  const delta = AFFINITY_DELTA[flag] * (value ? 1 : -1);
  for (const term of tags) {
    await db
      .insert(userTerms)
      .values({ userId, term, weight: delta })
      .onConflictDoUpdate({
        target: [userTerms.userId, userTerms.term],
        set: { weight: sql`${userTerms.weight} + ${delta}`, updatedAt: new Date() },
      });
  }
}

export async function markRead(userId: string, paperId: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(userPapers)
    .values({ userId, paperId, readAt: new Date() })
    .onConflictDoUpdate({
      target: [userPapers.userId, userPapers.paperId],
      set: { readAt: sql`coalesce(${userPapers.readAt}, now())` },
    });
}

export async function getTopAffinities(userId: string, limit = 20) {
  const db = await getDb();
  return db
    .select()
    .from(userTerms)
    .where(and(eq(userTerms.userId, userId), ne(userTerms.weight, 0)))
    .orderBy(desc(sql`abs(${userTerms.weight})`))
    .limit(limit);
}

/** Readers the daily run works for: everyone with settings, i.e. who has signed in at least once. */
export async function activeReaders() {
  const db = await getDb();
  return db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(inArray(schema.user.id, db.select({ id: schema.userSettings.userId }).from(schema.userSettings)));
}
