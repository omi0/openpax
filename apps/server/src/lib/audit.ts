import type { DbOrTx } from "@sitli/db";
import { auditLog } from "@sitli/db";
import type { Actor } from "../context.js";

export interface AuditEntry {
  restaurantId: string | null;
  organizationId?: string | null;
  actor: Actor;
  action: string;
  entityType: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
}

export async function writeAudit(tx: DbOrTx, entry: AuditEntry) {
  await tx.insert(auditLog).values({
    restaurantId: entry.restaurantId,
    organizationId: entry.organizationId ?? null,
    actorType: entry.actor.type,
    actorId: entry.actor.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    data: entry.data ?? null,
  });
}
