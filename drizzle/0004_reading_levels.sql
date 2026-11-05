ALTER TABLE "preferences" ADD COLUMN "reading_level" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "summary_batches" ADD COLUMN "reading_level" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "reading_level" integer DEFAULT 4 NOT NULL;