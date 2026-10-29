import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.js";
import { restaurant } from "./restaurant.js";

/**
 * A member of the floor staff behind the shared dashboard login. They pick
 * their name and type a 6-digit PIN to take, change or cancel a booking.
 */
export const bookingOperator = pgTable(
  "booking_operator",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** scrypt$salt$hash, base64. */
    pinHash: text().notNull(),
    sortOrder: integer().notNull().default(0),
    /** Wrong PINs in a row; five lock the operator for a few minutes. */
    failedAttempts: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("booking_operator_name_uidx").on(t.restaurantId, sql`lower(${t.name})`)],
);
