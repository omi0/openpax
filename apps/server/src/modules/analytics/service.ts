import {
  addDaysToLocalDate,
  instantToLocal,
  resolveServiceWindows,
  WEEKDAYS,
  weekdayOf,
} from "@sitli/core";
import { booking, scheduleException, service } from "@sitli/db";
import type { AnalyticsDto, AnalyticsQuery, BookingSourceSchemaType } from "@sitli/shared";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { AppContext, RestaurantRow } from "../../context.js";
import { ApiError } from "../../lib/errors.js";
import { serviceToDef } from "../availability/service.js";

const MAX_DAYS = 366;

interface Counts {
  bookings: number;
  covers: number;
  cancelled: number;
  noShows: number;
}
const zero = (): Counts => ({ bookings: 0, covers: 0, cancelled: 0, noShows: 0 });

function add(target: Counts, status: string, count: number, covers: number) {
  if (status === "cancelled") {
    target.cancelled += count;
    return;
  }
  target.bookings += count;
  target.covers += covers;
  if (status === "no_show") target.noShows += count;
}

/** Covers a service can seat on a date given its hours, pacing limit and closures. */
function serviceCapacity(
  svc: ReturnType<typeof serviceToDef>,
  date: string,
  exceptions: Array<{
    serviceId: string | null;
    date: string;
    closed: boolean;
    windows: { start: string; end: string }[] | null;
  }>,
): number | null {
  if (svc.maxCoversPerSlot === null || svc.maxCoversPerSlot === undefined) return null;
  const { closed, windows } = resolveServiceWindows(svc, date, exceptions);
  if (closed) return 0;
  let slots = 0;
  for (const w of windows)
    slots += Math.floor((w.endMin - w.startMin) / svc.slotIntervalMinutes) + 1;
  return slots * svc.maxCoversPerSlot;
}

export async function getAnalytics(
  ctx: AppContext,
  r: RestaurantRow,
  q: AnalyticsQuery,
): Promise<AnalyticsDto> {
  if (q.to < q.from) throw ApiError.badRequest("invalid_range", "`to` must not be before `from`");
  const dates: string[] = [];
  for (let d = q.from; d <= q.to; d = addDaysToLocalDate(d, 1)) {
    dates.push(d);
    if (dates.length > MAX_DAYS)
      throw ApiError.badRequest("range_too_long", `At most ${MAX_DAYS} days per request`);
  }
  const today = instantToLocal(ctx.now(), r.timezone).date;

  const [rows, services, exceptions] = await Promise.all([
    ctx.db
      .select({
        date: booking.serviceDate,
        serviceId: booking.serviceId,
        source: booking.source,
        status: booking.status,
        count: sql<number>`count(*)::int`,
        covers: sql<number>`coalesce(sum(${booking.partySize}), 0)::int`,
      })
      .from(booking)
      .where(
        and(
          eq(booking.restaurantId, r.id),
          gte(booking.serviceDate, q.from),
          lte(booking.serviceDate, q.to),
        ),
      )
      .groupBy(booking.serviceDate, booking.serviceId, booking.source, booking.status),
    ctx.db
      .select()
      .from(service)
      .where(eq(service.restaurantId, r.id))
      .orderBy(asc(service.sortOrder), asc(service.name)),
    ctx.db
      .select()
      .from(scheduleException)
      .where(
        and(
          eq(scheduleException.restaurantId, r.id),
          gte(scheduleException.date, q.from),
          lte(scheduleException.date, q.to),
        ),
      ),
  ]);

  const days = new Map(dates.map((date) => [date, { ...zero(), capacity: null as number | null }]));
  const byService = new Map(
    services.map((s) => [
      s.id,
      { serviceId: s.id, name: s.name, ...zero(), capacity: null as number | null },
    ]),
  );
  const bySource = new Map<string, Counts>();
  const byWeekday = new Map(WEEKDAYS.map((w) => [w, { bookings: 0, covers: 0 }]));
  const totals = { ...zero(), created: 0 };
  let pastBookings = 0;
  let pastNoShows = 0;

  for (const row of rows) {
    totals.created += row.count;
    add(totals, row.status, row.count, row.covers);
    const day = days.get(row.date);
    if (day) add(day, row.status, row.count, row.covers);
    const svc = byService.get(row.serviceId);
    if (svc) add(svc, row.status, row.count, row.covers);
    const src = bySource.get(row.source) ?? zero();
    add(src, row.status, row.count, row.covers);
    bySource.set(row.source, src);
    if (row.status !== "cancelled") {
      const wd = byWeekday.get(weekdayOf(row.date));
      if (wd) {
        wd.bookings += row.count;
        wd.covers += row.covers;
      }
      if (row.date < today) {
        pastBookings += row.count;
        if (row.status === "no_show") pastNoShows += row.count;
      }
    }
  }

  // capacity offered per day and per service
  const defs = services.filter((s) => s.active).map(serviceToDef);
  let capacityTotal: number | null = null;
  let coversWithCapacity = 0;
  for (const date of dates) {
    const day = days.get(date);
    if (!day) continue;
    let dayCapacity: number | null = null;
    for (const def of defs) {
      const cap = serviceCapacity(def, date, exceptions);
      if (cap === null) continue;
      dayCapacity = (dayCapacity ?? 0) + cap;
      const svc = byService.get(def.id);
      if (svc) svc.capacity = (svc.capacity ?? 0) + cap;
    }
    day.capacity = dayCapacity;
    if (dayCapacity !== null) {
      capacityTotal = (capacityTotal ?? 0) + dayCapacity;
      coversWithCapacity += day.covers;
    }
  }

  return {
    from: q.from,
    to: q.to,
    totals: {
      ...totals,
      averagePartySize: totals.bookings > 0 ? totals.covers / totals.bookings : null,
      noShowRate: pastBookings > 0 ? pastNoShows / pastBookings : null,
      cancellationRate: totals.created > 0 ? totals.cancelled / totals.created : null,
      capacity: capacityTotal,
      occupancy: capacityTotal ? coversWithCapacity / capacityTotal : null,
    },
    days: dates.map((date) => ({ date, ...(days.get(date) ?? { ...zero(), capacity: null }) })),
    services: [...byService.values()],
    sources: [...bySource.entries()]
      .map(([source, c]) => ({ source: source as BookingSourceSchemaType, ...c }))
      .sort((a, b) => b.bookings - a.bookings),
    weekdays: WEEKDAYS.map((weekday) => ({
      weekday,
      ...(byWeekday.get(weekday) ?? { bookings: 0, covers: 0 }),
    })),
  };
}
