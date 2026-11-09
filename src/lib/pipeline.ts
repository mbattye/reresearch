import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, ne, notExists, or, sql } from "drizzle-orm";
import { isAdmin } from "./auth-config";
import { getDb, schema } from "./db";
import type { NewPaper, Paper, Preferences, Provider } from "./db/schema";
import { getSpend } from "./feed";
import { getKeyForWriting, hasKeyFor } from "./keys";
import { costUsd } from "./pricing";
import { providerLabel } from "./providers";
import { diversify, interestScore } from "./ranking";
import { fetchByIds, fetchRecent, parseArxivId } from "./sources/arxiv";
import { fetchBiorxiv } from "./sources/biorxiv";
import { fetchTrending } from "./sources/inspire";
import { inspireDetails } from "./sources/metadata";
import { fetchRecentBySubfields, lookupDoi } from "./sources/openalex";
import { recommend } from "./sources/semanticscholar";
import { doiCandidateToPaper, parseDoi, type Candidate } from "./sources/types";
import {
  anthropicFor,
  buildParams,
  DEFAULT_MODELS,
  defaultConfig,
  parseThread,
  prepareMaterial,
  summarisePaper,
  totalInput,
  type GeneratedThread,
  type SummaryConfig,
  type SummaryResult,
} from "./summarise";
import {
  CATEGORY_GROUPS,
  CATEGORY_LABELS,
  DEFAULT_CATEGORIES,
  DEFAULT_KEYWORDS,
  DEFAULT_SUMMARIES_PER_RUN,
  isArxivCategory,
  topicsOf,
  type TopicId,
} from "./topics";

const { papers, threads, threadJobs, userPapers, userSettings, userTerms, summaryBatches } = schema;

/** Whoever the work is for: their settings, their key, their budget. */
export interface Reader {
  id: string;
  email: string;
}

// A thread that has been "writing" this long died with its function; let it be retried.
const STALE_JOB_MS = 10 * 60 * 1000;
const SUMMARY_CONCURRENCY = 3;
// Live write-ups have to finish inside one function's 300 seconds; batches don't.
const MAX_LIVE_WRITES = 8;

// ---------------------------------------------------------------------------------------------
// Settings

export async function getPreferences(reader: Reader): Promise<Preferences> {
  const db = await getDb();
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, reader.id));
  if (row) return row;
  if (isAdmin(reader.email) && (await claimLegacyData(reader.id))) {
    const [claimed] = await db.select().from(userSettings).where(eq(userSettings.userId, reader.id));
    if (claimed) return claimed;
  }
  const [created] = await db
    .insert(userSettings)
    .values({
      userId: reader.id,
      categories: DEFAULT_CATEGORIES,
      keywords: DEFAULT_KEYWORDS,
      summariesPerRun: DEFAULT_SUMMARIES_PER_RUN,
    })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.select().from(userSettings).where(eq(userSettings.userId, reader.id)))[0];
}

/**
 * Before accounts, everything belonged to one reader. The first admin to sign in inherits it:
 * settings, likes and saves, learned interests, the queue, and any batch still in flight.
 */
async function claimLegacyData(userId: string): Promise<boolean> {
  const db = await getDb();
  const [legacy] = await db.select().from(schema.preferences).where(eq(schema.preferences.id, 1));
  if (!legacy) return false;
  const settings: Omit<typeof legacy, "id"> & { id?: number } = { ...legacy };
  delete settings.id;
  await db.insert(userSettings).values({ ...settings, userId }).onConflictDoNothing();

  // Every paper the old feed knew about, with its score and what the reader did with it.
  await db.execute(sql`
    insert into user_papers (user_id, paper_id, score, score_reasons, requested, liked, saved, hidden, read_at)
    select ${userId}, p.id, p.score, p.score_reasons, p.requested,
           coalesce(i.liked, false), coalesce(i.saved, false), coalesce(i.hidden, false), i.read_at
    from papers p left join interactions i on i.paper_id = p.id
    on conflict do nothing`);
  await db.execute(sql`
    insert into user_terms (user_id, term, weight)
    select ${userId}, term, weight from term_affinity
    on conflict do nothing`);
  await db.update(summaryBatches).set({ userId }).where(isNull(summaryBatches.userId));
  await db.update(threads).set({ writtenBy: userId }).where(isNull(threads.writtenBy));

  await db.delete(schema.interactions);
  await db.delete(schema.termAffinity);
  await db.delete(schema.preferences);
  return true;
}

