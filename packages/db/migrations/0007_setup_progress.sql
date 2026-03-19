ALTER TABLE "restaurant" ADD COLUMN "setup_steps" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "setup_completed_at" timestamp with time zone;