import { XMLParser } from "fast-xml-parser";
import type { NewPaper } from "../db/schema";

const API = "https://export.arxiv.org/api/query";
// arXiv asks clients to identify themselves and keep to roughly one request every three seconds.
const USER_AGENT = "reresearch/0.1 (personal research reader)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => ["entry", "author", "category", "link"].includes(name),
});

interface AtomEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  author?: { name: string }[];
  category?: { term: string }[];
  link?: { href: string; rel?: string; type?: string; title?: string }[];
  "arxiv:primary_category"?: { term: string };
}

/** Newest submissions across the given categories. */
export async function fetchRecent(categories: string[], maxResults = 100): Promise<NewPaper[]> {
  if (categories.length === 0) return [];
  const query = categories.map((c) => `cat:${c}`).join(" OR ");
  const params = new URLSearchParams({
    search_query: query,
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(maxResults),
  });
  return fetchFeed(params);
}

/** Specific papers by arXiv id, e.g. "2611.06729" or "hep-th/9901001". */
export async function fetchByIds(ids: string[]): Promise<NewPaper[]> {
  if (ids.length === 0) return [];
  return fetchFeed(new URLSearchParams({ id_list: ids.join(","), max_results: String(ids.length) }));
}

/** Accepts a bare id, an abs/pdf/html URL, or "arXiv:" prefixed id. Returns the id without version. */
export function parseArxivId(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/(\d{4}\.\d{4,5})(v\d+)?/) ?? s.match(/([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/i);
  return m ? m[1] : null;
}

async function fetchFeed(params: URLSearchParams): Promise<NewPaper[]> {
  const res = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`arXiv API returned ${res.status}`);
  const xml = await res.text();
  const feed = parser.parse(xml)?.feed;
  const entries: AtomEntry[] = feed?.entry ?? [];
  return entries.filter((e) => e.id && e.title && e.summary).map(toPaper);
}

function toPaper(e: AtomEntry): NewPaper {
  const idWithVersion = e.id.split("/abs/")[1] ?? e.id;
  const externalId = idWithVersion.replace(/v\d+$/, "");
  const pdf = e.link?.find((l) => l.title === "pdf" || l.type === "application/pdf")?.href;
  const categories = (e.category ?? []).map((c) => c.term);
  return {
    id: `arxiv:${externalId}`,
    source: "arxiv",
    externalId,
    title: clean(e.title),
    authors: (e.author ?? []).map((a) => clean(a.name)),
    abstract: clean(e.summary),
    categories,
    primaryCategory: e["arxiv:primary_category"]?.term ?? categories[0] ?? null,
    publishedAt: new Date(e.published),
    absUrl: `https://arxiv.org/abs/${externalId}`,
    pdfUrl: pdf ? pdf.replace(/^http:/, "https:") : `https://arxiv.org/pdf/${externalId}`,
  };
}

function clean(s: string): string {
  return String(s).replace(/\s+/g, " ").trim();
}
