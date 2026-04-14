import { randomUUID } from "node:crypto";
import type { DomainEvent, DomainEventPayloads, DomainEventType } from "@openpax/core";
import type { DbOrTx } from "@openpax/db";
import { outboxEvent } from "@openpax/db";

export interface EmitOptions<T extends DomainEventType> {
  type: T;
  restaurantId: string | null;
  aggregateType: string;
  aggregateId: string;
  payload: DomainEventPayloads[T];
  occurredAt?: Date;
}

/** Write a domain event to the outbox inside the caller's transaction. */
export async function emitEvent<T extends DomainEventType>(
  tx: DbOrTx,
  options: EmitOptions<T>,
): Promise<DomainEvent<T>> {
  const id = randomUUID();
  const occurredAt = options.occurredAt ?? new Date();
  await tx.insert(outboxEvent).values({
    id,
    type: options.type,
    version: 1,
    aggregateType: options.aggregateType,
    aggregateId: options.aggregateId,
    restaurantId: options.restaurantId,
    payload: options.payload as Record<string, unknown>,
    occurredAt,
  });
  return {
    id,
    type: options.type,
    version: 1,
    occurredAt: occurredAt.toISOString(),
    restaurantId: options.restaurantId,
    payload: options.payload,
  };
}
