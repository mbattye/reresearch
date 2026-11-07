ALTER TABLE "user_settings" ADD COLUMN "welcomed_at" timestamp with time zone;--> statement-breakpoint
-- Anyone already writing threads has no need of the welcome.
UPDATE "user_settings" SET "welcomed_at" = now() WHERE "user_id" IN (
  SELECT "user_id" FROM "user_keys" UNION SELECT "written_by" FROM "threads" WHERE "written_by" IS NOT NULL
);
