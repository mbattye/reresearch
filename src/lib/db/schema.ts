import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type PaperStatus =
  | "new" // fetched, not yet chosen for summarising
  | "summarising"
  | "batched" // submitted to a half-price Message Batch, waiting for results
  | "ready"
  | "failed";

export type ThreadSection =
  | "context"
  | "approach"
  | "result"
  | "caveat"
  | "takeaway";

export interface ThreadPost {
  section: ThreadSection;
  text: string;
}

export interface KeyNumber {
  value: string;
  label: string;
}

export interface ScoreReason {
  term: string;
  weight: number;
}

/** Where a paper was discovered. */
export type FoundVia = "arxiv" | "inspire" | "semantic-scholar" | "openalex" | "request";

export const papers = pgTable(
  "papers",
  {
    // "<source>:<externalId>", e.g. "arxiv:2611.06729"
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    authors: jsonb("authors").$type<string[]>().notNull(),
    abstract: text("abstract").notNull(),
    categories: jsonb("categories").$type<string[]>().notNull(),
    primaryCategory: text("primary_category"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    absUrl: text("abs_url").notNull(),
    pdfUrl: text("pdf_url"),
    doi: text("doi"),
    venue: text("venue"),
    citationCount: integer("citation_count"),
    foundVia: text("found_via").$type<FoundVia>().notNull().default("arxiv"),
    // score = keyword/affinity interest (recomputed each run) + boost (set by the source that found it)
    score: real("score").notNull().default(0),
    scoreReasons: jsonb("score_reasons").$type<ScoreReason[]>().notNull().default([]),
    boost: real("boost").notNull().default(0),
    boostReasons: jsonb("boost_reasons").$type<ScoreReason[]>().notNull().default([]),
    // true when the reader asked for this paper explicitly rather than the ranker picking it
    requested: boolean("requested").notNull().default(false),
    status: text("status").$type<PaperStatus>().notNull().default("new"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("papers_status_idx").on(t.status),
    index("papers_published_idx").on(t.publishedAt),
    index("papers_doi_idx").on(t.doi),
  ],
);

export const threads = pgTable("threads", {
  paperId: text("paper_id")
    .primaryKey()
    .references(() => papers.id, { onDelete: "cascade" }),
  headline: text("headline").notNull(),
  hook: text("hook").notNull(),
  posts: jsonb("posts").$type<ThreadPost[]>().notNull(),
  tldr: text("tldr").notNull(),
  keyNumbers: jsonb("key_numbers").$type<KeyNumber[]>().notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  level: text("level").notNull(),
  paperType: text("paper_type").notNull(),
  // What the model read: "html" / "pdf-text" (extracted full text), "pdf" (the PDF itself) or "abstract"
  inputMode: text("input_mode").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: real("cost_usd"),
  batched: boolean("batched").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const interactions = pgTable("interactions", {
  paperId: text("paper_id")
    .primaryKey()
    .references(() => papers.id, { onDelete: "cascade" }),
  liked: boolean("liked").notNull().default(false),
  saved: boolean("saved").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface Keyword {
  term: string;
  weight: number;
}

export interface SourceToggles {
  inspireTrending: boolean;
  recommendations: boolean;
}

// Single row (id = 1) holding the reader's stated interests.
export const preferences = pgTable("preferences", {
  id: integer("id").primaryKey(),
  categories: jsonb("categories").$type<string[]>().notNull(),
  keywords: jsonb("keywords").$type<Keyword[]>().notNull(),
  summariesPerRun: integer("summaries_per_run").notNull(),
  // Null means use the SUMMARY_* environment defaults.
  summaryModel: text("summary_model"),
  summaryInput: text("summary_input").$type<"text" | "pdf">(),
  sources: jsonb("sources")
    .$type<SourceToggles>()
    .notNull()
    .default({ inspireTrending: true, recommendations: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Learned from likes, saves and "less like this": thread tags gain or lose weight.
export const termAffinity = pgTable("term_affinity", {
  term: text("term").primaryKey(),
  weight: real("weight").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per submitted Message Batch, so results can be collected on a later request.
export const summaryBatches = pgTable("summary_batches", {
  id: text("id").primaryKey(),
  paperIds: jsonb("paper_ids").$type<string[]>().notNull(),
  model: text("model").notNull(),
  // Material mode per paper id, needed to record how each thread was written.
  inputModes: jsonb("input_modes").$type<Record<string, string>>().notNull(),
  status: text("status").$type<"pending" | "collected">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
});

export type Paper = typeof papers.$inferSelect;
export type NewPaper = typeof papers.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Preferences = typeof preferences.$inferSelect;
