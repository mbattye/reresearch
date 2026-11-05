import { fetchJson, normaliseDoi, type Candidate } from "./types";

// INSPIRE-HEP: the particle-physics literature database. No key; ~15 requests per 5 s.
const API = "https://inspirehep.net/api/literature";

interface Hit {
  metadata: {
    titles: { title: string }[];
    abstracts?: { value: string }[];
    authors?: { full_name: string }[];
    arxiv_eprints?: { value: string }[];
    dois?: { value: string }[];
    citation_count?: number;
    earliest_date?: string;
    publication_info?: { journal_title?: string }[];
  };
}

/**
 * What the field is citing: papers from the last `sinceDays` days with at least
 * `minCitations` citations, most cited first. Citations this early are a strong
 * signal that something is being argued about.
 */
export async function fetchTrending(opts: { sinceDays?: number; minCitations?: number; size?: number } = {}): Promise<Candidate[]> {
  const sinceDays = opts.sinceDays ?? 45;
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    q: `de > ${since} and topcite ${opts.minCitations ?? 5}+`,
    sort: "mostcited",
    size: String(opts.size ?? 25),
    fields: "titles,abstracts,authors.full_name,arxiv_eprints,dois,citation_count,earliest_date,publication_info",
  });
  const data = await fetchJson<{ hits: { hits: Hit[] } }>(`${API}?${params}`);

  return data.hits.hits.map(({ metadata: m }) => {
    const cites = m.citation_count ?? 0;
    const date = m.earliest_date ? new Date(m.earliest_date) : undefined;
    const weeks = date ? Math.max(1, Math.round((Date.now() - date.getTime()) / (7 * 86_400_000))) : null;
    return {
      arxivId: m.arxiv_eprints?.[0]?.value,
      doi: m.dois?.[0]?.value ? normaliseDoi(m.dois[0].value) : undefined,
      title: m.titles[0]?.title ?? "Untitled",
      abstract: m.abstracts?.[0]?.value,
      authors: (m.authors ?? []).map((a) => a.full_name),
      publishedAt: date,
      venue: m.publication_info?.[0]?.journal_title,
      citationCount: cites,
      foundVia: "inspire" as const,
      // log scale: 5 citations ~ +1.3, 25 ~ +2.4, 100 ~ +3.5
      boost: Math.log2(1 + cites) * 0.5,
      boostReasons: [{ term: `${cites} citations${weeks ? ` in ${weeks} week${weeks === 1 ? "" : "s"}` : ""} (INSPIRE)`, weight: Math.log2(1 + cites) * 0.5 }],
    };
  });
}
