import { fetchJson, normaliseDoi } from "./types";

export interface PaperDetails {
  institutions: string[];
  collaboration?: string;
  license?: string;
  licenseUrl?: string;
  doi?: string;
  venue?: string;
}

interface InspireHit {
  metadata: {
    authors?: { affiliations?: { value: string }[] }[];
    collaborations?: { value: string }[];
    license?: { license?: string; url?: string; material?: string }[];
    dois?: { value: string }[];
    publication_info?: { journal_title?: string }[];
  };
}

/** Affiliations, collaboration and licence from INSPIRE, which covers HEP and much of quant-ph and astro. */
export async function inspireDetails(arxivId: string): Promise<PaperDetails | null> {
  const params = new URLSearchParams({
    q: `arxiv:${arxivId}`,
    fields: "authors.affiliations.value,collaborations,license,dois,publication_info",
  });
  const data = await fetchJson<{ hits: { hits: InspireHit[] } }>(`https://inspirehep.net/api/literature?${params}`);
  const m = data.hits.hits[0]?.metadata;
  if (!m) return null;
  const license = m.license?.find((l) => l.material !== "publication") ?? m.license?.[0];
  const collab = m.collaborations?.[0]?.value;
  return {
    // INSPIRE's affiliations are already curated short names ("Adelaide U.", "CERN"); keep them as they are.
    institutions: uniqueInstitutions(
      (m.authors ?? []).flatMap((a) => (a.affiliations ?? []).map((x) => x.value)),
      { shorten: false },
    ),
    collaboration: collab ? (/collaboration/i.test(collab) ? collab : `${collab} Collaboration`) : undefined,
    license: license?.license,
    licenseUrl: license?.url,
    doi: m.dois?.[0]?.value ? normaliseDoi(m.dois[0].value) : undefined,
    venue: m.publication_info?.[0]?.journal_title,
  };
}

const INSTITUTION_WORDS =
  /universit|institut|laborator|\blab\b|college|cent(re|er)|observator|authority|academy|school|agency|facility|foundation|council|hospital|\bcern\b|\bdesy\b|fermilab|kek\b|riken|cnrs|\binfn\b|max planck|\bnasa\b|\bukaea\b|corporation|\binc\b|\bltd\b|gmbh|google|ibm|microsoft|deepmind|quantinuum/i;

/**
 * Affiliation strings are full postal addresses. Keep the part that names the institution:
 * "Department of Physics, University of Oxford, Parks Road, ..." -> "University of Oxford".
 */
export function shortenAffiliation(raw: string): string {
  const parts = raw
    .replace(/\s+/g, " ")
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (parts.find((p) => INSTITUTION_WORDS.test(p)) ?? parts[0] ?? raw).slice(0, 120);
}

/** Unique, in order of first appearance (so the lead author's institution comes first). */
export function uniqueInstitutions(list: string[], opts: { shorten?: boolean } = {}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (/^unlisted\b/i.test(raw.trim())) continue;
    const name = opts.shorten === false ? raw.replace(/\s+/g, " ").trim() : shortenAffiliation(raw);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
