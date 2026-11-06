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
