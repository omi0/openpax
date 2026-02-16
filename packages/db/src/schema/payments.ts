import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { booking } from "./booking.js";
import { createdAt, id, updatedAt } from "./columns.js";
import { restaurant } from "./restaurant.js";

export const paymentModeEnum = pgEnum("payment_mode", ["off", "deposit", "card_hold"]);
export const paymentKindEnum = pgEnum("payment_kind", ["deposit", "card_hold"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "card_saved",
  "refunded",
  "charged",
  "failed",
  "expired",
  "cancelled",
]);

/**
 * Stripe keys and the deposit / no-show policy of a restaurant. Secret
 * fields inside `config` are encrypted like notification provider secrets.
 */
export const paymentConfig = pgTable("payment_config", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurant.id, { onDelete: "cascade" }),
  provider: text().notNull().default("stripe"),
  /** { secretKey, webhookSecret } encrypted. */
  config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  mode: paymentModeEnum().notNull().default("off"),
  amountCents: integer().notNull().default(0),
  minPartySize: integer(),
  paymentWindowMinutes: integer().notNull().default(30),
  refundOnCancel: boolean().notNull().default(true),
  chargeNoShow: boolean().notNull().default(true),
  updatedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One payment (deposit or saved card) per booking that needed one. */
export const bookingPayment = pgTable(
  "booking_payment",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    bookingId: uuid()
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    provider: text().notNull().default("stripe"),
    kind: paymentKindEnum().notNull(),
    status: paymentStatusEnum().notNull().default("pending"),
    amountCents: integer().notNull(),
    currency: text().notNull(),
    checkoutSessionId: text(),
    checkoutUrl: text(),
    paymentIntentId: text(),
    setupIntentId: text(),
    /** Gateway customer + payment method for off-session charges. */
    gatewayCustomerId: text(),
    paymentMethodId: text(),
    refundId: text(),
    expiresAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    refundedAt: timestamp({ withTimezone: true }),
    chargedAt: timestamp({ withTimezone: true }),
    error: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("booking_payment_booking_uidx").on(t.bookingId),
    uniqueIndex("booking_payment_session_uidx").on(t.checkoutSessionId),
    index("booking_payment_restaurant_idx").on(t.restaurantId),
  ],
);
