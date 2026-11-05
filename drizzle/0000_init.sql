CREATE TABLE "interactions" (
	"paper_id" text PRIMARY KEY NOT NULL,
	"liked" boolean DEFAULT false NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papers" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb NOT NULL,
	"abstract" text NOT NULL,
	"categories" jsonb NOT NULL,
	"primary_category" text,
	"published_at" timestamp with time zone NOT NULL,
	"abs_url" text NOT NULL,
	"pdf_url" text,
	"score" real DEFAULT 0 NOT NULL,
	"score_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" integer PRIMARY KEY NOT NULL,
	"categories" jsonb NOT NULL,
	"keywords" jsonb NOT NULL,
	"summaries_per_run" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term_affinity" (
	"term" text PRIMARY KEY NOT NULL,
	"weight" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"paper_id" text PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"hook" text NOT NULL,
	"posts" jsonb NOT NULL,
	"tldr" text NOT NULL,
	"key_numbers" jsonb NOT NULL,
	"tags" jsonb NOT NULL,
	"level" text NOT NULL,
	"paper_type" text NOT NULL,
	"input_mode" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "papers_status_idx" ON "papers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "papers_published_idx" ON "papers" USING btree ("published_at");