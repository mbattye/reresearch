CREATE TABLE "auth_failures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auth_failures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ip" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "institutions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "collaboration" text;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "license_url" text;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "summary_effort" text;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "monthly_budget_usd" real;--> statement-breakpoint
CREATE INDEX "auth_failures_at_idx" ON "auth_failures" USING btree ("at");