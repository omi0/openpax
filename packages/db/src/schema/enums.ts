import { BOOKING_SOURCES, BOOKING_STATUSES } from "@sitli/core";
import { pgEnum } from "drizzle-orm/pg-core";

export const bookingStatusEnum = pgEnum("booking_status", BOOKING_STATUSES);
export const bookingSourceEnum = pgEnum("booking_source", BOOKING_SOURCES);
export const notificationChannelEnum = pgEnum("notification_channel", ["email", "sms"]);
export const notificationAudienceEnum = pgEnum("notification_audience", ["guest", "restaurant"]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "queued",
  "sent",
  "failed",
  "skipped",
]);
export const actorTypeEnum = pgEnum("actor_type", ["user", "guest", "system", "api_key"]);
