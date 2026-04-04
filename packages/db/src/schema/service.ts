import type { TimeWindow, WeeklyHours } from "@sitli/core";
import { boolean, date, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.js";
import { area, restaurant } from "./restaurant.js";

export const service = pgTable(
  "service",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    name: text().notNull(),
    weeklyHours: jsonb().$type<WeeklyHours>().notNull().default({}),
    slotIntervalMinutes: integer().notNull().default(30),
    durationMinutes: integer().notNull().default(120),
    maxCoversPerSlot: integer(),
    maxBookingsPerSlot: integer(),
    minPartySize: integer(),
    maxPartySize: integer(),
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("service_restaurant_idx").on(t.restaurantId)],
);

export const scheduleException = pgTable(
  "schedule_exception",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    serviceId: uuid().references(() => service.id, { onDelete: "cascade" }),
    /** First day of the closure or special hours. */
    date: date().notNull(),
    /** Last day (inclusive); equals `date` for a single day. */
    endDate: date().notNull(),
    closed: boolean().notNull().default(true),
    windows: jsonb().$type<TimeWindow[]>(),
    reason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("schedule_exception_restaurant_date_idx").on(t.restaurantId, t.date)],
);

export const capacityRule = pgTable(
  "capacity_rule",
  {
    id: id(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurant.id, { onDelete: "cascade" }),
    name: text(),
    serviceId: uuid().references(() => service.id, { onDelete: "cascade" }),
    areaId: uuid().references(() => area.id, { onDelete: "cascade" }),
    weekday: text(),
    /** First day the rule applies to (null = any day, or the weekday). */
    date: date(),
    /** Last day (inclusive) when the rule covers a range; null = the single `date`. */
    endDate: date(),
    startTime: text(),
    endTime: text(),
    maxCovers: integer(),
    maxBookings: integer(),
    maxPartySize: integer(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("capacity_rule_restaurant_idx").on(t.restaurantId)],
);
