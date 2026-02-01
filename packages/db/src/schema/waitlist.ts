import {
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
import { booking, customer } from "./booking.js";
import { createdAt, id, updatedAt } from "./columns.js";
import { bookingSourceEnum, waitlistStatusEnum } from "./enums.js";
import { restaurant } from "./restaurant.js";
import { service } from "./service.js";

/**
 * A guest waiting for a table on a date. Offers do not hold capacity: the
 * booking is created when the guest accepts (or staff books them in).
 */
export const waitlistEntry = pgTable(
  "waitlist_entry",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    customerId: uuid()
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    /** Preferred service, if the guest picked one. */
    serviceId: uuid().references(() => service.id, { onDelete: "set null" }),
    serviceDate: date().notNull(),
    partySize: integer().notNull(),
    /** Preferred wall-clock time "HH:mm", if any. */
    preferredTime: text(),
    notes: text(),
    locale: text().notNull().default("it"),
    source: bookingSourceEnum().notNull().default("widget"),
    status: waitlistStatusEnum().notNull().default("waiting"),
    /** Secret token in the guest's link. */
    token: text().notNull(),
    offeredServiceId: uuid().references(() => service.id, { onDelete: "set null" }),
    offeredStartsAt: timestamp({ withTimezone: true }),
    offerExpiresAt: timestamp({ withTimezone: true }),
    bookingId: uuid().references(() => booking.id, { onDelete: "set null" }),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("waitlist_entry_restaurant_date_idx").on(t.restaurantId, t.serviceDate),
    index("waitlist_entry_customer_idx").on(t.customerId),
    uniqueIndex("waitlist_entry_token_uidx").on(t.token),
  ],
);
