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
    score: real("score").notNull().default(0),
    scoreReasons: jsonb("score_reasons").$type<ScoreReason[]>().notNull().default([]),
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
  // "pdf" when Claude read the full paper, "abstract" when it only had the abstract
  inputMode: text("input_mode").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
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

// Single row (id = 1) holding the reader's stated interests.
export const preferences = pgTable("preferences", {
  id: integer("id").primaryKey(),
  categories: jsonb("categories").$type<string[]>().notNull(),
  keywords: jsonb("keywords").$type<Keyword[]>().notNull(),
  summariesPerRun: integer("summaries_per_run").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Learned from likes, saves and "less like this": thread tags gain or lose weight.
export const termAffinity = pgTable("term_affinity", {
  term: text("term").primaryKey(),
  weight: real("weight").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Paper = typeof papers.$inferSelect;
export type NewPaper = typeof papers.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Preferences = typeof preferences.$inferSelect;
