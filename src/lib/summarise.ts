import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Paper, Provider, ThreadPost, ThreadSection } from "./db/schema";
import { downloadPdf, getFullText } from "./fulltext";
import { DEFAULT_LEVEL, getLevel } from "./levels";
import { costUsd } from "./pricing";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface SummaryConfig {
  provider: Provider;
  model: string;
  effort: Effort;
  /** "text": extracted full text (cheap). "pdf": the whole PDF as a document, figures included (~3x the tokens). */
  input: "text" | "pdf";
  /** Reading level 1 (Crayons) to 6 (Referee #2); see src/skills/levels. */
  level: number;
}

export const EFFORTS: Effort[] = ["low", "medium", "high"];

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: process.env.SUMMARY_MODEL ?? "claude-sonnet-5-5",
  openrouter: "anthropic/claude-sonnet-5.5",
};

export function defaultConfig(): SummaryConfig {
  const effort = process.env.SUMMARY_EFFORT as Effort | undefined;
  return {
    provider: "anthropic",
    model: DEFAULT_MODELS.anthropic,
    effort: effort && EFFORTS.includes(effort) ? effort : "medium",
    input: process.env.SUMMARY_INPUT === "pdf" ? "pdf" : "text",
    level: DEFAULT_LEVEL,
  };
}

// Server-side refusal fallback ("default" mode) is offered for these models on the Claude API.
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1"];

