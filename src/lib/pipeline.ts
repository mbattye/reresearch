import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { NewPaper, Paper, Preferences } from "./db/schema";
import { interestScore } from "./ranking";
import { fetchByIds, fetchRecent, parseArxivId } from "./sources/arxiv";
import {
  anthropic,
  buildParams,
  defaultConfig,
  parseThread,
  prepareMaterial,
  summarisePaper,
  totalInput,
  type GeneratedThread,
  type SummaryConfig,
  type SummaryResult,
} from "./summarise";
import { costUsd } from "./pricing";
import { DEFAULT_CATEGORIES, DEFAULT_KEYWORDS, DEFAULT_SUMMARIES_PER_RUN } from "./topics";

const { papers, threads, preferences, termAffinity, summaryBatches } = schema;

// A summary that has been "summarising" this long died with its function; let it be retried.
const STALE_SUMMARY_MS = 10 * 60 * 1000;
const SUMMARY_CONCURRENCY = 3;

export async function getPreferences(): Promise<Preferences> {
  const db = await getDb();
  const [row] = await db.select().from(preferences).where(eq(preferences.id, 1));
  if (row) return row;
  const [created] = await db
    .insert(preferences)
    .values({
      id: 1,
      categories: DEFAULT_CATEGORIES,
      keywords: DEFAULT_KEYWORDS,
      summariesPerRun: DEFAULT_SUMMARIES_PER_RUN,
    })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.select().from(preferences).where(eq(preferences.id, 1)))[0];
}

/** Settings override the environment defaults. */
export async function getSummaryConfig(): Promise<SummaryConfig> {
  const prefs = await getPreferences();
  const base = defaultConfig();
  return {
    ...base,
    model: prefs.summaryModel ?? base.model,
    input: prefs.summaryInput ?? base.input,
  };
}

export async function getAffinity(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select().from(termAffinity);
  return new Map(rows.map((r) => [r.term, r.weight]));
}

export interface IngestReport {
  fetched: number;
  inserted: number;
  summarised: string[];
  failed: { id: string; error: string }[];
  batchId?: string;
  collected?: number;
}

/**
 * Fetch new papers for the reader's categories, score them, and summarise the most interesting few.
 * With `batch`, the summaries go to a half-price Message Batch and are collected on a later call
 * (each cron run, and while the app is open) instead of being written now.
 */
export async function ingest(opts: { summarise?: number; batch?: boolean } = {}): Promise<IngestReport> {
  const db = await getDb();
  const prefs = await getPreferences();
  const affinity = await getAffinity();

  await db
    .update(papers)
    .set({ status: "new", statusChangedAt: new Date() })
    .where(and(eq(papers.status, "summarising"), lt(papers.statusChangedAt, new Date(Date.now() - STALE_SUMMARY_MS))));

  const fetched = await fetchRecent(prefs.categories, 100);
  const inserted = await upsertPapers(fetched, prefs, affinity);

  // Rescore everything still waiting, since interests and affinities change between runs.
  const waiting = await db.select().from(papers).where(eq(papers.status, "new"));
  for (const p of waiting) {
    const { score, reasons } = interestScore(p, prefs.keywords, affinity);
    if (score !== p.score) {
      await db.update(papers).set({ score, scoreReasons: reasons }).where(eq(papers.id, p.id));
    }
  }

  const limit = opts.summarise ?? prefs.summariesPerRun;
  const picks = await db
    .select()
    .from(papers)
    .where(eq(papers.status, "new"))
    .orderBy(desc(papers.requested), desc(papers.score), desc(papers.publishedAt))
    .limit(limit);

  if (opts.batch) {
    const collected = await collectBatches();
    const batchId = picks.length ? await submitBatch(picks) : undefined;
    return { fetched: fetched.length, inserted, summarised: [], failed: [], batchId, collected };
  }
  const results = await summariseMany(picks);
  return { fetched: fetched.length, inserted, ...results };
}

/** Send papers to the Message Batches API (50% off; results usually within the hour, always within 24h). */
export async function submitBatch(list: Paper[]): Promise<string | undefined> {
  const db = await getDb();
  const ids = list.map((p) => p.id);
  const claimed = await db
    .update(papers)
    .set({ status: "batched", statusChangedAt: new Date(), error: null })
    .where(and(inArray(papers.id, ids), inArray(papers.status, ["new", "failed"])))
    .returning({ id: papers.id });
  const claimedIds = new Set(claimed.map((c) => c.id));
  const toSend = list.filter((p) => claimedIds.has(p.id));
  if (toSend.length === 0) return undefined;

  try {
    const config = await getSummaryConfig();
    const inputModes: Record<string, string> = {};
    const requests = [];
    for (const p of toSend) {
      const material = await prepareMaterial(p, config);
      inputModes[p.id] = material.mode;
      // custom_id allows only [a-zA-Z0-9_-]; map back via the stored paper list.
      requests.push({ custom_id: `p${requests.length}`, params: buildParams(p, material, config) });
    }
    const batch = await anthropic().messages.batches.create({ requests });
    await db.insert(summaryBatches).values({
      id: batch.id,
      paperIds: toSend.map((p) => p.id),
      model: config.model,
      inputModes,
    });
    return batch.id;
  } catch (err) {
    await db
      .update(papers)
      .set({ status: "new", statusChangedAt: new Date() })
      .where(inArray(papers.id, [...claimedIds]));
    throw err;
  }
}

