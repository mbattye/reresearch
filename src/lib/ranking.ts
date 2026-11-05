import type { Keyword, ScoreReason } from "./db/schema";

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
  // Word-boundary match so "lhc" doesn't match inside other words; short acronyms need this most.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}`, "i").test(haystack);
}
