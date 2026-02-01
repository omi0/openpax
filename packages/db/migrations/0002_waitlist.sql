CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'offered', 'booked', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "waitlist_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_id" uuid,
	"service_date" date NOT NULL,
	"party_size" integer NOT NULL,
	"preferred_time" text,
	"notes" text,
	"locale" text DEFAULT 'it' NOT NULL,
	"source" "booking_source" DEFAULT 'widget' NOT NULL,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"token" text NOT NULL,
	"offered_service_id" uuid,
	"offered_starts_at" timestamp with time zone,
	"offer_expires_at" timestamp with time zone,
	"booking_id" uuid,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "waitlist_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_policy" ADD COLUMN "waitlist_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_policy" ADD COLUMN "waitlist_auto_offer" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_policy" ADD COLUMN "waitlist_offer_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_offered_service_id_service_id_fk" FOREIGN KEY ("offered_service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_entry_restaurant_date_idx" ON "waitlist_entry" USING btree ("restaurant_id","service_date");--> statement-breakpoint
CREATE INDEX "waitlist_entry_customer_idx" ON "waitlist_entry" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entry_token_uidx" ON "waitlist_entry" USING btree ("token");--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_waitlist_entry_id_waitlist_entry_id_fk" FOREIGN KEY ("waitlist_entry_id") REFERENCES "public"."waitlist_entry"("id") ON DELETE cascade ON UPDATE no action;