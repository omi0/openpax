CREATE TYPE "public"."payment_kind" AS ENUM('deposit', 'card_hold');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('off', 'deposit', 'card_hold');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'card_saved', 'refunded', 'charged', 'failed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "booking_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"checkout_session_id" text,
	"checkout_url" text,
	"payment_intent_id" text,
	"setup_intent_id" text,
	"gateway_customer_id" text,
	"payment_method_id" text,
	"refund_id" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"charged_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_config" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mode" "payment_mode" DEFAULT 'off' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"min_party_size" integer,
	"payment_window_minutes" integer DEFAULT 30 NOT NULL,
	"refund_on_cancel" boolean DEFAULT true NOT NULL,
	"charge_no_show" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_payment" ADD CONSTRAINT "booking_payment_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_payment" ADD CONSTRAINT "booking_payment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_config" ADD CONSTRAINT "payment_config_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_config" ADD CONSTRAINT "payment_config_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_payment_booking_uidx" ON "booking_payment" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_payment_session_uidx" ON "booking_payment" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "booking_payment_restaurant_idx" ON "booking_payment" USING btree ("restaurant_id");