import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { booking, customer } from "./booking.js";
import { createdAt, id } from "./columns.js";
import { restaurant } from "./restaurant.js";

/** What a guest said after the visit: one answer per booking. */
export const bookingFeedback = pgTable(
  "booking_feedback",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    bookingId: uuid()
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    customerId: uuid()
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    /** 1–5 stars. */
    rating: integer().notNull(),
    comment: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("booking_feedback_booking_uidx").on(t.bookingId),
    index("booking_feedback_restaurant_created_idx").on(t.restaurantId, t.createdAt),
  ],
);
