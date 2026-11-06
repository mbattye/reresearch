import { XMLParser } from "fast-xml-parser";
import type { NewPaper } from "../db/schema";
import { USER_AGENT } from "./types";

const API = "https://export.arxiv.org/api/query";
// arXiv asks clients to identify themselves and keep to roughly one request every three seconds.
const MIN_GAP_MS = 3100;
let lastRequest = 0;

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
  "arxiv:doi"?: string;
  "arxiv:journal_ref"?: string;
}

// These archives post far more each day than physics. Asked for together, they'd fill every result.
const BUSY_ARCHIVE = /^(cs|stat|eess)\./;

/** Newest submissions across the given categories, with busy archives queried separately and given more room. */
export async function fetchRecent(categories: string[], maxResults = 100): Promise<NewPaper[]> {
  const busy = categories.filter((c) => BUSY_ARCHIVE.test(c));
  const rest = categories.filter((c) => !BUSY_ARCHIVE.test(c));
  const found = [...(await fetchNewest(rest, maxResults)), ...(await fetchNewest(busy, maxResults * 2))];
  // A paper cross-listed in both groups comes back twice.
  return [...new Map(found.map((p) => [p.id, p])).values()];
}

async function fetchNewest(categories: string[], maxResults: number): Promise<NewPaper[]> {
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
  const out: NewPaper[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    out.push(...(await fetchFeed(new URLSearchParams({ id_list: chunk.join(","), max_results: String(chunk.length) }))));
  }
  return out;
}

/** Accepts a bare id, an abs/pdf/html URL, or "arXiv:" prefixed id. Returns the id without version. */
export function parseArxivId(input: string): string | null {
  const s = input.trim();
  const m =
    s.match(/(\d{4}\.\d{4,5})(v\d+)?/) ?? s.match(/([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/i);
  return m ? m[1] : null;
}

async function fetchFeed(params: URLSearchParams): Promise<NewPaper[]> {
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
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
    doi: e["arxiv:doi"] ? String(e["arxiv:doi"]).trim().toLowerCase() : null,
    venue: e["arxiv:journal_ref"] ? clean(e["arxiv:journal_ref"]) : null,
  };
}

function clean(s: string): string {
  return String(s).replace(/\s+/g, " ").trim();
}
