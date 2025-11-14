import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns.js";
import { actorTypeEnum } from "./enums.js";
import { restaurant } from "./restaurant.js";

/**
 * Transactional outbox: domain events are inserted in the same transaction
 * as the change that caused them and relayed to subscribers afterwards.
 */
export const outboxEvent = pgTable(
  "outbox_event",
  {
    id: id(),
    type: text().notNull(),
    version: integer().notNull().default(1),
    aggregateType: text().notNull(),
    aggregateId: text().notNull(),
    restaurantId: uuid().references(() => restaurant.id, { onDelete: "cascade" }),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true }),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (t) => [
    index("outbox_event_unpublished_idx").on(t.occurredAt).where(sql`${t.publishedAt} is null`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    restaurantId: uuid().references(() => restaurant.id, { onDelete: "cascade" }),
    organizationId: uuid(),
    actorType: actorTypeEnum().notNull(),
    actorId: text(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    data: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_restaurant_created_idx").on(t.restaurantId, t.createdAt)],
);