/** Anthropic client for a reader's own key. */
export function anthropicFor(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export const ThreadSchema = z.object({
  headline: z
    .string()
    .describe("The punchline in plain language, under ~90 characters. Not clickbait, not the paper title, not just the topic."),
  hook: z
    .string()
    .describe("Opening post: the point of the paper in plain words, then the number that carries it. Under ~300 characters."),
  posts: z
    .array(
      z.object({
        section: z.string().describe("One of: context, approach, result, caveat, takeaway."),
        text: z.string().describe("One post, 1-4 sentences, under ~450 characters."),
      }),
    )
    .describe("The thread after the hook, in reading order: context, approach, results, caveats, takeaway. 4-9 posts."),
  tldr: z.string().describe("One sentence a reader could repeat to a colleague."),
  key_numbers: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .describe(
      "0-4 headline figures with units/uncertainties. Label in plain words, under ~40 characters, no symbols or conditions, e.g. value '5.2σ', label 'excess over background'.",
    ),
  tags: z.array(z.string()).describe("3-6 lowercase topic tags, specific (e.g. 'tokamak', 'neutrino oscillations'), no '#'."),
  level: z.string().describe("How much background the paper itself demands. One of: accessible, intermediate, specialist."),
  paper_type: z
    .string()
    .describe("One of: experimental, theoretical, computational, phenomenology, instrumentation, review, other."),
});

// Plain strings above, not z.enum: the SDK's schema transform can't send enums to the API, so they
// aren't enforced and smaller models sometimes answer "results" or "limitations". Normalise instead.
export type GeneratedThread = Omit<z.infer<typeof ThreadSchema>, "posts"> & { posts: ThreadPost[] };

const SECTION_ALIASES: Record<string, ThreadSection> = {
  context: "context",
  background: "context",
  motivation: "context",
  introduction: "context",
  approach: "approach",
  method: "approach",
  methods: "approach",
  setup: "approach",
  result: "result",
  results: "result",
  finding: "result",
  findings: "result",
  caveat: "caveat",
  caveats: "caveat",
  limitation: "caveat",
  limitations: "caveat",
  takeaway: "takeaway",
  takeaways: "takeaway",
  implications: "takeaway",
  conclusion: "takeaway",
  outlook: "takeaway",
};

function normalise(raw: z.infer<typeof ThreadSchema>): GeneratedThread {
  const pick = (value: string, allowed: string[], fallback: string) => {
    const v = value.toLowerCase().trim();
    return allowed.includes(v) ? v : fallback;
  };
  return {
    ...raw,
    posts: raw.posts.map((p, i) => ({
      section: SECTION_ALIASES[p.section.toLowerCase().trim()] ?? (i === 0 ? "context" : "result"),
      text: p.text,
    })),
    level: pick(raw.level, ["accessible", "intermediate", "specialist"], "intermediate"),
    paper_type: pick(
      raw.paper_type,
      ["experimental", "theoretical", "computational", "phenomenology", "instrumentation", "review", "other"],
      "other",
    ),
  };
}

// Shared by every reading level. The level guide (src/skills/levels) is appended and decides the
// audience, vocabulary, maths, comparisons, length and emphasis; the rules here never change.
const BASE_PROMPT = `You write threads for reresearch, a feed that turns research papers into short posts the reader scrolls through on their phone in spare moments. Readers want to understand what the paper actually did and found, and come away knowing something real. They do not want to be sold to, and they do not want a press release. How much background they have is set by the reading-level guide at the end.

Read the whole paper before writing. Then build the thread, in this order:

- Headline: the punchline in words, not the topic and not a formula. "X could detect Y, but too weakly to Z" beats "Study examines X" and beats an equation.
- Hook: what the paper establishes and why that is interesting, then the number that carries it, pitched for the reader's level. Someone skimming the feed should get the point from the hook alone. Save conditions and qualifiers for later posts. No questions as hooks.
- Context: the open problem this work addresses and what was known or missing before.
- Approach: what they actually did, and how.
- Results: the main findings and the numbers that carry them.
- Caveats: what the paper does not show, its key assumptions and limits. Note that arXiv papers are preprints unless the paper says it has been published.
- Takeaway: what this changes, rules out or enables next, sized honestly. Incremental work is fine; call it incremental.

Rules at every level:
- Facts first. Every post should teach the reader something; cut any sentence that only builds anticipation.
- Engaging through clarity and a dry eye for what is genuinely surprising, odd or elegant. Wit is welcome when it comes from the material itself.
- No hype words (breakthrough, game-changer, revolutionary, mind-blowing), no exclamation marks, no emojis, no hashtags, no thread markers like "1/" or "🧵", and none of "Let's dive in", "Buckle up", "Here's the thing", "But wait".
- Be calibrated: separate what was measured, what was inferred and what was speculated. Attribute claims to the authors where they are the authors' interpretation.
- Leave out the paper's internal labels (shot or run numbers, figure, table and equation numbers) unless the reader genuinely needs them.
- No LaTeX in the output; the paper's maths arrives as LaTeX, so translate it.
- British English spelling. Plain text only, no markdown. Each post stands alone when read on a phone.

Accuracy rules: any number you convert or rephrase (unit conversions, "ten times lighter", "about the size of") must be arithmetically right; if you are not certain, quote the paper's own number or leave it out. Use only what is in the paper. Do not invent numbers, comparisons or context, and do not criticise the paper for omitting something without checking the full text. If you were given only the abstract, say so in the caveat post, write fewer posts, and do not pad.

Where the reading-level guide below differs from these defaults on audience, vocabulary, numbers, comparisons, length or emphasis, follow the guide. The structure and the rules above never change. The guide's calibration example shows the pitch for a different paper; do not reuse its content.`;

export function systemPrompt(level: number): string {
  const guide = getLevel(level);
  return `${BASE_PROMPT}\n\n# Reading level ${guide.level} of 6: ${guide.name} (${guide.tagline})\n\n${guide.body}`;
}

export type InputMode = "html" | "pdf-text" | "pdf" | "abstract";

/** What the model reads: extracted text, the PDF itself, or just the abstract. */
export interface Material {
  mode: InputMode;
  text?: string;
  pdfBase64?: string;
  truncated: boolean;
  institutions?: string[];
}

export interface SummaryResult {
  thread: GeneratedThread;
  level: number;
  inputMode: InputMode;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  /** Affiliations found in the full text, when it had any. */
  institutions?: string[];
}

export async function prepareMaterial(paper: Paper, config: SummaryConfig): Promise<Material> {
  if (config.input === "pdf" && paper.pdfUrl) {
    const bytes = await downloadPdf(paper.pdfUrl);
    if (bytes) return { mode: "pdf", pdfBase64: Buffer.from(bytes).toString("base64"), truncated: false };
  }
  const full = await getFullText(paper);
  if (full) return { mode: full.source, text: full.text, truncated: full.truncated, institutions: full.institutions };
  return { mode: "abstract", truncated: false };
}

/** Request body shared by the live and batch paths. */
export function buildParams(paper: Paper, material: Material, config: SummaryConfig): Anthropic.MessageCreateParamsNonStreaming {
  const content: Anthropic.ContentBlockParam[] = [];
  if (material.pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: material.pdfBase64 },
      title: paper.title,
    });
  }
  content.push({ type: "text", text: paperBrief(paper, material) });
  const format = zodOutputFormat(ThreadSchema);
  return {
    model: config.model,
    max_tokens: 32000,
    output_config: { effort: config.effort, format: { type: format.type, schema: format.schema } },
    system: systemPrompt(config.level),
    messages: [{ role: "user", content }],
  };
}

/** Parse and validate a thread from a raw (e.g. batch) response. */
export function parseThread(message: Anthropic.Message): GeneratedThread {
  checkStop(message.stop_reason, message.stop_details);
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Response had no text");
  return normalise(zodOutputFormat(ThreadSchema).parse(text));
}

