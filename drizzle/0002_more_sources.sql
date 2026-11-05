ALTER TABLE "papers" ADD COLUMN "doi" text;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "venue" text;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "citation_count" integer;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "found_via" text DEFAULT 'arxiv' NOT NULL;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "boost" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "boost_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "sources" jsonb DEFAULT '{"inspireTrending":true,"recommendations":true}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "papers_doi_idx" ON "papers" USING btree ("doi");