/** Settings override the environment defaults. */
export function summaryConfigFor(prefs: Preferences): SummaryConfig {
  const base = defaultConfig();
  const provider: Provider = prefs.summaryProvider ?? "anthropic";
  return {
    ...base,
    provider,
    model: prefs.summaryModel ?? DEFAULT_MODELS[provider],
    input: prefs.summaryInput ?? base.input,
    effort: prefs.summaryEffort ?? base.effort,
    level: prefs.readingLevel,
  };
}

export function monthlyBudget(prefs: Preferences): number {
  return prefs.monthlyBudgetUsd ?? (Number(process.env.MONTHLY_BUDGET_USD) || 10);
}

/** Refuse to spend more once this reader's summaries have used up their monthly budget. */
async function assertWithinBudget(reader: Reader, prefs: Preferences) {
  const budget = monthlyBudget(prefs);
  const { month } = await getSpend(reader.id);
  if (month >= budget) {
    throw new Error(`Monthly budget of $${budget.toFixed(2)} reached ($${month.toFixed(2)} spent). Raise it in Settings.`);
  }
}

/** Whether this reader has a usable key for their chosen provider (checked before any work is claimed). */
export async function canWrite(reader: Reader, provider?: Provider): Promise<boolean> {
  const chosen = provider ?? summaryConfigFor(await getPreferences(reader)).provider;
  return hasKeyFor(reader.id, reader.email, chosen);
}

async function requireKey(reader: Reader, provider: Provider): Promise<string> {
  const key = await getKeyForWriting(reader.id, reader.email, provider);
  if (!key) throw new Error(`Add your ${providerLabel(provider)} API key in Settings to write threads.`);
  return key;
}

export async function getAffinity(userId: string): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select().from(userTerms).where(eq(userTerms.userId, userId));
  return new Map(rows.map((r) => [r.term, r.weight]));
}

// ---------------------------------------------------------------------------------------------
// Fetching and ranking

export interface IngestReport {
  fetched: number;
  discovered: number;
  sourceErrors: string[];
  inserted: number;
  summarised: string[];
  failed: { id: string; error: string }[];
  batchId?: string;
  collected?: number;
  picked?: string[];
}

/**
 * Fetch new papers for one reader, score them for that reader, and write up the most
 * interesting few at their reading level. With `batch`, the write-ups go to a half-price
 * Message Batch (Anthropic only) and are collected later; with `defer`, the picks are
 * returned for the caller to write.
 */
export async function ingest(
  reader: Reader,
  opts: { summarise?: number; batch?: boolean; defer?: boolean } = {},
): Promise<IngestReport> {
  const prefs = await getPreferences(reader);
  await clearStaleJobs();

  const fetched = await fetchRecent(prefs.categories, 100);
  const { candidates, errors } = await discover(reader, prefs);
  const discovered = await resolveCandidates(candidates);
  const all = [...fetched, ...discovered];
  const inserted = await upsertPapers(all);
  await scoreForReader(reader.id, prefs, all.map((p) => p.id));
  await rescoreWaiting(reader.id, prefs);

  const config = summaryConfigFor(prefs);
  const batching = !!opts.batch && config.provider === "anthropic";
  const wanted = opts.summarise ?? prefs.summariesPerRun;
  const picks = await pickWaiting(reader.id, prefs, batching ? wanted : Math.min(wanted, MAX_LIVE_WRITES));
  const base = { fetched: fetched.length, discovered: discovered.length, sourceErrors: errors, inserted };

  if (opts.defer) return { ...base, summarised: [], failed: [], picked: picks.map((p) => p.id) };
  if (batching) {
    const collected = await collectBatches(reader.id);
    const batchId = picks.length ? await submitBatch(reader, prefs, picks) : undefined;
    return { ...base, summarised: [], failed: [], batchId, collected };
  }
  return { ...base, ...(await summariseMany(reader, picks)) };
}