export async function summarisePaper(paper: Paper, config: SummaryConfig, apiKey: string): Promise<SummaryResult> {
  // OpenRouter gets the extracted text only; whole-PDF input is an Anthropic feature here.
  const material = await prepareMaterial(paper, config.provider === "openrouter" ? { ...config, input: "text" } : config);
  if (config.provider === "openrouter") return summariseViaOpenRouter(paper, material, config, apiKey);

  const params = buildParams(paper, material, config);
  const useFallback = FALLBACK_MODELS.includes(config.model);
  const stream = anthropicFor(apiKey).beta.messages.stream({
    ...(params as Anthropic.Beta.MessageCreateParamsNonStreaming),
    output_config: { effort: config.effort, format: betaZodOutputFormat(ThreadSchema) },
    // On a safety-classifier decline, the API re-runs the request on its recommended fallback model.
    ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  const message = await stream.finalMessage().catch((err: unknown) => {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("Anthropic rejected the API key. Update it in Settings.");
    throw err;
  });

  checkStop(message.stop_reason, message.stop_details);
  if (!message.parsed_output) throw new Error("Model response did not match the thread schema");
  const inputTokens = totalInput(message.usage);
  return {
    thread: normalise(message.parsed_output),
    level: config.level,
    inputMode: material.mode,
    model: message.model,
    inputTokens,
    outputTokens: message.usage.output_tokens,
    costUsd: costUsd({ model: message.model, inputTokens, outputTokens: message.usage.output_tokens }),
    institutions: material.institutions,
  };
}

interface OpenRouterResponse {
  model: string;
  choices: { message: { content: string | null }; finish_reason: string | null }[];
  usage?: { prompt_tokens: number; completion_tokens: number; cost?: number };
  error?: { message: string; code?: number };
}

/** Any model on OpenRouter that supports structured output, via its OpenAI-compatible endpoint. */
async function summariseViaOpenRouter(
  paper: Paper,
  material: Material,
  config: SummaryConfig,
  apiKey: string,
): Promise<SummaryResult> {
  const format = zodOutputFormat(ThreadSchema);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "reresearch",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 16000,
      messages: [
        { role: "system", content: systemPrompt(config.level) },
        { role: "user", content: paperBrief(paper, material) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "thread", strict: true, schema: format.schema } },
      // Only route to providers that honour the schema, and report the exact cost.
      provider: { require_parameters: true },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(280_000),
  });
  const body = (await res.json().catch(() => ({}))) as OpenRouterResponse;
  if (res.status === 401) throw new Error("OpenRouter rejected the API key. Update it in Settings.");
  if (res.status === 402) throw new Error("Your OpenRouter account is out of credits.");
  if (!res.ok || body.error) throw new Error(`OpenRouter: ${body.error?.message ?? res.status}`);

  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("Summary was cut off at max_tokens");
  if (!choice?.message.content) throw new Error("OpenRouter returned an empty response");
  const usage = body.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  return {
    thread: normalise(format.parse(choice.message.content)),
    level: config.level,
    inputMode: material.mode,
    model: body.model ?? config.model,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    costUsd: usage.cost ?? null,
    institutions: material.institutions,
  };
}

export function totalInput(usage: {
  input_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): number {
  return usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
}

function checkStop(stopReason: string | null, details?: { category?: string | null } | null) {
  if (stopReason === "refusal") throw new Error(`Model declined to summarise (${details?.category ?? "no category"})`);
  if (stopReason === "max_tokens") throw new Error("Summary was cut off at max_tokens");
}

function paperBrief(paper: Paper, material: Material): string {
  const authors =
    paper.authors.length > 6
      ? `${paper.authors.slice(0, 6).join(", ")} et al. (${paper.authors.length} authors)`
      : paper.authors.join(", ");
  const intro: Record<InputMode, string> = {
    pdf: "Write the thread for the attached paper.",
    html: "Write the thread for the paper below. Its full text follows, converted from the arXiv HTML with maths as LaTeX between $ signs.",
    "pdf-text": "Write the thread for the paper below. Its full text follows, extracted from the PDF, so layout and maths may be garbled in places.",
    abstract: "The full text could not be retrieved. Write a short thread from the metadata and abstract below only.",
  };
  const lines: (string | null)[] = [
    intro[material.mode],
    "",
    `Title: ${paper.title}`,
    `Authors: ${authors}`,
    paper.categories.length ? `Categories: ${paper.categories.join(", ")}` : null,
    paper.venue ? `Published in: ${paper.venue}` : null,
    paper.collaboration ? `Collaboration: ${paper.collaboration}` : null,
    paper.institutions.length ? `Institutions: ${paper.institutions.slice(0, 8).join("; ")}` : null,
    `Submitted: ${paper.publishedAt.toISOString().slice(0, 10)}`,
    `Link: ${paper.absUrl}`,
  ];
  if (material.mode === "abstract" || material.mode === "pdf-text") lines.push("", `Abstract: ${paper.abstract}`);
  if (material.text) {
    if (material.truncated) lines.push("", "Note: appendices and supplementary material were omitted for length.");
    lines.push("", "<paper>", material.text, "</paper>");
  }
  return lines.filter((l) => l !== null).join("\n");
}
