import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { booking } from "./booking.js";
import { createdAt, id, updatedAt } from "./columns.js";
import { area, restaurant } from "./restaurant.js";

/** A physical table on the floor plan. Coordinates are in plan units (0–100 grid). */
export const diningTable = pgTable(
  "dining_table",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    areaId: uuid().references(() => area.id, { onDelete: "set null" }),
    name: text().notNull(),
    minCovers: integer().notNull().default(1),
    maxCovers: integer().notNull().default(2),
    shape: text().notNull().default("rect"),
    x: real().notNull().default(0),
    y: real().notNull().default(0),
    width: real().notNull().default(10),
    height: real().notNull().default(10),
    /** May be pushed together with another joinable table of the same area. */
    joinable: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dining_table_restaurant_idx").on(t.restaurantId)],
);

/** Which tables a booking sits at (one, or a joined pair). */
export const bookingTable = pgTable(
  "booking_table",
  {
    bookingId: uuid()
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    tableId: uuid()
      .notNull()
      .references(() => diningTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.tableId] }),
    index("booking_table_table_idx").on(t.tableId),
  ],
);