/** Papers in this reader's set with no thread at any level yet and nothing in progress, best first. */
async function pickWaiting(userId: string, prefs: Preferences, limit: number): Promise<Paper[]> {
  const db = await getDb();
  const level = prefs.readingLevel;
  const waiting = () =>
    db
      .select({ paper: papers, score: userPapers.score, requested: userPapers.requested })
      .from(userPapers)
      .innerJoin(papers, eq(papers.id, userPapers.paperId))
      .where(
        and(
          eq(userPapers.userId, userId),
          eq(userPapers.hidden, false),
          notExists(db.select().from(threads).where(eq(threads.paperId, userPapers.paperId))),
          // Anything in progress at this level blocks a pick; a failure only blocks the reader it failed for.
          notExists(
            db
              .select()
              .from(threadJobs)
              .where(
                and(
                  eq(threadJobs.paperId, userPapers.paperId),
                  eq(threadJobs.readingLevel, level),
                  or(ne(threadJobs.status, "failed"), eq(threadJobs.userId, userId)),
                ),
              ),
          ),
        ),
      );
  // The newest too, or a topic the reader's keywords don't mention would drop out of a long queue.
  const [best, newest] = await Promise.all([
    waiting().orderBy(desc(userPapers.requested), desc(userPapers.score), desc(papers.publishedAt)).limit(400),
    waiting().orderBy(desc(papers.publishedAt)).limit(200),
  ]);
  const ranked = [...new Map([...best, ...newest].map((r) => [r.paper.id, r])).values()]
    .map((r) => ({ ...r.paper, score: r.score, requested: r.requested }))
    .sort(
      (a, b) =>
        Number(b.requested) - Number(a.requested) || b.score - a.score || b.publishedAt.getTime() - a.publishedAt.getTime(),
    );
  return diversify(ranked, limit, {
    topics: [...new Set(prefs.categories.flatMap((c) => topicsOf([c])))],
    recent: await recentThreadsByTopic(userId),
  });
}

/** How many threads each topic has given this reader in the last fortnight. */
async function recentThreadsByTopic(userId: string): Promise<Map<TopicId, number>> {
  const db = await getDb();
  const rows = await db
    .select({ categories: papers.categories })
    .from(threads)
    .innerJoin(papers, eq(papers.id, threads.paperId))
    .innerJoin(userPapers, and(eq(userPapers.paperId, threads.paperId), eq(userPapers.userId, userId)))
    .where(gt(threads.createdAt, new Date(Date.now() - 14 * 86_400_000)));
  const counts = new Map<TopicId, number>();
  for (const { categories } of rows) for (const t of topicsOf(categories)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

async function scoreForReader(userId: string, prefs: Preferences, paperIds: string[]) {
  if (paperIds.length === 0) return;
  const db = await getDb();
  const affinity = await getAffinity(userId);
  const rows = await db.select().from(papers).where(inArray(papers.id, [...new Set(paperIds)]));
  const values = rows.map((p) => {
    const { score, reasons } = interestScore(p, prefs.keywords, affinity);
    return { userId, paperId: p.id, score: score + p.boost, scoreReasons: reasons };
  });
  for (let i = 0; i < values.length; i += 200) {
    await db
      .insert(userPapers)
      .values(values.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [userPapers.userId, userPapers.paperId],
        set: { score: sql`excluded.score`, scoreReasons: sql`excluded.score_reasons` },
      });
  }
}

/** Interests and learned affinities change between runs, so rescore everything still waiting. */
async function rescoreWaiting(userId: string, prefs: Preferences) {
  const db = await getDb();
  const waiting = await db
    .select({ id: userPapers.paperId })
    .from(userPapers)
    .where(
      and(
        eq(userPapers.userId, userId),
        notExists(db.select().from(threads).where(eq(threads.paperId, userPapers.paperId))),
      ),
    );
  await scoreForReader(
    userId,
    prefs,
    waiting.map((w) => w.id),
  );
}

async function clearStaleJobs() {
  const db = await getDb();
  await db
    .delete(threadJobs)
    .where(and(eq(threadJobs.status, "writing"), lt(threadJobs.updatedAt, new Date(Date.now() - STALE_JOB_MS))));
}

/** Candidates from the discovery sources this reader has switched on. One failing source doesn't stop the others. */
async function discover(reader: Reader, prefs: Preferences): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const db = await getDb();
  const jobs: Promise<Candidate[]>[] = [fetchBiorxiv(prefs.categories), fetchRecentBySubfields(prefs.categories)];
  if (prefs.sources.inspireTrending) jobs.push(fetchTrending());
  if (prefs.sources.recommendations) {
    const signals = await db
      .select({ id: userPapers.paperId, hidden: userPapers.hidden })
      .from(userPapers)
      .where(and(eq(userPapers.userId, reader.id), or(eq(userPapers.liked, true), eq(userPapers.saved, true), eq(userPapers.hidden, true))))
      .orderBy(desc(userPapers.updatedAt))
      .limit(60);
    const positive = signals.filter((r) => !r.hidden).map((r) => r.id).slice(0, 30);
    const negative = signals.filter((r) => r.hidden).map((r) => r.id).slice(0, 15);
    // A handful per run: enough to surface neighbours of what you like without flooding the queue.
    if (positive.length) jobs.push(recommend(positive, negative, 15));
  }
  const settled = await Promise.allSettled(jobs);
  return {
    candidates: settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    errors: settled.flatMap((r) => (r.status === "rejected" ? [String(r.reason?.message ?? r.reason)] : [])),
  };
}

