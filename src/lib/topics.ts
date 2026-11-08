import type { Keyword } from "./db/schema";

const PHYSICS_CATEGORIES: Record<string, string> = {
  "hep-ex": "High energy physics: experiment",
  "hep-ph": "High energy physics: phenomenology",
  "hep-th": "High energy physics: theory",
  "hep-lat": "Lattice QCD",
  "quant-ph": "Quantum physics",
  "physics.plasm-ph": "Plasma physics (fusion)",
  "nucl-ex": "Nuclear experiment",
  "nucl-th": "Nuclear theory",
  "astro-ph.CO": "Cosmology",
  "astro-ph.HE": "High energy astrophysics",
  "gr-qc": "General relativity & quantum cosmology",
  "cond-mat.supr-con": "Superconductivity",
  "cond-mat.mes-hall": "Mesoscale & nanoscale physics",
  "physics.atom-ph": "Atomic physics",
  "physics.optics": "Optics",
  "physics.acc-ph": "Accelerator physics",
  "physics.ins-det": "Instrumentation & detectors",
};

const AI_CATEGORIES: Record<string, string> = {
  "cs.AI": "Artificial intelligence",
  "cs.LG": "Machine learning",
  "stat.ML": "Machine learning (statistics)",
  "cs.CL": "Language models & NLP",
  "cs.CV": "Computer vision",
  "cs.RO": "Robotics",
  "cs.MA": "Multi-agent systems",
  "cs.NE": "Neural & evolutionary computing",
};

/** arXiv categories offered in settings. Any other valid arXiv category can be typed in too. */
export const CATEGORY_GROUPS = [
  { name: "Physics", labels: PHYSICS_CATEGORIES },
  { name: "AI", labels: AI_CATEGORIES },
];

export const CATEGORY_LABELS: Record<string, string> = { ...PHYSICS_CATEGORIES, ...AI_CATEGORIES };

export const DEFAULT_CATEGORIES = [
  "hep-ex",
  "hep-ph",
  "quant-ph",
  "physics.plasm-ph",
];

export const DEFAULT_KEYWORDS: Keyword[] = [
  // Bare "fusion" also matches fusion-based quantum computing and sensor fusion.
  { term: "fusion energy", weight: 2 },
  { term: "fusion plasma", weight: 2 },
  { term: "fusion reactor", weight: 2 },
  { term: "nuclear fusion", weight: 2 },
  { term: "tokamak", weight: 2 },
  { term: "stellarator", weight: 2 },
  { term: "inertial confinement", weight: 2 },
  { term: "higgs", weight: 1.5 },
  { term: "neutrino", weight: 1.5 },
  { term: "dark matter", weight: 1.5 },
  { term: "LHC", weight: 1 },
  { term: "beyond the standard model", weight: 1 },
  { term: "quantum error correction", weight: 1.5 },
  { term: "entanglement", weight: 1 },
  { term: "quantum computing", weight: 1 },
];

/** Offered in settings: AI categories post so much that ranking needs keywords to find anything. */
export const AI_KEYWORDS: Keyword[] = [
  // Bare "alignment" also matches detector alignment, and bare "agent" most of chemistry.
  { term: "AI alignment", weight: 2 },
  { term: "AI safety", weight: 2 },
  { term: "AI agent", weight: 1.5 },
  { term: "large language model", weight: 2 },
  { term: "LLM", weight: 1.5 },
  { term: "foundation model", weight: 1.5 },
  { term: "mechanistic interpretability", weight: 2 },
  { term: "interpretability", weight: 1.5 },
  { term: "scaling law", weight: 1.5 },
  { term: "reinforcement learning", weight: 1 },
  { term: "diffusion model", weight: 1 },
  { term: "world model", weight: 1 },
  { term: "multimodal", weight: 1 },
];

export const DEFAULT_SUMMARIES_PER_RUN = 4;

/** A keyword as written in the settings box, one per line. */
export function keywordLine(k: Keyword): string {
  return k.weight === 1 ? k.term : `${k.term}: ${k.weight}`;
}

export function categoryShort(cat: string | null | undefined): string {
  if (!cat) return "paper";
  return cat.replace(/^physics\./, "").replace(/^astro-ph\./, "astro-");
}

/** Models offered in settings, cheapest first. Costs measured on recent physics papers read as text. */
export const SUMMARY_MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "under 1¢ a paper · plainer" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "~6¢ (3¢ batched) · default" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "~14¢ (7¢ batched) · sharpest" },
];

/** Costs estimated from the Claude models at the same prices; not yet measured. */
export const OPENAI_MODELS = [
  { id: "gpt-6-luna", label: "GPT-6 Luna", note: "under 1¢ a paper (est.) · plainer" },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", note: "~3¢ (est.)" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", note: "~6¢ (est.) · default" },
];

/** Broad topics for filtering the feed. A paper belongs to every topic any of its arXiv categories falls in. */
export const TOPICS = [
  { id: "particle", label: "Particle & nuclear", match: /^(hep-|nucl-)|^physics\.(acc-ph|ins-det)$/ },
  { id: "quantum", label: "Quantum & atomic", match: /^quant-ph$|^physics\.(atom-ph|optics)$/ },
  { id: "fusion", label: "Fusion & plasma", match: /^physics\.plasm-ph$/ },
  { id: "astro", label: "Astro & gravity", match: /^astro-ph|^gr-qc$/ },
  { id: "matter", label: "Condensed matter", match: /^cond-mat/ },
  { id: "ai", label: "AI", match: /^(cs\.(AI|LG|CL|CV|RO|MA|NE)|stat\.ML)$/ },
] as const;

export const OTHER_TOPIC = { id: "other", label: "Other" } as const;

export type TopicId = (typeof TOPICS)[number]["id"] | typeof OTHER_TOPIC.id;

export function topicsOf(categories: string[]): TopicId[] {
  const found: TopicId[] = TOPICS.filter((t) => categories.some((c) => t.match.test(c))).map((t) => t.id);
  return found.length ? found : [OTHER_TOPIC.id];
}

export interface TopicCount {
  id: TopicId;
  label: string;
  count: number;
}

/** The topics present in a list of papers, in display order, with how many papers each has. */
export function countTopics(categoryLists: string[][]): TopicCount[] {
  const counts = new Map<TopicId, number>();
  for (const cats of categoryLists) for (const t of topicsOf(cats)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...TOPICS, OTHER_TOPIC]
    .filter((t) => counts.has(t.id))
    .map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id)! }));
}

export function isTopic(value: unknown): value is TopicId {
  return value === OTHER_TOPIC.id || TOPICS.some((t) => t.id === value);
}
