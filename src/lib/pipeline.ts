import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getSpend } from "./feed";
import { inspireDetails } from "./sources/metadata";
import type { NewPaper, Paper, Preferences } from "./db/schema";
import { diversify, interestScore } from "./ranking";
import { fetchByIds, fetchRecent, parseArxivId } from "./sources/arxiv";
import { fetchTrending } from "./sources/inspire";
import { lookupDoi } from "./sources/openalex";
import { recommend } from "./sources/semanticscholar";
import { doiCandidateToPaper, parseDoi, type Candidate } from "./sources/types";
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

const { papers, threads, preferences, termAffinity, summaryBatches, interactions } = schema;

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
    effort: prefs.summaryEffort ?? base.effort,
  };
}

export function monthlyBudget(prefs: Preferences): number {
  return prefs.monthlyBudgetUsd ?? (Number(process.env.MONTHLY_BUDGET_USD) || 10);
}

/** Refuse to spend more once this month's summaries have used up the budget. */
async function assertWithinBudget() {
  const prefs = await getPreferences();
  const budget = monthlyBudget(prefs);
  const { month } = await getSpend();
  if (month >= budget) {
    throw new Error(`Monthly budget of $${budget.toFixed(2)} reached ($${month.toFixed(2)} spent). Raise it in Settings.`);
  }
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

export async function getAffinity(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select().from(termAffinity);
  return new Map(rows.map((r) => [r.term, r.weight]));
}

export interface IngestReport {
  fetched: number;
  discovered: number;
  sourceErrors: string[];
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
  const { candidates, errors } = await discover(prefs);
  const discovered = await resolveCandidates(candidates);
  const inserted = await upsertPapers([...fetched, ...discovered], prefs, affinity);

  // Rescore everything still waiting, since interests and affinities change between runs.
  const waiting = await db.select().from(papers).where(eq(papers.status, "new"));
  for (const p of waiting) {
    const { score, reasons } = interestScore(p, prefs.keywords, affinity);
    if (score + p.boost !== p.score) {
      await db.update(papers).set({ score: score + p.boost, scoreReasons: reasons }).where(eq(papers.id, p.id));
    }
  }

  const limit = opts.summarise ?? prefs.summariesPerRun;
  const ranked = await db
    .select()
    .from(papers)
    .where(eq(papers.status, "new"))
    .orderBy(desc(papers.requested), desc(papers.score), desc(papers.publishedAt))
    .limit(400);
  const picks = diversify(ranked, limit);

  if (opts.batch) {
    const collected = await collectBatches();
    const batchId = picks.length ? await submitBatch(picks) : undefined;
    return { fetched: fetched.length, discovered: discovered.length, sourceErrors: errors, inserted, summarised: [], failed: [], batchId, collected };
  }
  const results = await summariseMany(picks);
  return { fetched: fetched.length, discovered: discovered.length, sourceErrors: errors, inserted, ...results };
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
    await assertWithinBudget();
    const config = await getSummaryConfig();
    const inputModes: Record<string, string> = {};
    const requests = [];
    for (const raw of toSend) {
      const p = await enrich(raw);
      const material = await prepareMaterial(p, config);
      await saveInstitutions(p, material.institutions);
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

/** Add specific papers the reader asked for (arXiv ids, DOIs, or links containing either). Returns the paper ids. */
export async function requestPapers(inputs: string[]): Promise<string[]> {
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
      institutions: c.institutions ?? [],
      license: c.license ?? null,
      licenseUrl: c.licenseUrl ?? null,
    });
  }

  if (doiOnly.length) {
    const db = await getDb();
    const known = new Set(
      (await db.select({ doi: papers.doi }).from(papers).where(inArray(papers.doi, doiOnly.map((c) => c.doi!)))).map(
        (r) => r.doi,
      ),
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

/** Candidates from the discovery sources the reader has switched on. One failing source doesn't stop the others. */
async function discover(prefs: Preferences): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const db = await getDb();
  const jobs: Promise<Candidate[]>[] = [];
  if (prefs.sources.inspireTrending) jobs.push(fetchTrending());
  if (prefs.sources.recommendations) {
    const liked = await db
      .select({ id: interactions.paperId, hidden: interactions.hidden })
      .from(interactions)
      .where(sql`${interactions.liked} or ${interactions.saved} or ${interactions.hidden}`)
      .orderBy(desc(interactions.updatedAt))
      .limit(60);
    const positive = liked.filter((r) => !r.hidden).map((r) => r.id).slice(0, 30);
    const negative = liked.filter((r) => r.hidden).map((r) => r.id).slice(0, 15);
    // A handful per run: enough to surface neighbours of what you like without flooding the queue.
    if (positive.length) jobs.push(recommend(positive, negative, 15));
  }
  const settled = await Promise.allSettled(jobs);
  return {
    candidates: settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    errors: settled.flatMap((r) => (r.status === "rejected" ? [String(r.reason?.message ?? r.reason)] : [])),
  };
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
    return { ...p, score: score + (p.boost ?? 0), scoreReasons: reasons };
  });
  const inserted = await db
    .insert(papers)
    .values(rows)
    .onConflictDoUpdate({
      target: papers.id,
      // Keep our own state; refresh what the source may have revised, and keep the strongest boost
      // when several sources find the same paper.
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
    await assertWithinBudget();
    const enriched = await enrich(paper);
    const result = await summarisePaper(enriched, config);
    await saveInstitutions(enriched, result.institutions);
    await saveThread(paper.id, result, false);
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
