ALTER TABLE "dining_table" ADD COLUMN "join_with" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_table" ADD COLUMN "head_seats" integer DEFAULT 0 NOT NULL;