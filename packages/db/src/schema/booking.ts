import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { createdAt, id, updatedAt } from "./columns.js";
import { bookingSourceEnum, bookingStatusEnum } from "./enums.js";
import { area, restaurant } from "./restaurant.js";
import { service } from "./service.js";

export const customer = pgTable(
  "customer",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    name: text().notNull(),
    email: text(),
    phone: text(),
    locale: text(),
    tags: text().array().notNull().default([]),
    notes: text(),
    visitCount: integer().notNull().default(0),
    noShowCount: integer().notNull().default(0),
    marketingConsent: boolean().notNull().default(false),
    lastVisitAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("customer_restaurant_email_idx").on(t.restaurantId, t.email),
    index("customer_restaurant_phone_idx").on(t.restaurantId, t.phone),
  ],
);

export const booking = pgTable(
  "booking",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    serviceId: uuid()
      .notNull()
      .references(() => service.id, { onDelete: "restrict" }),
    areaId: uuid().references(() => area.id, { onDelete: "set null" }),
    customerId: uuid()
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    /** Calendar day of the service in the restaurant timezone (after-midnight slots keep the previous day). */
    serviceDate: date().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    partySize: integer().notNull(),
    status: bookingStatusEnum().notNull().default("confirmed"),
    source: bookingSourceEnum().notNull().default("widget"),
    locale: text().notNull().default("it"),
    notes: text(),
    tags: text().array().notNull().default([]),
    confirmationCode: text().notNull(),
    /** Secret token in the guest's manage link. */
    manageToken: text().notNull(),
    idempotencyKey: text(),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    cancelledAt: timestamp({ withTimezone: true }),
    cancellationReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("booking_restaurant_service_date_idx").on(t.restaurantId, t.serviceDate),
    index("booking_restaurant_starts_at_idx").on(t.restaurantId, t.startsAt),
    index("booking_customer_idx").on(t.customerId),
    uniqueIndex("booking_confirmation_code_uidx").on(t.restaurantId, t.confirmationCode),
    uniqueIndex("booking_manage_token_uidx").on(t.manageToken),
    uniqueIndex("booking_idempotency_uidx")
      .on(t.restaurantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);
