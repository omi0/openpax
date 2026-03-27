ALTER TABLE "customer" ADD COLUMN "cancel_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "customer" c SET "cancel_count" = s.n
FROM (SELECT "customer_id", count(*)::int AS n FROM "booking" WHERE "status" = 'cancelled' GROUP BY "customer_id") s
WHERE s."customer_id" = c."id";
