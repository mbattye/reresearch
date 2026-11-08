import type { FoundVia, NewPaper, ScoreReason } from "../db/schema";

export const USER_AGENT = "reresearch/0.1 (personal research reader)";

/**
 * A paper suggested by a discovery source. Candidates with an arXiv id are
 * re-fetched from arXiv (categories, abstract, and the cheap HTML full text);
 * DOI-only candidates are stored from the source's own metadata.
 */
export interface Candidate {
  arxivId?: string;
  doi?: string;
  title: string;
  abstract?: string;
  authors: string[];
  publishedAt?: Date;
  venue?: string;
  citationCount?: number;
  pdfUrl?: string;
  absUrl?: string;
  foundVia: FoundVia;
  boost: number;
  boostReasons: ScoreReason[];
  institutions?: string[];
  license?: string;
  licenseUrl?: string;
  /** Topic categories from the source, e.g. "biorxiv:genomics". */
  categories?: string[];
}

export function normaliseDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

/** Accepts a bare DOI, "doi:" prefix or doi.org URL. */
export function parseDoi(input: string): string | null {
  const m = input.trim().match(/\b(10\.\d{4,9}\/[^\s"<>]+)/i);
  return m ? normaliseDoi(m[1].replace(/[.,;)]+$/, "")) : null;
}

/** Store a DOI-only candidate as a paper. Null when there is nothing to summarise from. */
export function doiCandidateToPaper(c: Candidate): NewPaper | null {
  if (!c.doi || (!c.abstract && !c.pdfUrl)) return null;
  return {
    id: `doi:${c.doi}`,
    source: "doi",
    externalId: c.doi,
    title: c.title,
    authors: c.authors,
    abstract: c.abstract ?? "",
    categories: c.categories ?? [],
    primaryCategory: c.categories?.[0] ?? null,
    publishedAt: c.publishedAt ?? new Date(),
    absUrl: c.absUrl ?? `https://doi.org/${c.doi}`,
    pdfUrl: c.pdfUrl ?? null,
    doi: c.doi,
    venue: c.venue ?? null,
    citationCount: c.citationCount ?? null,
    foundVia: c.foundVia,
    boost: c.boost,
    boostReasons: c.boostReasons,
    institutions: c.institutions ?? [],
    license: c.license ?? null,
    licenseUrl: c.licenseUrl ?? null,
  };
}

/** GET/POST JSON with a couple of retries on rate limits and server errors. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      const body = await res.text().catch(() => "");
      throw new HttpError(res.status, `${new URL(url).host} returned ${res.status}: ${body.slice(0, 200)}`);
    }
    const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * (attempt + 1);
    await new Promise((r) => setTimeout(r, Math.min(wait, 10_000)));
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
