ALTER TABLE "booking" ADD COLUMN "operator_name" text;--> statement-breakpoint
ALTER TABLE "booking_policy" ADD COLUMN "operators" text[] DEFAULT '{}' NOT NULL;