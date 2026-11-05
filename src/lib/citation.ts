import type { Paper } from "./db/schema";

type Citable = Pick<
  Paper,
  "title" | "authors" | "publishedAt" | "source" | "externalId" | "doi" | "venue" | "collaboration" | "primaryCategory" | "absUrl"
>;

/** "Surname, I." from "Given Names Surname" (or an already-inverted "Surname, Given"). */
function apaName(full: string): string {
  if (full.includes(",")) {
    const [last, first = ""] = full.split(",").map((s) => s.trim());
    return `${last}, ${initials(first)}`.trim();
  }
  const parts = full.trim().split(/\s+/);
  const last = parts.pop() ?? full;
  return parts.length ? `${last}, ${initials(parts.join(" "))}` : last;
}

function initials(given: string): string {
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((g) => (g.endsWith(".") && g.length <= 3 ? g : `${g[0]}.`))
    .join(" ");
}

/** APA-style reference. Collaborations are cited by name; long author lists are shortened as APA does (19 + last). */
export function formatCitation(p: Citable): string {
  let authors: string;
  if (p.collaboration && p.authors.length > 20) {
    authors = p.collaboration;
  } else {
    const names = p.authors.map(apaName);
    authors =
      names.length > 20
        ? `${names.slice(0, 19).join(", ")}, … ${names[names.length - 1]}`
        : names.length > 1
          ? `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`
          : (names[0] ?? "Anonymous");
  }
  const year = p.publishedAt.getUTCFullYear();
  const where =
    p.venue ?? (p.source === "arxiv" ? `arXiv preprint arXiv:${p.externalId}` : "");
  const link = p.doi ? `https://doi.org/${p.doi}` : p.absUrl;
  return `${authors} (${year}). ${p.title}.${where ? ` ${where}.` : ""} ${link}`;
}

export function formatBibtex(p: Citable): string {
  // Lead author's surname, or the collaboration's first word ("Pierre Auger Collaboration" -> "pierre").
  const firstSurname = (
    p.collaboration && p.authors.length > 20
      ? p.collaboration.split(/\s+/)[0]
      : ((p.authors[0] ?? "anon").split(",")[0].trim().split(/\s+/).pop() ?? "anon")
  )
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toLowerCase();
  const firstWord = p.title.split(/\s+/).find((w) => w.length > 3)?.replace(/[^A-Za-z]/g, "").toLowerCase() ?? "paper";
  const year = p.publishedAt.getUTCFullYear();
  const authors =
    p.collaboration && p.authors.length > 20 ? `{${p.collaboration}}` : p.authors.map((a) => a.replace(/[{}]/g, "")).join(" and ");
  const fields: [string, string | null | undefined][] = [
    ["title", `{${p.title}}`],
    ["author", authors],
    ["year", String(year)],
    ["journal", p.venue],
    ["doi", p.doi],
    ["eprint", p.source === "arxiv" ? p.externalId : null],
    ["archivePrefix", p.source === "arxiv" ? "arXiv" : null],
    ["primaryClass", p.source === "arxiv" ? p.primaryCategory : null],
    ["url", p.doi ? `https://doi.org/${p.doi}` : p.absUrl],
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${String(v).replace(/^\{(.*)\}$/, "$1")}}`)
    .join(",\n");
  const type = p.venue ? "article" : "misc";
  return `@${type}{${firstSurname}${year}${firstWord},\n${body}\n}`;
}
