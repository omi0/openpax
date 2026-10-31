import { sql } from "drizzle-orm";
import { index, integer, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { booking } from "./booking.js";
import { createdAt, id, updatedAt } from "./columns.js";
import { restaurant } from "./restaurant.js";

/** A planning meeting between a group booking and the host (chef, manager), on a fixed slot. */
export const bookingMeeting = pgTable(
  "booking_meeting",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    bookingId: uuid()
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    /** iCalendar SEQUENCE: bumped on every move so calendar apps replace the old invite. */
    sequence: integer().notNull().default(0),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("booking_meeting_restaurant_starts_at_idx").on(t.restaurantId, t.startsAt),
    // one host, one meeting per slot; one live meeting per booking
    uniqueIndex("booking_meeting_slot_uidx")
      .on(t.restaurantId, t.startsAt)
      .where(sql`${t.cancelledAt} is null`),
    uniqueIndex("booking_meeting_booking_uidx")
      .on(t.bookingId)
      .where(sql`${t.cancelledAt} is null`),
  ],
);
