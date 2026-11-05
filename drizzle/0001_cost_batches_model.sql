CREATE TABLE "summary_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"paper_ids" jsonb NOT NULL,
	"model" text NOT NULL,
	"input_modes" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"collected_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "summary_model" text;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "summary_input" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "cost_usd" real;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "batched" boolean DEFAULT false NOT NULL;