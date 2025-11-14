import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.js";
import { booking } from "./booking.js";
import { createdAt, id, updatedAt } from "./columns.js";
import {
  notificationAudienceEnum,
  notificationChannelEnum,
  notificationStatusEnum,
} from "./enums.js";
import { restaurant } from "./restaurant.js";

/**
 * Which provider (smtp, resend, twilio, ...) a restaurant or organization uses
 * for a channel. `config` holds the provider's settings; secret fields are
 * encrypted before they get here (see apps/server/src/lib/crypto.ts).
 */
export const notificationProviderConfig = pgTable(
  "notification_provider_config",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** null = organization-wide default. */
    restaurantId: uuid().references(() => restaurant.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum().notNull(),
    providerId: text().notNull(),
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean().notNull().default(true),
    updatedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notification_provider_config_org_uidx")
      .on(t.organizationId, t.channel)
      .where(sql`${t.restaurantId} is null`),
    uniqueIndex("notification_provider_config_restaurant_uidx")
      .on(t.restaurantId, t.channel)
      .where(sql`${t.restaurantId} is not null`),
  ],
);

/** Per-restaurant toggles: which event goes out on which channel to whom. */
export const notificationSetting = pgTable(
  "notification_setting",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    event: text().notNull(),
    channel: notificationChannelEnum().notNull(),
    audience: notificationAudienceEnum().notNull(),
    enabled: boolean().notNull().default(false),
    /** Reminders only: minutes before arrival. */
    offsetMinutes: integer(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notification_setting_uidx").on(t.restaurantId, t.event, t.channel, t.audience),
  ],
);

export const notificationLog = pgTable(
  "notification_log",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    bookingId: uuid().references(() => booking.id, { onDelete: "cascade" }),
    event: text().notNull(),
    channel: notificationChannelEnum().notNull(),
    audience: notificationAudienceEnum().notNull(),
    /** One notification per domain event per channel/audience; test sends use a random key. */
    dedupeKey: text().notNull(),
    providerId: text(),
    recipient: text().notNull(),
    status: notificationStatusEnum().notNull().default("queued"),
    providerMessageId: text(),
    error: text(),
    attempts: integer().notNull().default(0),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notification_log_dedupe_uidx").on(t.dedupeKey),
    index("notification_log_booking_idx").on(t.bookingId),
    index("notification_log_restaurant_created_idx").on(t.restaurantId, t.createdAt),
  ],
);