/**
 * Turn source suggestions into papers. Anything with an arXiv id is re-fetched from arXiv
 * (categories, abstract and the cheap HTML full text); the rest keep the source's metadata.
 * A DOI-only candidate already stored under its arXiv id is skipped.
 */
export async function resolveCandidates(list: Candidate[]): Promise<NewPaper[]> {
  const byArxiv = new Map<string, Candidate>();
  const doiOnly: Candidate[] = [];
  for (const c of list) {
    if (c.arxivId) {
      const prev = byArxiv.get(c.arxivId);
      if (!prev || c.boost > prev.boost) byArxiv.set(c.arxivId, c);
    } else if (c.doi) doiOnly.push(c);
  }

  const out: NewPaper[] = [];
  const fromArxiv = await fetchByIds([...byArxiv.keys()]);
  for (const p of fromArxiv) {
    const c = byArxiv.get(p.externalId);
    if (!c) continue;
    out.push({
      ...p,
      doi: p.doi ?? c.doi ?? null,
      venue: p.venue ?? c.venue ?? null,
      citationCount: c.citationCount ?? null,
      foundVia: c.foundVia,
      boost: c.boost,
      boostReasons: c.boostReasons,
      categories: [...new Set([...p.categories, ...(c.categories ?? [])])],
      institutions: c.institutions ?? [],
      license: c.license ?? null,
      licenseUrl: c.licenseUrl ?? null,
    });
  }

  if (doiOnly.length) {
    const db = await getDb();
    const known = new Set(
      // Only arXiv copies: a paper stored under its DOI still has to reach each new reader.
      (
        await db
          .select({ doi: papers.doi })
          .from(papers)
          .where(and(inArray(papers.doi, doiOnly.map((c) => c.doi!)), ne(papers.source, "doi")))
      ).map((r) => r.doi),
    );
    for (const p of fromArxiv) if (p.doi) known.add(p.doi);
    for (const c of doiOnly) {
      if (known.has(c.doi!)) continue;
      const paper = doiCandidateToPaper(c);
      if (paper) out.push(paper);
    }
  }
  return out;
}

/** Papers are shared by everyone; returns how many were new. */
async function upsertPapers(list: NewPaper[]): Promise<number> {
  if (list.length === 0) return 0;
  const db = await getDb();
  const inserted = await db
    .insert(papers)
    .values(list)
    .onConflictDoUpdate({
      target: papers.id,
      // Refresh what the source may have revised, and keep the strongest boost when several
      // sources find the same paper.
      set: {
        title: sql`excluded.title`,
        abstract: sql`excluded.abstract`,
        authors: sql`excluded.authors`,
        categories: sql`excluded.categories`,
        pdfUrl: sql`coalesce(excluded.pdf_url, ${papers.pdfUrl})`,
        doi: sql`coalesce(excluded.doi, ${papers.doi})`,
        venue: sql`coalesce(excluded.venue, ${papers.venue})`,
        citationCount: sql`coalesce(excluded.citation_count, ${papers.citationCount})`,
        boostReasons: sql`case when excluded.boost > ${papers.boost} then excluded.boost_reasons else ${papers.boostReasons} end`,
        boost: sql`greatest(excluded.boost, ${papers.boost})`,
      },
    })
    // xmax = 0 only for rows this statement inserted rather than updated.
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return inserted.filter((r) => r.inserted).length;
}

export interface RandomPick {
  id: string;
  title: string;
  authors: string;
  field: string;
  abstract: string;
  written: boolean;
}

const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

