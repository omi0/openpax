import type { DomainEvent, DomainEventType } from "@openpax/core";
import { isDomainEventType } from "@openpax/core";
import { outboxEvent } from "@openpax/db";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";

export interface EventHandlerDef<T extends DomainEventType = DomainEventType> {
  type: T;
  handle: (event: DomainEvent<T>, ctx: AppContext) => Promise<void>;
}

export function defineEventHandler<T extends DomainEventType>(
  def: EventHandlerDef<T>,
): EventHandlerDef<T> {
  return def;
}

/** Union of every concrete handler type, so modules can list handlers of different events together. */
export type AnyEventHandler = { [K in DomainEventType]: EventHandlerDef<K> }[DomainEventType];

export type HandlerRegistry = Map<DomainEventType, AnyEventHandler[]>;

export function buildHandlerRegistry(handlers: AnyEventHandler[]): HandlerRegistry {
  const registry: HandlerRegistry = new Map();
  for (const h of handlers) {
    const list = registry.get(h.type) ?? [];
    list.push(h);
    registry.set(h.type, list);
  }
  return registry;
}

const MAX_ATTEMPTS = 10;

/**
 * Deliver unpublished outbox events to in-process handlers. Rows are locked
 * with SKIP LOCKED so several workers can relay concurrently. Handlers must
 * be idempotent: a crash after a handler ran but before the row is marked
 * published re-delivers the event.
 */
export async function relayOutboxOnce(
  ctx: AppContext,
  registry: HandlerRegistry,
  limit = 50,
): Promise<number> {
  return ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outboxEvent)
      .where(and(isNull(outboxEvent.publishedAt), lt(outboxEvent.attempts, MAX_ATTEMPTS)))
      .orderBy(asc(outboxEvent.occurredAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    let delivered = 0;
    for (const row of rows) {
      if (!isDomainEventType(row.type)) {
        await tx
          .update(outboxEvent)
          .set({ publishedAt: new Date(), lastError: "unknown event type" })
          .where(eq(outboxEvent.id, row.id));
        continue;
      }
      const event: DomainEvent = {
        id: row.id,
        type: row.type,
        version: 1,
        occurredAt: row.occurredAt.toISOString(),
        restaurantId: row.restaurantId,
        payload: row.payload as never,
      };
      try {
        for (const handler of registry.get(row.type) ?? []) {
          await handler.handle(event as never, ctx);
        }
        await tx
          .update(outboxEvent)
          .set({ publishedAt: new Date() })
          .where(eq(outboxEvent.id, row.id));
        delivered += 1;
      } catch (error) {
        ctx.logger.error({ err: error, eventId: row.id, type: row.type }, "event handler failed");
        await tx
          .update(outboxEvent)
          .set({
            attempts: sql`${outboxEvent.attempts} + 1`,
            lastError: error instanceof Error ? error.message : String(error),
          })
          .where(eq(outboxEvent.id, row.id));
      }
    }
    return delivered;
  });
}

export function startOutboxRelay(ctx: AppContext, registry: HandlerRegistry, intervalMs = 2000) {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      let n = 0;
      do {
        n = await relayOutboxOnce(ctx, registry);
      } while (n > 0 && !stopped);
    } catch (error) {
      ctx.logger.error({ err: error }, "outbox relay failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
