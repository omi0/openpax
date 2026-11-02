import { addDaysToLocalDate, localToInstant } from "@openpax/core";
import { area, auditLog, booking, customer, service } from "@openpax/db";
import { and, desc, eq, gte, ilike, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { AppContext, RestaurantRow } from "../../context.js";

/**
 * Who did what to the bookings, read back from the audit log: taking,
 * changing, cancelling, marking no-shows and reopening. Every entry since the
 * log records the operator has an `operator` key (null when nobody was asked);
 * older cancellations fall back to the name kept on the booking.
 */

export const ACTIVITY_ACTIONS = [
  "created",
  "modified",
  "cancelled",
  "no_show",
  "reopened",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

const AUDIT_ACTION: Record<ActivityAction, string> = {
  created: "booking.created",
  modified: "booking.modified",
  cancelled: "booking.cancel",
  no_show: "booking.no_show",
  reopened: "booking.reopen",
};
const ACTION_OF = new Map(Object.entries(AUDIT_ACTION).map(([k, v]) => [v, k as ActivityAction]));

export interface ActivityQuery {
  /** Local dates, both included; left out with a bookingId = its whole history. */
  from?: string;
  to?: string;
  bookingId?: string;
  /** Part of the operator's name, any case. */
  operator?: string;
  by?: "online" | "assistant";
  actions?: ActivityAction[];
  limit: number;
}

export type ActivityActor = "operator" | "assistant" | "guest" | "api" | "system" | "dashboard";

export interface ActivityChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface ActivityItem {
  at: Date;
  action: ActivityAction;
  operator: string | null;
  actor: ActivityActor;
  booking: {
    id: string;
    guest: string;
    serviceDate: string;
    startsAt: Date;
    partySize: number;
    status: string;
  };
  changes?: ActivityChange[];
  reason?: string | null;
  imported?: boolean;
}

// Taking a booking credits the name on the booking, which managers may have
// corrected (or cleared) since; online bookings were taken by the guest.
// A cancellation from before the operator was logged (no key at all) can only
// borrow the name kept on the booking.
const operatorOf = sql<string | null>`case
  when ${auditLog.action} = 'booking.created'
    then case when ${auditLog.actorType} <> 'guest' then ${booking.operatorName} end
  when ${auditLog.data}->'operator' is not null then ${auditLog.data}->>'operator'
  when ${auditLog.action} = 'booking.cancel' and ${auditLog.actorType} = 'user'
    and ${auditLog.data}->>'via' is null
    then ${booking.cancelledByOperatorName}
end`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

type Data = Record<string, unknown> | null;

function actorOf(actorType: string, data: Data, operator: string | null): ActivityActor {
  if (data?.via === "assistant") return "assistant";
  if (operator) return "operator";
  if (actorType === "guest") return "guest";
  if (actorType === "api_key") return "api";
  if (actorType === "system") return "system";
  return "dashboard";
}

export async function listActivity(
  ctx: AppContext,
  r: RestaurantRow,
  q: ActivityQuery,
): Promise<{ items: ActivityItem[]; more: boolean }> {
  const where: (SQL | undefined)[] = [
    eq(auditLog.restaurantId, r.id),
    eq(auditLog.entityType, "booking"),
    inArray(
      auditLog.action,
      (q.actions?.length ? q.actions : ACTIVITY_ACTIONS).map((a) => AUDIT_ACTION[a]),
    ),
  ];
  if (q.from) where.push(gte(auditLog.createdAt, localToInstant(q.from, 0, r.timezone)));
  if (q.to)
    where.push(lt(auditLog.createdAt, localToInstant(addDaysToLocalDate(q.to, 1), 0, r.timezone)));
  if (q.bookingId) where.push(eq(auditLog.entityId, q.bookingId), eq(booking.id, q.bookingId));
  if (q.operator) where.push(ilike(operatorOf, `%${escapeLike(q.operator)}%`));
  if (q.by === "online") where.push(eq(auditLog.actorType, "guest"));
  if (q.by === "assistant") where.push(sql`${auditLog.data}->>'via' = 'assistant'`);

  // newest first, so a long period loses its oldest entries rather than today's
  const query = ctx.db
    .select({
      at: auditLog.createdAt,
      action: auditLog.action,
      actorType: auditLog.actorType,
      data: auditLog.data,
      operator: operatorOf,
      booking,
      guest: customer.name,
    })
    .from(auditLog)
    // the log keeps entity ids as text
    .innerJoin(booking, sql`${booking.id}::text = ${auditLog.entityId}`)
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .where(and(...where))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(q.limit + 1);

  const [rows, services, areas] = await Promise.all([
    query,
    ctx.db
      .select({ id: service.id, name: service.name })
      .from(service)
      .where(eq(service.restaurantId, r.id)),
    ctx.db.select({ id: area.id, name: area.name }).from(area).where(eq(area.restaurantId, r.id)),
  ]);
  const names = new Map([...services, ...areas].map((x) => [x.id, x.name]));
  const named = (v: unknown) => (typeof v === "string" ? (names.get(v) ?? v) : v);

  const items = rows
    .slice(0, q.limit)
    .reverse()
    .map((x): ActivityItem => {
      const action = ACTION_OF.get(x.action) ?? "modified";
      const data = x.data as Data;
      const item: ActivityItem = {
        at: x.at,
        action,
        operator: x.operator,
        actor: actorOf(x.actorType, data, x.operator),
        booking: {
          id: x.booking.id,
          guest: x.guest,
          serviceDate: x.booking.serviceDate,
          startsAt: x.booking.startsAt,
          partySize: x.booking.partySize,
          status: x.booking.status,
        },
      };
      if (action === "modified" && Array.isArray(data?.changes)) {
        const before = (data.before ?? {}) as Record<string, unknown>;
        const after = (data.after ?? {}) as Record<string, unknown>;
        item.changes = (data.changes as string[]).map((field) =>
          field in before || field in after
            ? { field, from: named(before[field]), to: named(after[field]) }
            : { field },
        );
      }
      if (action === "cancelled" && typeof data?.reason === "string") item.reason = data.reason;
      if (action === "created" && data?.imported) item.imported = true;
      return item;
    });
  return { items, more: rows.length > q.limit };
}
