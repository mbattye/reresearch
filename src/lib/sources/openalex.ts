import { parseArxivId } from "./arxiv";
import { uniqueInstitutions } from "./metadata";
import { fetchJson, HttpError, normaliseDoi, type Candidate } from "./types";

// Free without a key (about 1,000 lookups a day); OPENALEX_API_KEY raises the allowance.
const API = "https://api.openalex.org";

interface Work {
  doi: string | null;
  title: string | null;
  publication_date: string | null;
  cited_by_count: number;
  authorships: { author: { display_name: string }; institutions: { display_name: string }[]; raw_affiliation_strings?: string[] }[];
  abstract_inverted_index: Record<string, number[]> | null;
  primary_location: { source: { display_name: string } | null; landing_page_url: string | null } | null;
  best_oa_location: { pdf_url: string | null; landing_page_url: string | null; license: string | null } | null;
  locations: { landing_page_url: string | null; pdf_url: string | null }[];
}

const WORK_FIELDS =
  "doi,title,publication_date,cited_by_count,authorships,abstract_inverted_index,primary_location,best_oa_location,locations";

/** Look up a DOI. Finds the arXiv version if there is one, else the best legal free copy. */
export async function lookupDoi(doi: string): Promise<Candidate | null> {
  const params = new URLSearchParams({ select: WORK_FIELDS });
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  let w: Work;
  try {
    w = await fetchJson<Work>(`${API}/works/doi:${encodeURIComponent(normaliseDoi(doi))}?${params}`);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
  if (!w.title) return null;
  return toCandidate(w, doi);
}

function toCandidate(w: Work, doi: string): Candidate {
  const arxivUrl = w.locations
    .map((l) => l.landing_page_url ?? l.pdf_url ?? "")
    .find((u) => /arxiv\.org\/(abs|pdf)\//.test(u));
  const arxivId = arxivUrl ? (parseArxivId(arxivUrl) ?? undefined) : undefined;

  return {
    arxivId,
    doi: w.doi ? normaliseDoi(w.doi) : normaliseDoi(doi),
    title: w.title ?? "",
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
    institutions: uniqueInstitutions(w.authorships.flatMap((a) => a.institutions.map((i) => i.display_name))),
    license: w.best_oa_location?.license ? w.best_oa_location.license.toUpperCase().replace(/^CC-/, "CC ") : undefined,
  };
}

export const OPENALEX_PREFIX = "openalex:";

// These block automated downloads, so a thread would only ever see the abstract.
const UNREADABLE_PDF_HOSTS = /(^|\.)(chemrxiv\.org|pubs\.acs\.org)$/;
const RECENT_DAYS = 7;

/** Recent open-access papers in these OpenAlex subfields (given as "openalex:<id>") with a PDF we can read. */
export async function fetchRecentBySubfields(categories: string[]): Promise<Candidate[]> {
  const ids = categories.filter((c) => c.startsWith(OPENALEX_PREFIX)).map((c) => c.slice(OPENALEX_PREFIX.length));
  if (ids.length === 0) return [];
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    filter: `primary_topic.subfield.id:${ids.join("|")},is_oa:true,has_abstract:true,type:article|preprint,from_publication_date:${since}`,
    sort: "publication_date:desc",
    "per-page": "200",
    select: `${WORK_FIELDS},primary_topic`,
  });
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  const { results } = await fetchJson<{ results: (Work & { primary_topic: { subfield: { id: string } } | null })[] }>(
    `${API}/works?${params}`,
  );
  return results.flatMap((w) => {
    const pdf = w.best_oa_location?.pdf_url;
    if (!w.title || !w.doi || !pdf || UNREADABLE_PDF_HOSTS.test(new URL(pdf).hostname)) return [];
    const subfield = w.primary_topic?.subfield.id.split("/").pop();
    return [{ ...toCandidate(w, w.doi), categories: subfield ? [`${OPENALEX_PREFIX}${subfield}`] : [] }];
  });
}

/** OpenAlex ships abstracts as word -> positions; put the words back in order. */
function rebuildAbstract(index: Record<string, number[]>): string {
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter(Boolean).join(" ");
}
