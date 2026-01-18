CREATE TABLE "notification_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"event" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"locale" text NOT NULL,
	"subject" text,
	"heading" text,
	"body" text NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_template_uidx" ON "notification_template" USING btree ("restaurant_id","event","channel","audience","locale");