async function newestInCategory(category: string): Promise<NewPaper[]> {
  if (isArxivCategory(category)) return fetchRecent([category], 40);
  const candidates = category.startsWith("biorxiv:") ? await fetchBiorxiv([category]) : await fetchRecentBySubfields([category]);
  return resolveCandidates(candidates);
}

/**
 * A recent paper from any field, ignoring the reader's settings: a random group first, so physics's
 * long list doesn't dominate, then a category in it. Stored in the shared catalogue so it can be
 * linked to, but with no row for this reader, so it changes nothing unless they open it.
 */
export async function randomPaper(reader: Reader): Promise<RandomPick | null> {
  const db = await getDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const category = pickOne(Object.keys(pickOne(CATEGORY_GROUPS).labels));
    const found = await newestInCategory(category).catch(() => []);
    const readable = found.filter((p) => p.abstract.length > 100);
    if (readable.length === 0) continue;
    const known = await db
      .select({ id: userPapers.paperId })
      .from(userPapers)
      .where(and(eq(userPapers.userId, reader.id), inArray(userPapers.paperId, readable.map((p) => p.id))));
    const seen = new Set(known.map((k) => k.id));
    const fresh = readable.filter((p) => !seen.has(p.id));
    if (fresh.length === 0) continue;

    const paper = pickOne(fresh);
    await upsertPapers([paper]);
    const [thread] = await db.select({ id: threads.paperId }).from(threads).where(eq(threads.paperId, paper.id)).limit(1);
    const authors = paper.authors.length > 3 ? `${paper.authors.slice(0, 3).join(", ")} and others` : paper.authors.join(", ");
    return {
      id: paper.id,
      title: paper.title,
      authors,
      field: CATEGORY_LABELS[category] ?? category,
      abstract: paper.abstract.replace(/^\s*abstract[\s:.-]*/i, ""),
      written: !!thread,
    };
  }
  return null;
}

/** Add specific papers the reader asked for (arXiv ids, DOIs, or links containing either). Returns the paper ids. */
export async function requestPapers(reader: Reader, inputs: string[]): Promise<string[]> {
  const candidates: Candidate[] = [];
  const unknown: string[] = [];
  for (const input of new Set(inputs)) {
    const arxivId = /arxiv/i.test(input) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(input.trim()) ? parseArxivId(input) : null;
    const doi = arxivId ? null : parseDoi(input);
    if (arxivId) {
      candidates.push({ arxivId, title: "", authors: [], foundVia: "request", boost: 0, boostReasons: [] });
    } else if (doi) {
      const found = await lookupDoi(doi);
      if (found) candidates.push({ ...found, foundVia: "request" });
      else unknown.push(input);
    } else {
      unknown.push(input);
    }
  }
  if (candidates.length === 0) {
    throw new Error(`Couldn't find an arXiv id or DOI in ${unknown.join(", ") || "that"}`);
  }
  const found = await resolveCandidates(candidates);
  if (found.length === 0) throw new Error("Found the paper, but no abstract or free full text to summarise");

  const prefs = await getPreferences(reader);
  await upsertPapers(found);
  const paperIds = found.map((p) => p.id);
  await scoreForReader(reader.id, prefs, paperIds);
  const db = await getDb();
  await db
    .update(userPapers)
    .set({ requested: true, hidden: false, updatedAt: new Date() })
    .where(and(eq(userPapers.userId, reader.id), inArray(userPapers.paperId, paperIds)));
  // A manual request retries anything that failed before.
  await db
    .delete(threadJobs)
    .where(and(inArray(threadJobs.paperId, paperIds), eq(threadJobs.status, "failed")));
  return paperIds;
}

// ---------------------------------------------------------------------------------------------
// Writing threads

/** Write threads for these papers at the reader's level (skipping any that already exist there). */
export async function summariseByIds(reader: Reader, ids: string[]) {
  if (ids.length === 0) return { summarised: [], failed: [] };
  const db = await getDb();
  const rows = await db.select().from(papers).where(inArray(papers.id, ids));
  return summariseMany(reader, rows);
}

async function summariseMany(reader: Reader, list: Paper[]) {
  const prefs = await getPreferences(reader);
  const config = summaryConfigFor(prefs);
  const summarised: string[] = [];
  const failed: { id: string; error: string }[] = [];
  // No key: say so without recording a failed attempt against every paper.
  if (!(await canWrite(reader, config.provider))) {
    const error = `Add your ${providerLabel(config.provider)} API key in Settings to write threads.`;
    return { summarised, failed: list.map((p) => ({ id: p.id, error })) };
  }
  const queue = [...list];

  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        if (await writeThread(reader, prefs, config, p)) summarised.push(p.id);
      } catch (err) {
        failed.push({ id: p.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SUMMARY_CONCURRENCY, queue.length) }, worker));
  return { summarised, failed };
}

