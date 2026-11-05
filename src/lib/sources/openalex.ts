import { parseArxivId } from "./arxiv";
import { fetchJson, HttpError, normaliseDoi, type Candidate } from "./types";

// Free without a key (about 1,000 lookups a day); OPENALEX_API_KEY raises the allowance.
const API = "https://api.openalex.org";

interface Work {
  doi: string | null;
  title: string | null;
  publication_date: string | null;
  cited_by_count: number;
  authorships: { author: { display_name: string } }[];
  abstract_inverted_index: Record<string, number[]> | null;
  primary_location: { source: { display_name: string } | null; landing_page_url: string | null } | null;
  best_oa_location: { pdf_url: string | null; landing_page_url: string | null } | null;
  locations: { landing_page_url: string | null; pdf_url: string | null }[];
}

/** Look up a DOI. Finds the arXiv version if there is one, else the best legal free copy. */
export async function lookupDoi(doi: string): Promise<Candidate | null> {
  const params = new URLSearchParams({
    select:
      "doi,title,publication_date,cited_by_count,authorships,abstract_inverted_index,primary_location,best_oa_location,locations",
  });
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  let w: Work;
  try {
    w = await fetchJson<Work>(`${API}/works/doi:${encodeURIComponent(normaliseDoi(doi))}?${params}`);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
  if (!w.title) return null;

  const arxivUrl = w.locations
    .map((l) => l.landing_page_url ?? l.pdf_url ?? "")
    .find((u) => /arxiv\.org\/(abs|pdf)\//.test(u));
  const arxivId = arxivUrl ? (parseArxivId(arxivUrl) ?? undefined) : undefined;

  return {
    arxivId,
    doi: w.doi ? normaliseDoi(w.doi) : normaliseDoi(doi),
    title: w.title,
    abstract: w.abstract_inverted_index ? rebuildAbstract(w.abstract_inverted_index) : undefined,
    authors: w.authorships.map((a) => a.author.display_name),
    publishedAt: w.publication_date ? new Date(w.publication_date) : undefined,
    venue: w.primary_location?.source?.display_name ?? undefined,
    citationCount: w.cited_by_count,
    pdfUrl: w.best_oa_location?.pdf_url ?? undefined,
    absUrl: w.primary_location?.landing_page_url ?? undefined,
    foundVia: "openalex",
    boost: 0,
    boostReasons: [],
  };
}

/** OpenAlex ships abstracts as word -> positions; put the words back in order. */
function rebuildAbstract(index: Record<string, number[]>): string {
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter(Boolean).join(" ");
}
