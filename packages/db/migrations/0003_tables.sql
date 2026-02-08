CREATE TABLE "booking_table" (
	"booking_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	CONSTRAINT "booking_table_booking_id_table_id_pk" PRIMARY KEY("booking_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "dining_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"area_id" uuid,
	"name" text NOT NULL,
	"min_covers" integer DEFAULT 1 NOT NULL,
	"max_covers" integer DEFAULT 2 NOT NULL,
	"shape" text DEFAULT 'rect' NOT NULL,
	"x" real DEFAULT 0 NOT NULL,
	"y" real DEFAULT 0 NOT NULL,
	"width" real DEFAULT 10 NOT NULL,
	"height" real DEFAULT 10 NOT NULL,
	"joinable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_table" ADD CONSTRAINT "booking_table_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_table" ADD CONSTRAINT "booking_table_table_id_dining_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_table" ADD CONSTRAINT "dining_table_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_table" ADD CONSTRAINT "dining_table_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_table_table_idx" ON "booking_table" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "dining_table_restaurant_idx" ON "dining_table" USING btree ("restaurant_id");