/** Save results from any finished batches. Returns how many threads were written. */
export async function collectBatches(): Promise<number> {
  const db = await getDb();
  const pending = await db.select().from(summaryBatches).where(eq(summaryBatches.status, "pending"));
  let written = 0;
  for (const b of pending) {
    const batch = await anthropic().messages.batches.retrieve(b.id);
    if (batch.processing_status !== "ended") continue;

    const done = new Set<string>();
    for await (const r of await anthropic().messages.batches.results(b.id)) {
      const paperId = b.paperIds[Number(r.custom_id.slice(1))];
      if (!paperId) continue;
      done.add(paperId);
      if (r.result.type !== "succeeded") {
        await markFailed(paperId, `Batch request ${r.result.type}`);
        continue;
      }
      const message = r.result.message;
      try {
        const inputTokens = totalInput(message.usage);
        await saveThread(paperId, {
          thread: parseThread(message),
          inputMode: (b.inputModes[paperId] ?? "abstract") as SummaryResult["inputMode"],
          model: message.model,
          inputTokens,
          outputTokens: message.usage.output_tokens,
          costUsd: costUsd({ model: message.model, inputTokens, outputTokens: message.usage.output_tokens, batch: true }),
        }, true);
        written++;
      } catch (err) {
        await markFailed(paperId, err instanceof Error ? err.message : String(err));
      }
    }
    // Anything the batch didn't return goes back in the queue.
    const missing = b.paperIds.filter((id) => !done.has(id));
    if (missing.length) {
      await db
        .update(papers)
        .set({ status: "new", statusChangedAt: new Date() })
        .where(and(inArray(papers.id, missing), eq(papers.status, "batched")));
    }
    await db
      .update(summaryBatches)
      .set({ status: "collected", collectedAt: new Date() })
      .where(eq(summaryBatches.id, b.id));
  }
  return written;
}

/** Add specific papers the reader asked for (arXiv ids or URLs). Returns the paper ids. */
export async function requestPapers(inputs: string[]): Promise<string[]> {
  const ids = [...new Set(inputs.map(parseArxivId).filter((x): x is string => !!x))];
  if (ids.length === 0) throw new Error("Couldn't find an arXiv id in that");
  const found = await fetchByIds(ids);
  if (found.length === 0) throw new Error("arXiv didn't return that paper");

  const db = await getDb();
  const prefs = await getPreferences();
  const affinity = await getAffinity();
  await upsertPapers(found, prefs, affinity);
  const paperIds = found.map((p) => p.id);
  await db
    .update(papers)
    .set({ requested: true })
    .where(inArray(papers.id, paperIds));
  // Requeue failed ones so a manual request retries them.
  await db
    .update(papers)
    .set({ status: "new", error: null, statusChangedAt: new Date() })
    .where(and(inArray(papers.id, paperIds), eq(papers.status, "failed")));
  return paperIds;
}

/** Summarise specific papers now (used for reader requests and the "summarise" button in the queue). */
export async function summariseByIds(ids: string[]) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(papers)
    .where(and(inArray(papers.id, ids), inArray(papers.status, ["new", "failed"])));
  return summariseMany(rows);
}

async function upsertPapers(list: NewPaper[], prefs: Preferences, affinity: Map<string, number>) {
  if (list.length === 0) return 0;
  const db = await getDb();
  const rows = list.map((p) => {
    const { score, reasons } = interestScore(p, prefs.keywords, affinity);
    return { ...p, score, scoreReasons: reasons };
  });
  const inserted = await db
    .insert(papers)
    .values(rows)
    .onConflictDoUpdate({
      target: papers.id,
      // Keep our own state; refresh what arXiv may have revised.
      set: {
        title: sql`excluded.title`,
        abstract: sql`excluded.abstract`,
        authors: sql`excluded.authors`,
        categories: sql`excluded.categories`,
        pdfUrl: sql`excluded.pdf_url`,
      },
    })
    // xmax = 0 only for rows this statement inserted rather than updated.
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return inserted.filter((r) => r.inserted).length;
}

async function summariseMany(list: Paper[]) {
  const config = await getSummaryConfig();
  const summarised: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const queue = [...list];

  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        await summariseOne(p, config);
        summarised.push(p.id);
      } catch (err) {
        failed.push({ id: p.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SUMMARY_CONCURRENCY, queue.length) }, worker));
  return { summarised, failed };
}

async function summariseOne(paper: Paper, config: SummaryConfig) {
  const db = await getDb();
  // Claim the paper so concurrent runs don't summarise it twice.
  const claimed = await db
    .update(papers)
    .set({ status: "summarising", statusChangedAt: new Date(), error: null })
    .where(and(eq(papers.id, paper.id), inArray(papers.status, ["new", "failed"])))
    .returning({ id: papers.id });
  if (claimed.length === 0) return;

  try {
    await saveThread(paper.id, await summarisePaper(paper, config), false);
  } catch (err) {
    await markFailed(paper.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function saveThread(paperId: string, r: SummaryResult, batched: boolean) {
  const db = await getDb();
  const t: GeneratedThread = r.thread;
  const values = {
    paperId,
    headline: t.headline,
    hook: t.hook,
    posts: t.posts,
    tldr: t.tldr,
    keyNumbers: t.key_numbers,
    tags: t.tags.map((x) => x.toLowerCase().replace(/^#/, "")),
    level: t.level,
    paperType: t.paper_type,
    inputMode: r.inputMode,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd,
    batched,
    createdAt: new Date(),
  };
  await db.insert(threads).values(values).onConflictDoUpdate({ target: threads.paperId, set: values });
  await db.update(papers).set({ status: "ready", statusChangedAt: new Date() }).where(eq(papers.id, paperId));
}

async function markFailed(paperId: string, message: string) {
  const db = await getDb();
  await db
    .update(papers)
    .set({ status: "failed", error: message.slice(0, 1000), statusChangedAt: new Date() })
    .where(eq(papers.id, paperId));
}
