import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Paper } from "./db/schema";

const MODEL = process.env.SUMMARY_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.SUMMARY_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max";
// The API accepts PDFs up to 32 MB per request; leave headroom for base64 overhead.
const MAX_PDF_BYTES = 22 * 1024 * 1024;

let client: Anthropic | undefined;

export const ThreadSchema = z.object({
  headline: z
    .string()
    .describe("Specific, plain-language headline for the finding, under ~90 characters. Not clickbait, not the paper title."),
  hook: z
    .string()
    .describe("Opening post: the most interesting concrete thing the paper shows, stated precisely, 1-3 sentences."),
  posts: z
    .array(
      z.object({
        section: z.enum(["context", "approach", "result", "caveat", "takeaway"]),
        text: z.string().describe("One post, 1-4 sentences, under ~450 characters."),
      }),
    )
    .describe("The thread after the hook, in reading order: context, approach, results, caveats, takeaway. 4-9 posts."),
  tldr: z.string().describe("One sentence a reader could repeat to a colleague."),
  key_numbers: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .describe("0-4 headline figures from the paper with units/uncertainties, e.g. value '5.2σ', label 'excess over background'."),
  tags: z.array(z.string()).describe("3-6 lowercase topic tags, specific (e.g. 'tokamak', 'neutrino oscillations'), no '#'."),
  level: z.enum(["accessible", "intermediate", "specialist"]).describe("How much background the paper itself demands."),
  paper_type: z.enum(["experimental", "theoretical", "computational", "phenomenology", "instrumentation", "review", "other"]),
});

export type GeneratedThread = z.infer<typeof ThreadSchema>;

const SYSTEM_PROMPT = `You write threads for reresearch, a feed that turns research papers into short posts the reader scrolls through on their phone in spare moments. The reader is sharp and curious, comfortable with undergraduate physics and maths, but usually not a specialist in the paper's subfield. They want to understand what the paper actually did and found, and come away knowing something real. They do not want to be sold to, and they do not want a press release.

Read the whole paper before writing. Then build the thread:

- Hook: the single most interesting concrete thing the paper establishes, stated precisely. A specific claim with its number beats a vague teaser. No questions as hooks.
- Context (from the introduction): the open problem or tension this work addresses, what was known before, and what limited earlier attempts. Enough that the result means something.
- Approach (from the method): what they actually did. The apparatus, dataset, model or derivation; the key technique and, in a clause, how it works. Mention scale where it matters (luminosity, qubit count, shot count, simulation size).
- Results: the main findings with the numbers that carry them: values, uncertainties, significance, and the comparison that gives them meaning (previous best, theory prediction, Standard Model expectation).
- Caveats: what the paper does not show, key assumptions, dominant systematics, limits the authors acknowledge, and any obvious ones they don't. Note that arXiv papers are preprints unless the paper says it has been published.
- Takeaway: what this changes, rules out or enables next, sized honestly. Incremental work is fine; call it incremental.

Voice:
- Facts first. Every post should teach the reader something; cut any sentence that only builds anticipation.
- Engaging through precision, clear structure and a dry eye for what is genuinely surprising, odd or elegant. Wit is welcome when it comes from the material itself.
- No hype words (breakthrough, game-changer, revolutionary, mind-blowing), no exclamation marks, no emojis, no hashtags, no thread markers like "1/" or "🧵", and none of "Let's dive in", "Buckle up", "Here's the thing", "But wait".
- Analogies: avoid them. Use one only if it explains a mechanism better than a direct description would; most threads should contain none. Never stack them.
- Keep the field's real terminology, because the reader wants to learn it, and define each term in a short clause the first time it appears.
- Numbers keep their units and uncertainties as reported. Use Unicode for light maths (σ, ħ, √s = 13.6 TeV, 10⁻⁹, ≲, ⟨n⟩). No LaTeX.
- Be calibrated: separate what was measured, what was inferred and what was speculated. Attribute claims to the authors where they are the authors' interpretation.
- British English spelling.
- Plain text only, no markdown. Each post stands alone when read on a phone: 1-4 sentences.

Accuracy rules: use only what is in the paper. Do not invent numbers, comparisons or context. If you were given only the abstract, say so in the caveat post, write fewer posts, and do not pad.`;

export interface SummaryResult {
  thread: GeneratedThread;
  inputMode: "pdf" | "abstract";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function summarisePaper(paper: Paper): Promise<SummaryResult> {
  const pdf = paper.pdfUrl ? await downloadPdf(paper.pdfUrl) : null;
  const inputMode = pdf ? "pdf" : "abstract";

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (pdf) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdf },
      title: paper.title,
    });
  }
  content.push({ type: "text", text: paperBrief(paper, inputMode) });

  client ??= new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    // On a safety-classifier decline, the API re-runs the request on its recommended fallback model.
    fallbacks: "default",
    output_config: { effort: EFFORT, format: betaZodOutputFormat(ThreadSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage().catch((err: unknown) => {
    if (err instanceof Error && err.message.includes("Could not resolve authentication method")) {
      throw new Error("No Claude API key configured. Set ANTHROPIC_API_KEY (see .env.example).");
    }
    throw err;
  });

  if (message.stop_reason === "refusal") {
    throw new Error(`Model declined to summarise (${message.stop_details?.category ?? "no category"})`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Summary was cut off at max_tokens");
  }
  if (!message.parsed_output) {
    throw new Error("Model response did not match the thread schema");
  }

  return {
    thread: message.parsed_output,
    inputMode,
    model: message.model,
    inputTokens:
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens,
  };
}

function paperBrief(paper: Paper, inputMode: "pdf" | "abstract"): string {
  const authors =
    paper.authors.length > 6 ? `${paper.authors.slice(0, 6).join(", ")} et al. (${paper.authors.length} authors)` : paper.authors.join(", ");
  const lines = [
    inputMode === "pdf"
      ? "Write the thread for the attached paper."
      : "The full text could not be retrieved. Write a short thread from the metadata and abstract below only.",
    "",
    `Title: ${paper.title}`,
    `Authors: ${authors}`,
    `Categories: ${paper.categories.join(", ")}`,
    `Submitted: ${paper.publishedAt.toISOString().slice(0, 10)}`,
    `Link: ${paper.absUrl}`,
  ];
  if (inputMode === "abstract") lines.push("", `Abstract: ${paper.abstract}`);
  return lines.join("\n");
}

async function downloadPdf(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "reresearch/0.1 (personal research reader)" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("pdf")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_PDF_BYTES) return null;
    return buf.toString("base64");
  } catch {
    return null;
  }
}
