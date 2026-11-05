import { parse, type HTMLElement } from "node-html-parser";
import type { Paper } from "./db/schema";
import { safeFetch } from "./safe-fetch";
import { uniqueInstitutions } from "./sources/metadata";
// Roughly 20k tokens. Longer papers keep their main text and lose appendices and supplements first.
const MAX_CHARS = 80_000;
// Headings that start back matter LaTeXML doesn't tag as an appendix ("Appendix A", "Supplementary
// Material", or supplement numbering like ".6 Proofs" and "S2 Methods").
const BACK_MATTER = /^#{1,4} (appendix|supplementa|\.\d|s\d+[ .]|[a-z]\.\d* appendix)/im;
// The API accepts PDFs up to 32 MB per request; leave headroom for base64 overhead.
const MAX_PDF_BYTES = 22 * 1024 * 1024;

export type FullTextSource = "html" | "pdf-text";

export interface FullText {
  source: FullTextSource;
  text: string;
  /** True when appendices or trailing sections were dropped to fit MAX_CHARS. */
  truncated: boolean;
  /** Author affiliations listed in the HTML, lead author's first. */
  institutions?: string[];
}

/**
 * Plain text of the paper, cheapest route first: arXiv's LaTeXML HTML (keeps
 * sections, captions and maths), then text pulled out of the PDF. Null when
 * neither is available, in which case the caller falls back to the abstract.
 */
export async function getFullText(paper: Paper): Promise<FullText | null> {
  if (paper.source === "arxiv") {
    const html = await fetchArxivHtml(paper.externalId);
    if (html) return html;
  }
  if (paper.pdfUrl) {
    const bytes = await downloadPdf(paper.pdfUrl);
    if (bytes) return pdfToText(bytes);
  }
  return null;
}

export async function downloadPdf(url: string): Promise<Uint8Array | null> {
  try {
    const res = await safeFetch(url);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > MAX_PDF_BYTES ? null : buf;
  } catch {
    return null;
  }
}

async function fetchArxivHtml(arxivId: string): Promise<FullText | null> {
  try {
    const res = await safeFetch(`https://arxiv.org/html/${arxivId}`);
    if (!res.ok) return null;
    return latexmlToText(await res.text());
  } catch {
    return null;
  }
}

/** Exported for testing. Converts arXiv's LaTeXML HTML into compact sectioned text. */
export function latexmlToText(html: string): FullText | null {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const article = root.querySelector("article.ltx_document") ?? root.querySelector("article");
  if (!article) return null;

  const institutions = uniqueInstitutions(
    article.querySelectorAll(".ltx_role_affiliation, .ltx_role_address").map((el) =>
      squash(el.text).replace(/^Affiliation:\s*/i, ""),
    ),
  );

  for (const sel of [
    "nav",
    "header.ltx_page_header",
    "footer",
    ".ltx_bibliography",
    ".ltx_TOC",
    ".ltx_authors",
    ".ltx_dates",
    ".ltx_role_footnote",
    ".ltx_note_outer",
    "figure img",
    "svg",
    "annotation",
    "annotation-xml",
  ]) {
    for (const el of article.querySelectorAll(sel)) el.remove();
  }

  // Maths: keep the LaTeX source, which models read well, instead of MathML soup.
  for (const m of article.querySelectorAll("math")) {
    const tex = m.getAttribute("alttext");
    m.replaceWith(tex ? ` $${tex}$ ` : "");
  }
  for (const h of article.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const level = Number(h.tagName.slice(1));
    h.set_content(`\n${"#".repeat(Math.min(level, 4))} ${squash(h.text)}\n`);
  }
  for (const c of article.querySelectorAll("figcaption")) {
    c.set_content(`\n[Caption] ${squash(c.text)}\n`);
  }
  for (const row of article.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td, th").map((c) => squash(c.text));
    row.set_content(`\n${cells.join(" | ")}\n`);
  }

  // Appendices go last so they're the first thing cut when a paper is long.
  const appendices = article.querySelectorAll("section.ltx_appendix");
  for (const a of appendices) a.remove();

  let body = clean(article.structuredText);
  let appendix = clean(appendices.map((a: HTMLElement) => a.structuredText).join("\n\n"));
  const backMatter = body.search(BACK_MATTER);
  if (backMatter > body.length * 0.3) {
    appendix = clean(`${body.slice(backMatter)}\n\n${appendix}`);
    body = body.slice(0, backMatter).trim();
  }
  if (body.length < 500) return null;

  let text = body;
  let truncated = false;
  if (appendix && body.length + appendix.length <= MAX_CHARS) {
    text = `${body}\n\n${appendix}`;
  } else if (appendix) {
    truncated = true;
  }
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    truncated = true;
  }
  return { source: "html", text, truncated, institutions };
}

async function pdfToText(bytes: Uint8Array): Promise<FullText | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    let body = clean(text);
    // Drop the reference list: everything after the last "References"/"Bibliography" heading.
    const refs = body.search(/\n\s*(References|Bibliography|REFERENCES)\s*\n(?![\s\S]*\n\s*(References|Bibliography|REFERENCES)\s*\n)/);
    if (refs > body.length * 0.5) body = body.slice(0, refs);
    if (body.length < 500) return null;
    const truncated = body.length > MAX_CHARS;
    return { source: "pdf-text", text: body.slice(0, MAX_CHARS), truncated };
  } catch {
    return null;
  }
}

function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clean(s: string): string {
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
