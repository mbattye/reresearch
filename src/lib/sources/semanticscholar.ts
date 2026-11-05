import { fetchJson, HttpError, normaliseDoi, type Candidate } from "./types";

// Semantic Scholar recommendations. Works without a key on a shared, often busy quota;
// S2_API_KEY (free on request) gives a dedicated one.
const API = "https://api.semanticscholar.org/recommendations/v1/papers";
const RECOMMENDED_BOOST = 2;

interface S2Paper {
  title: string;
  abstract: string | null;
  authors: { name: string }[];
  externalIds: { ArXiv?: string; DOI?: string } | null;
  publicationDate: string | null;
  venue: string | null;
  citationCount: number | null;
  openAccessPdf: { url: string | null } | null;
  url: string | null;
}

/** Our paper id ("arxiv:…" / "doi:…") in Semantic Scholar's id format. */
export function toS2Id(paperId: string): string | null {
  if (paperId.startsWith("arxiv:")) return `ARXIV:${paperId.slice(6)}`;
  if (paperId.startsWith("doi:")) return `DOI:${paperId.slice(4)}`;
  return null;
}

/** Papers similar to the liked ones and unlike the hidden ones. Empty when none of them are indexed yet. */
export async function recommend(positive: string[], negative: string[], limit = 40): Promise<Candidate[]> {
  const pos = positive.map(toS2Id).filter((x): x is string => !!x);
  if (pos.length === 0) return [];
  const neg = negative.map(toS2Id).filter((x): x is string => !!x);
  const params = new URLSearchParams({
    limit: String(limit),
    fields: "title,abstract,authors,externalIds,publicationDate,venue,citationCount,openAccessPdf,url",
  });

  let data: { recommendedPapers: S2Paper[] };
  try {
    data = await fetchJson(`${API}?${params}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.S2_API_KEY ? { "x-api-key": process.env.S2_API_KEY } : {}),
      },
      body: JSON.stringify({ positivePaperIds: pos, negativePaperIds: neg }),
    });
  } catch (err) {
    // 400 "No positive paper examples given": the liked papers are too new to be indexed (a few days).
    if (err instanceof HttpError && err.status === 400) return [];
    throw err;
  }

  return data.recommendedPapers.map((p) => ({
    arxivId: p.externalIds?.ArXiv,
    doi: p.externalIds?.DOI ? normaliseDoi(p.externalIds.DOI) : undefined,
    title: p.title,
    abstract: p.abstract ?? undefined,
    authors: p.authors.map((a) => a.name),
    publishedAt: p.publicationDate ? new Date(p.publicationDate) : undefined,
    venue: p.venue || undefined,
    citationCount: p.citationCount ?? undefined,
    pdfUrl: p.openAccessPdf?.url || undefined,
    absUrl: p.url ?? undefined,
    foundVia: "semantic-scholar" as const,
    boost: RECOMMENDED_BOOST,
    boostReasons: [{ term: "similar to papers you liked (Semantic Scholar)", weight: RECOMMENDED_BOOST }],
  }));
}
