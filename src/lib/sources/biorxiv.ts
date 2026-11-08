import { fetchJson, normaliseDoi, type Candidate } from "./types";

const API = "https://api.biorxiv.org/details/biorxiv";
// Three days covers a weekend.
const WINDOW_DAYS = 3;
// The API takes a couple of seconds a request and slows further when pressed, and someone is
// waiting on Fetch. Subjects it doesn't reach in time get their turn on a later run.
const CONCURRENT_SUBJECTS = 4;
const DEADLINE_MS = 20_000;
const MAX_RESULTS = 100;

export const BIORXIV_PREFIX = "biorxiv:";

interface Preprint {
  doi: string;
  title: string;
  authors: string;
  author_corresponding_institution?: string;
  date: string;
  version: string;
  license?: string;
  category: string;
  abstract: string;
}

/** Recent new bioRxiv preprints in these subjects (given as "biorxiv:<subject>"), newest first. */
export async function fetchBiorxiv(categories: string[]): Promise<Candidate[]> {
  const subjects = categories.filter((c) => c.startsWith(BIORXIV_PREFIX)).map((c) => c.slice(BIORXIV_PREFIX.length));
  if (subjects.length === 0) return [];

  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const url = (subject: string) =>
    `${API}/${day(WINDOW_DAYS)}/${day(0)}/0/json?category=${encodeURIComponent(subject.replaceAll(" ", "_"))}`;

  // A different order each run, so the deadline doesn't always cut off the same subjects.
  const queue = subjects.map((s) => ({ s, order: Math.random() })).sort((a, b) => a.order - b.order).map((x) => x.s);
  const deadline = Date.now() + DEADLINE_MS;
  const preprints: Preprint[] = [];
  const errors: unknown[] = [];
  let reached = 0;
  const worker = async () => {
    for (let subject = queue.shift(); subject && Date.now() < deadline; subject = queue.shift()) {
      try {
        const page = await fetchJson<{ collection: Preprint[] }>(url(subject), {}, 0);
        preprints.push(...page.collection);
        reached++;
      } catch (err) {
        errors.push(err);
      }
    }
  };
  // Waits on no more than the deadline; a slow request finishing later is simply ignored.
  await Promise.race([
    Promise.all(Array.from({ length: CONCURRENT_SUBJECTS }, worker)),
    new Promise((resolve) => setTimeout(resolve, DEADLINE_MS)),
  ]);
  if (reached === 0 && errors.length) throw errors[0];

  return preprints
    .filter((p) => p.version === "1")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_RESULTS)
    .map(toCandidate);
}

function toCandidate(p: Preprint): Candidate {
  const doi = normaliseDoi(p.doi);
  const url = `https://www.biorxiv.org/content/${doi}v${p.version}`;
  return {
    doi,
    title: p.title.trim(),
    abstract: p.abstract.trim(),
    authors: p.authors.split(";").map(name).filter(Boolean),
    publishedAt: new Date(p.date),
    venue: "bioRxiv",
    pdfUrl: `${url}.full.pdf`,
    absUrl: url,
    foundVia: "biorxiv",
    boost: 0,
    boostReasons: [],
    institutions: p.author_corresponding_institution ? [p.author_corresponding_institution] : [],
    license: licence(p.license),
    categories: [`${BIORXIV_PREFIX}${p.category.toLowerCase()}`],
  };
}

/** "Deng, Z." to "Z. Deng". */
function name(author: string): string {
  const [last, first] = author.trim().split(/,\s*/);
  return first ? `${first} ${last}` : last;
}

/** "cc_by_nc_nd" to "CC BY-NC-ND"; "cc_no" means no reuse licence was granted. */
function licence(raw: string | undefined): string | undefined {
  if (!raw?.startsWith("cc_") || raw === "cc_no") return undefined;
  return `CC ${raw.slice(3).toUpperCase().replaceAll("_", "-")}`;
}
