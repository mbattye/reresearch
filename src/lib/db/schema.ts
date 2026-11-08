import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

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
export type FoundVia = "arxiv" | "biorxiv" | "inspire" | "semantic-scholar" | "openalex" | "request";

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
    // Filled in when a paper is written up (INSPIRE, then the arXiv HTML, or OpenAlex for DOIs).
    institutions: jsonb("institutions").$type<string[]>().notNull().default([]),
    collaboration: text("collaboration"),
    license: text("license"),
    licenseUrl: text("license_url"),
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

// One finished thread per paper and reading level, shared by every reader at that level.
export const threads = pgTable("threads", {
  paperId: text("paper_id")
    .notNull()
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
  // Reading level it was written at, 1 (Crayons) to 6 (Referee #2). (`level` above is the paper's own difficulty.)
  readingLevel: integer("reading_level").notNull().default(4),
  // Whose key paid for it (null for threads from before accounts).
  writtenBy: text("written_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.paperId, t.readingLevel] }), index("threads_written_by_idx").on(t.writtenBy)]);

/** A thread being written, queued in a batch, or failed, per paper and reading level. */
export type JobStatus = "writing" | "batched" | "failed";

export const threadJobs = pgTable(
  "thread_jobs",
  {
    paperId: text("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    readingLevel: integer("reading_level").notNull(),
    status: text("status").$type<JobStatus>().notNull(),
    error: text("error"),
    // Whose key is paying for it.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    batchId: text("batch_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.paperId, t.readingLevel] }), index("thread_jobs_user_idx").on(t.userId)],
);

/** One reader's relationship with one paper: how well it matches them and what they did with it. */
export const userPapers = pgTable(
  "user_papers",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paperId: text("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    // keyword/affinity interest for this reader + the paper's source boost
    score: real("score").notNull().default(0),
    scoreReasons: jsonb("score_reasons").$type<ScoreReason[]>().notNull().default([]),
    // true when the reader asked for this paper rather than the ranker picking it
    requested: boolean("requested").notNull().default(false),
    liked: boolean("liked").notNull().default(false),
    saved: boolean("saved").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.paperId] }), index("user_papers_paper_idx").on(t.paperId)],
);

/** Legacy single-reader table, copied into the first admin's account on first sign-in. */
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

const settingsColumns = {
  categories: jsonb("categories").$type<string[]>().notNull(),
  keywords: jsonb("keywords").$type<Keyword[]>().notNull(),
  summariesPerRun: integer("summaries_per_run").notNull(),
  // Which of the reader's keys writes their threads; null = Anthropic.
  summaryProvider: text("summary_provider").$type<Provider>(),
  // Model id for that provider; null means the default (SUMMARY_MODEL for Anthropic).
  summaryModel: text("summary_model"),
  summaryInput: text("summary_input").$type<"text" | "pdf">(),
  summaryEffort: text("summary_effort").$type<"low" | "medium" | "high">(),
  readingLevel: integer("reading_level").notNull().default(4),
  // Summaries stop for the rest of the month once this much has been spent. Null = MONTHLY_BUDGET_USD or $10.
  monthlyBudgetUsd: real("monthly_budget_usd"),
  sources: jsonb("sources")
    .$type<SourceToggles>()
    .notNull()
    .default({ inspireTrending: true, recommendations: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Each reader's interests and writing settings. */
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  ...settingsColumns,
  // When they finished or skipped the welcome; until then the feed opens with it.
  welcomedAt: timestamp("welcomed_at", { withTimezone: true }),
});

/** Legacy single-reader settings (row id = 1), copied into the first admin's account on first sign-in. */
export const preferences = pgTable("preferences", {
  id: integer("id").primaryKey(),
  ...settingsColumns,
});

// Learned per reader from likes, saves and "less like this": thread tags gain or lose weight.
export const userTerms = pgTable(
  "user_terms",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    weight: real("weight").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.term] })],
);

/** Legacy single-reader affinities, copied into the first admin's account on first sign-in. */
export const termAffinity = pgTable("term_affinity", {
  term: text("term").primaryKey(),
  weight: real("weight").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Provider = "anthropic" | "openai" | "openrouter";

/** Readers' own API keys, encrypted with AES-256-GCM (see src/lib/keys.ts). Never sent to the browser. */
export const userKeys = pgTable(
  "user_keys",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").$type<Provider>().notNull(),
    ciphertext: text("ciphertext").notNull(),
    // Last four characters, to show which key is stored.
    hint: text("hint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

// One row per submitted Message Batch, so results can be collected on a later request.
export const summaryBatches = pgTable("summary_batches", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  paperIds: jsonb("paper_ids").$type<string[]>().notNull(),
  model: text("model").notNull(),
  readingLevel: integer("reading_level").notNull().default(4),
  // Material mode per paper id, needed to record how each thread was written.
  inputModes: jsonb("input_modes").$type<Record<string, string>>().notNull(),
  status: text("status").$type<"pending" | "collected">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
});

/** People asking for access from the login page; an admin approves or declines them in Settings. */
export const accessRequests = pgTable("access_requests", {
  email: text("email").primaryKey(),
  // Approved requests are deleted; declined ones stay so asking again changes nothing.
  status: text("status").$type<"pending" | "declined">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // When the admins' daily digest mentioned this request.
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
});

/** Recent sign-in and access requests. Rate limits live here because serverless instances share no memory. */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    key: text("key").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_attempts_key_at_idx").on(t.key, t.at)],
);

// Legacy: failed sign-ins from the old shared-password gate. Unused since accounts; drop in a later migration.
export const authFailures = pgTable(
  "auth_failures",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ip: text("ip").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_failures_at_idx").on(t.at)],
);

export type Paper = typeof papers.$inferSelect;
export type NewPaper = typeof papers.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type UserPaper = typeof userPapers.$inferSelect;
export type Preferences = typeof userSettings.$inferSelect;
export type ThreadJob = typeof threadJobs.$inferSelect;
export type AccessRequest = typeof accessRequests.$inferSelect;
