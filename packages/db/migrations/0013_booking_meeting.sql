CREATE TABLE "booking_meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_policy" ADD COLUMN "meeting_min_party_size" integer;--> statement-breakpoint
ALTER TABLE "booking_policy" ADD COLUMN "meeting_hours" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_policy" ADD COLUMN "meeting_host_name" text;--> statement-breakpoint
ALTER TABLE "booking_policy" ADD COLUMN "meeting_host_email" text;--> statement-breakpoint
ALTER TABLE "booking_meeting" ADD CONSTRAINT "booking_meeting_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_meeting" ADD CONSTRAINT "booking_meeting_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_meeting" ADD CONSTRAINT "booking_meeting_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_meeting_restaurant_starts_at_idx" ON "booking_meeting" USING btree ("restaurant_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_meeting_slot_uidx" ON "booking_meeting" USING btree ("restaurant_id","starts_at") WHERE "booking_meeting"."cancelled_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_meeting_booking_uidx" ON "booking_meeting" USING btree ("booking_id") WHERE "booking_meeting"."cancelled_at" is null;