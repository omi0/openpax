ALTER TABLE "capacity_rule" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "schedule_exception" ADD COLUMN "end_date" date;--> statement-breakpoint
UPDATE "schedule_exception" SET "end_date" = "date" WHERE "end_date" IS NULL;--> statement-breakpoint
ALTER TABLE "schedule_exception" ALTER COLUMN "end_date" SET NOT NULL;