/** Claim (paper, level) so nobody writes it twice; false if a thread or a job already exists. */
async function claimJob(paperId: string, level: number, userId: string, status: "writing" | "batched") {
  const db = await getDb();
  const [existing] = await db
    .select({ paperId: threads.paperId })
    .from(threads)
    .where(and(eq(threads.paperId, paperId), eq(threads.readingLevel, level)));
  if (existing) return false;
  const claimed = await db
    .insert(threadJobs)
    .values({ paperId, readingLevel: level, status, userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [threadJobs.paperId, threadJobs.readingLevel],
      set: { status, userId, error: null, updatedAt: new Date() },
      // Only take over a failed job; never one that's in progress.
      setWhere: eq(threadJobs.status, "failed"),
    })
    .returning({ paperId: threadJobs.paperId });
  return claimed.length > 0;
}

async function writeThread(
  reader: Reader,
  prefs: Preferences,
  config: SummaryConfig,
  paper: Paper,
  { claimed = false } = {},
) {
  if (!claimed && !(await claimJob(paper.id, config.level, reader.id, "writing"))) return false;
  try {
    await assertWithinBudget(reader, prefs);
    const key = await requireKey(reader, config.provider);
    const enriched = await enrich(paper);
    const result = await summarisePaper(enriched, config, key);
    await saveInstitutions(enriched, result.institutions);
    await saveThread(paper.id, reader.id, result, false);
    return true;
  } catch (err) {
    await markFailed(paper.id, config.level, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Mark a rewrite as under way, so the page that asked for it can show that straight away.
 * False if one is running or that level is already written: a saved thread is never paid for twice.
 */
export async function claimRewrite(reader: Reader, paperId: string): Promise<boolean> {
  const prefs = await getPreferences(reader);
  return claimJob(paperId, prefs.readingLevel, reader.id, "writing");
}

/** Write one paper at the reader's level (claimed with claimRewrite), keeping the versions at other levels. */
export async function rewriteForReader(reader: Reader, paperId: string) {
  const db = await getDb();
  const [paper] = await db.select().from(papers).where(eq(papers.id, paperId));
  if (!paper) return;
  const prefs = await getPreferences(reader);
  await writeThread(reader, prefs, summaryConfigFor(prefs), paper, { claimed: true }).catch(() => undefined);
}

/** Send papers to the Message Batches API (50% off; results usually within the hour, always within 24h). */
export async function submitBatch(reader: Reader, prefs: Preferences, list: Paper[]): Promise<string | undefined> {
  const config = summaryConfigFor(prefs);
  if (!(await canWrite(reader, "anthropic"))) return undefined;
  const claimed: Paper[] = [];
  for (const p of list) if (await claimJob(p.id, config.level, reader.id, "batched")) claimed.push(p);
  if (claimed.length === 0) return undefined;

  const db = await getDb();
  try {
    await assertWithinBudget(reader, prefs);
    const key = await requireKey(reader, "anthropic");
    const inputModes: Record<string, string> = {};
    const requests = [];
    for (const raw of claimed) {
      const p = await enrich(raw);
      const material = await prepareMaterial(p, config);
      await saveInstitutions(p, material.institutions);
      inputModes[p.id] = material.mode;
      // custom_id allows only [a-zA-Z0-9_-]; map back via the stored paper list.
      requests.push({ custom_id: `p${requests.length}`, params: buildParams(p, material, config) });
    }
    const batch = await anthropicFor(key).messages.batches.create({ requests });
    await db.insert(summaryBatches).values({
      id: batch.id,
      userId: reader.id,
      paperIds: claimed.map((p) => p.id),
      model: config.model,
      readingLevel: config.level,
      inputModes,
    });
    await db
      .update(threadJobs)
      .set({ batchId: batch.id })
      .where(and(inArray(threadJobs.paperId, claimed.map((p) => p.id)), eq(threadJobs.readingLevel, config.level)));
    return batch.id;
  } catch (err) {
    await db
      .delete(threadJobs)
      .where(and(inArray(threadJobs.paperId, claimed.map((p) => p.id)), eq(threadJobs.readingLevel, config.level)));
    throw err;
  }
}

/** Save results from finished batches (one reader's, or everyone's). Returns how many threads were written. */
export async function collectBatches(userId?: string): Promise<number> {
  const db = await getDb();
  const pending = await db
    .select({ batch: summaryBatches, email: schema.user.email })
    .from(summaryBatches)
    .innerJoin(schema.user, eq(schema.user.id, summaryBatches.userId))
    .where(and(eq(summaryBatches.status, "pending"), userId ? eq(summaryBatches.userId, userId) : undefined));
  let written = 0;
  for (const { batch: b, email } of pending) {
    const key = await getKeyForWriting(b.userId!, email, "anthropic");
    if (!key) continue;
    const client = anthropicFor(key);
    const batch = await client.messages.batches.retrieve(b.id);
    if (batch.processing_status !== "ended") continue;

    const done = new Set<string>();
    for await (const r of await client.messages.batches.results(b.id)) {
      const paperId = b.paperIds[Number(r.custom_id.slice(1))];
      if (!paperId) continue;
      done.add(paperId);
      if (r.result.type !== "succeeded") {
        await markFailed(paperId, b.readingLevel, `Batch request ${r.result.type}`);
        continue;
      }
      const message = r.result.message;
      try {
        const inputTokens = totalInput(message.usage);
        await saveThread(
          paperId,
          b.userId!,
          {
            thread: parseThread(message),
            level: b.readingLevel,
            inputMode: (b.inputModes[paperId] ?? "abstract") as SummaryResult["inputMode"],
            model: message.model,
            inputTokens,
            outputTokens: message.usage.output_tokens,
            costUsd: costUsd({ model: message.model, inputTokens, outputTokens: message.usage.output_tokens, batch: true }),
          },
          true,
        );
        written++;
      } catch (err) {
        await markFailed(paperId, b.readingLevel, err instanceof Error ? err.message : String(err));
      }
    }
    // Anything the batch didn't return can be picked again.
    const missing = b.paperIds.filter((id) => !done.has(id));
    if (missing.length) {
      await db
        .delete(threadJobs)
        .where(and(inArray(threadJobs.paperId, missing), eq(threadJobs.readingLevel, b.readingLevel)));
    }
    await db.update(summaryBatches).set({ status: "collected", collectedAt: new Date() }).where(eq(summaryBatches.id, b.id));
  }
  return written;
}

/**
 * Fill in institutions, collaboration, licence (and DOI/journal if missing) just before a paper is
 * written up, so it can be credited properly. Best effort: a failed lookup never blocks a summary.
 */
async function enrich(paper: Paper): Promise<Paper> {
  if (paper.source !== "arxiv" || paper.institutions.length) return paper;
  const details = await inspireDetails(paper.externalId).catch(() => null);
  if (!details) return paper;
  const patch = {
    institutions: details.institutions,
    collaboration: details.collaboration ?? paper.collaboration,
    license: details.license ?? paper.license,
    licenseUrl: details.licenseUrl ?? paper.licenseUrl,
    doi: paper.doi ?? details.doi ?? null,
    venue: paper.venue ?? details.venue ?? null,
  };
  const db = await getDb();
  await db.update(papers).set(patch).where(eq(papers.id, paper.id));
  return { ...paper, ...patch };
}

async function saveInstitutions(paper: Paper, found: string[] | undefined) {
  if (paper.institutions.length || !found?.length) return;
  const db = await getDb();
  await db.update(papers).set({ institutions: found }).where(eq(papers.id, paper.id));
}

async function saveThread(paperId: string, writtenBy: string, r: SummaryResult, batched: boolean) {
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
    readingLevel: r.level,
    writtenBy,
    batched,
    createdAt: new Date(),
  };
  await db
    .insert(threads)
    .values(values)
    .onConflictDoUpdate({ target: [threads.paperId, threads.readingLevel], set: values });
  await db.delete(threadJobs).where(and(eq(threadJobs.paperId, paperId), eq(threadJobs.readingLevel, r.level)));
}

async function markFailed(paperId: string, level: number, message: string) {
  const db = await getDb();
  await db
    .update(threadJobs)
    .set({ status: "failed", error: message.slice(0, 1000), updatedAt: new Date() })
    .where(and(eq(threadJobs.paperId, paperId), eq(threadJobs.readingLevel, level)));
}
