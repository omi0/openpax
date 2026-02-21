CREATE TABLE "booking_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_feedback" ADD CONSTRAINT "booking_feedback_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_feedback" ADD CONSTRAINT "booking_feedback_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_feedback" ADD CONSTRAINT "booking_feedback_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_feedback_booking_uidx" ON "booking_feedback" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_feedback_restaurant_created_idx" ON "booking_feedback" USING btree ("restaurant_id","created_at");