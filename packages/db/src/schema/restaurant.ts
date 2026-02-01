import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.js";
import { createdAt, id, updatedAt } from "./columns.js";

export const restaurant = pgTable(
  "restaurant",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    slug: text().notNull().unique(),
    timezone: text().notNull(),
    locale: text().notNull().default("it"),
    currency: text().notNull().default("EUR"),
    address: text(),
    phone: text(),
    email: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("restaurant_organization_idx").on(t.organizationId)],
);

export const area = pgTable(
  "area",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("area_restaurant_idx").on(t.restaurantId)],
);

export const bookingPolicy = pgTable("booking_policy", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurant.id, { onDelete: "cascade" }),
  minLeadMinutes: integer().notNull().default(60),
  maxAdvanceDays: integer().notNull().default(60),
  minPartySize: integer().notNull().default(1),
  maxPartySize: integer().notNull().default(10),
  autoConfirm: boolean().notNull().default(true),
  cancellationCutoffMinutes: integer().notNull().default(120),
  largePartyThreshold: integer(),
  /** Guests can queue for a full date from the widget. */
  waitlistEnabled: boolean().notNull().default(false),
  /** Offer freed tables to the queue without staff intervention. */
  waitlistAutoOffer: boolean().notNull().default(true),
  /** How long a guest has to accept an offered table. */
  waitlistOfferMinutes: integer().notNull().default(120),
  updatedAt: updatedAt(),
});

export const widgetConfig = pgTable("widget_config", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurant.id, { onDelete: "cascade" }),
  primaryColor: text().notNull().default("#1f6f5f"),
  logoUrl: text(),
  defaultLocale: text().notNull().default("it"),
  requirePhone: boolean().notNull().default(true),
  welcomeMessage: text(),
  termsUrl: text(),
  privacyUrl: text(),
  allowedOrigins: text().array().notNull().default([]),
  updatedAt: updatedAt(),
});
