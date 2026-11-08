import type { Keyword, ScoreReason } from "./db/schema";
import { topicsOf, type TopicId } from "./topics";

/**
 * Deliberately simple and explainable: a paper's interest score is the sum of
 * stated keyword weights and learned term affinities that appear in its title
 * (counted double) or abstract. Recency is applied separately at feed time.
 */
export function interestScore(
  paper: { title: string; abstract: string },
  keywords: Keyword[],
  affinity: Map<string, number>,
): { score: number; reasons: ScoreReason[] } {
  const title = paper.title.toLowerCase();
  const abstract = paper.abstract.toLowerCase();
  const reasons: ScoreReason[] = [];
  const seen = new Set<string>();

  const consider = (term: string, weight: number) => {
    const t = term.toLowerCase().trim();
    if (!t || seen.has(t) || weight === 0) return;
    const inTitle = containsTerm(title, t);
    const inAbstract = containsTerm(abstract, t);
    if (!inTitle && !inAbstract) return;
    seen.add(t);
    reasons.push({ term: t, weight: weight * (inTitle ? 2 : 1) });
  };

  for (const k of keywords) consider(k.term, k.weight);
  // Learned affinities count for half a stated keyword.
  for (const [term, w] of affinity) consider(term, w * 0.5);

  reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const score = reasons.reduce((sum, r) => sum + r.weight, 0);
  return { score, reasons };
}

/** Feed ordering: interest, decayed by age, with read posts pushed down. */
export function feedRank(opts: { score: number; publishedAt: Date; read: boolean; now?: Date }): number {
  const now = opts.now ?? new Date();
  const ageDays = Math.max(0, (now.getTime() - opts.publishedAt.getTime()) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / 4); // half-life of four days
  const interest = 1 + Math.max(-0.9, Math.log1p(Math.max(-0.9, opts.score)));
  return interest * (0.35 + recency) * (opts.read ? 0.3 : 1);
}

function containsTerm(haystack: string, term: string): boolean {
  // Whole-word match (plurals allowed), so "higgs" doesn't match "higgsino" and "lhc" stays an acronym.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(s|es)?([^a-z0-9]|$)`, "i").test(haystack);
}

/**
 * Pick `limit` papers from a best-first list without filling every slot with near-duplicates
 * (a burst of papers on one result) or with discovered papers: trending and recommended papers
 * share at most half the slots, so new submissions in the reader's categories always get a look in.
 *
 * Slots go round the reader's topics in turn, those with the fewest recent threads first, so a
 * topic their keywords don't mention (say, chemistry for a physicist) still gets written up.
 */
export function diversify<
  T extends { title: string; score: number; foundVia: string; requested: boolean; categories: string[] },
>(ranked: T[], limit: number, balance?: { topics: TopicId[]; recent: Map<TopicId, number> }): T[] {
  const discoveredCap = Math.max(1, Math.ceil(limit / 2));
  const isDiscovered = (p: T) => p.foundVia === "inspire" || p.foundVia === "semantic-scholar";
  const turnOf = (p: T): string | null => {
    if (isDiscovered(p)) return "discovered";
    return topicsOf(p.categories).find((t) => balance?.topics.includes(t)) ?? null;
  };
  const picked: T[] = [];
  const pool = [...ranked];
  while (picked.length < limit && pool.length) {
    const eligible = (p: T) => p.requested || !isDiscovered(p) || picked.filter(isDiscovered).length < discoveredCap;
    // Whose turn it is: the topic with the fewest picks this run, then the fewest recent threads.
    // Discovered papers go after the reader's own topics, and ties are drawn so no topic always wins.
    const waiting = new Set(pool.filter(eligible).map(turnOf).filter((t) => t !== null));
    const picks = (t: string) => picked.filter((p) => turnOf(p) === t).length;
    const recent = (t: string) => (t === "discovered" ? Infinity : (balance?.recent.get(t as TopicId) ?? 0));
    const draw = new Map([...waiting].map((t) => [t, Math.random()]));
    const turn = balance
      ? [...waiting].sort((a, b) => picks(a) - picks(b) || recent(a) - recent(b) || draw.get(a)! - draw.get(b)!)[0]
      : undefined;

    let best = -1;
    let bestScore = -Infinity;
    pool.forEach((p, i) => {
      if (!eligible(p)) return;
      if (turn && !p.requested && turnOf(p) !== turn) return;
      const overlap = Math.max(0, ...picked.map((q) => titleOverlap(p.title, q.title)));
      const adjusted = (p.requested ? 100 : 0) + p.score - 6 * overlap;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        best = i;
      }
    });
    if (best < 0) break;
    picked.push(pool.splice(best, 1)[0]);
  }
  return picked;
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "for", "to", "with", "from", "at", "by", "via", "using", "as"]);

function titleOverlap(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}
