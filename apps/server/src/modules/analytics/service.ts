import {
  addDaysToLocalDate,
  instantToLocal,
  type RoomDef,
  resolveServiceWindows,
  totalSeats,
  WEEKDAYS,
  weekdayOf,
} from "@sitli/core";
import { area, booking, scheduleException, service } from "@sitli/db";
import {
  type AnalyticsDto,
  type AnalyticsQuery,
  type AnalyticsTotalsDto,
  type BookingSourceSchemaType,
  LEAD_TIME_BUCKETS,
  type LeadTimeBucket,
} from "@sitli/shared";
import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { AppContext, RestaurantRow } from "../../context.js";
import { ApiError } from "../../lib/errors.js";
import { serviceToDef } from "../availability/service.js";
import { feedbackSummary } from "../feedback/index.js";

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

type ServiceRow = typeof service.$inferSelect;
type ExceptionRow = typeof scheduleException.$inferSelect;

/** Covers a service can seat on a date given its hours, pacing limit and closures. */
function serviceCapacity(
  svc: ReturnType<typeof serviceToDef>,
  date: string,
  exceptions: ExceptionRow[],
): number | null {
  if (svc.maxCoversPerSlot === null || svc.maxCoversPerSlot === undefined) return null;
  const { closed, windows } = resolveServiceWindows(svc, date, exceptions);
  if (closed) return 0;
  let slots = 0;
  for (const w of windows)
    slots += Math.floor((w.endMin - w.startMin) / svc.slotIntervalMinutes) + 1;
  return slots * svc.maxCoversPerSlot;
}

/**
 * Times a seat can be used by a service on a date: every opening window is
 * seated from its first arrival to its last arrival plus the turn time, and
 * that span divided by the turn time is the number of turns. Dinner with
 * arrivals 19:00–22:00 and a 2 h turn offers (180 + 120) / 120 = 2.5 turns.
 */
function serviceTurns(
  svc: ReturnType<typeof serviceToDef>,
  date: string,
  exceptions: ExceptionRow[],
): number {
  if (svc.durationMinutes <= 0) return 0;
  const { closed, windows } = resolveServiceWindows(svc, date, exceptions);
  if (closed) return 0;
  let turns = 0;
  for (const w of windows)
    turns += (w.endMin - w.startMin + svc.durationMinutes) / svc.durationMinutes;
  return turns;
}

function datesBetween(from: string, to: string): string[] {
  if (to < from) throw ApiError.badRequest("invalid_range", "`to` must not be before `from`");
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDaysToLocalDate(d, 1)) {
    dates.push(d);
    if (dates.length > MAX_DAYS)
      throw ApiError.badRequest("range_too_long", `At most ${MAX_DAYS} days per request`);
  }
  return dates;
}

interface RangeAggregate {
  totals: AnalyticsTotalsDto;
  days: AnalyticsDto["days"];
  services: AnalyticsDto["services"];
  sources: AnalyticsDto["sources"];
  weekdays: AnalyticsDto["weekdays"];
}

/**
 * Everything the report needs for one date range; services and the seats of
 * the open rooms (as they are now) are shared between ranges.
 */
async function aggregateRange(
  ctx: AppContext,
  r: RestaurantRow,
  dates: string[],
  services: ServiceRow[],
  seats: number | null,
  today: string,
): Promise<RangeAggregate> {
  const from = dates[0] ?? "";
  const to = dates[dates.length - 1] ?? from;
  const inRange = and(
    eq(booking.restaurantId, r.id),
    gte(booking.serviceDate, from),
    lte(booking.serviceDate, to),
  );
  const [rows, exceptions] = await Promise.all([
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
      .where(inRange)
      .groupBy(booking.serviceDate, booking.serviceId, booking.source, booking.status),
    ctx.db
      .select()
      .from(scheduleException)
      .where(
        and(
          eq(scheduleException.restaurantId, r.id),
          lte(scheduleException.date, to),
          gte(scheduleException.endDate, from),
        ),
      ),
  ]);

  const noCapacity = () => ({
    capacity: null as number | null,
    seatCapacity: null as number | null,
  });
  const days = new Map(dates.map((date) => [date, { ...zero(), ...noCapacity() }]));
  const byService = new Map(
    services.map((s) => [s.id, { serviceId: s.id, name: s.name, ...zero(), ...noCapacity() }]),
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

  // capacity offered per day and per service: arrivals (pacing limit × slots)
  // and seats (open rooms' seats × turns); services that overlap in time share
  // the seats, so the seat figure is an upper bound in that case
  const defs = services.filter((s) => s.active).map(serviceToDef);
  let capacityTotal: number | null = null;
  let coversWithCapacity = 0;
  let seatCapacityTotal: number | null = null;
  let coversWithSeatCapacity = 0;
  for (const date of dates) {
    const day = days.get(date);
    if (!day) continue;
    let dayCapacity: number | null = null;
    let daySeatCapacity: number | null = seats === null ? null : 0;
    for (const def of defs) {
      const svc = byService.get(def.id);
      const cap = serviceCapacity(def, date, exceptions);
      if (cap !== null) {
        dayCapacity = (dayCapacity ?? 0) + cap;
        if (svc) svc.capacity = (svc.capacity ?? 0) + cap;
      }
      if (seats !== null) {
        const seatCap = Math.round(seats * serviceTurns(def, date, exceptions));
        daySeatCapacity = (daySeatCapacity ?? 0) + seatCap;
        if (svc) svc.seatCapacity = (svc.seatCapacity ?? 0) + seatCap;
      }
    }
    day.capacity = dayCapacity;
    day.seatCapacity = daySeatCapacity;
    if (dayCapacity !== null) {
      capacityTotal = (capacityTotal ?? 0) + dayCapacity;
      coversWithCapacity += day.covers;
    }
    if (daySeatCapacity !== null) {
      seatCapacityTotal = (seatCapacityTotal ?? 0) + daySeatCapacity;
      coversWithSeatCapacity += day.covers;
    }
  }

  return {
    totals: {
      ...totals,
      averagePartySize: totals.bookings > 0 ? totals.covers / totals.bookings : null,
      noShowRate: pastBookings > 0 ? pastNoShows / pastBookings : null,
      cancellationRate: totals.created > 0 ? totals.cancelled / totals.created : null,
      capacity: capacityTotal,
      occupancy: capacityTotal ? coversWithCapacity / capacityTotal : null,
      seatCapacity: seatCapacityTotal,
      seatOccupancy: seatCapacityTotal ? coversWithSeatCapacity / seatCapacityTotal : null,
    },
    days: dates.map((date) => ({ date, ...(days.get(date) ?? { ...zero(), ...noCapacity() }) })),
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

/** Hours between creation and arrival, bucketed; negative values (staff back-dating) count as 0. */
const leadHours = sql<number>`greatest(0, extract(epoch from (${booking.startsAt} - ${booking.createdAt})) / 3600)`;
const leadBucket = sql<LeadTimeBucket>`case
  when ${leadHours} < 1 then '1h'
  when ${leadHours} < 6 then '6h'
  when ${leadHours} < 24 then '24h'
  when ${leadHours} < 72 then '3d'
  when ${leadHours} < 168 then '7d'
  when ${leadHours} < 336 then '14d'
  when ${leadHours} < 720 then '30d'
  else '30d+' end`;

async function distributions(
  ctx: AppContext,
  r: RestaurantRow,
  from: string,
  to: string,
): Promise<Pick<AnalyticsDto, "partySizes" | "leadTime">> {
  const active = and(
    eq(booking.restaurantId, r.id),
    gte(booking.serviceDate, from),
    lte(booking.serviceDate, to),
    ne(booking.status, "cancelled"),
  );
  const [sizes, buckets, [stats]] = await Promise.all([
    ctx.db
      .select({
        partySize: booking.partySize,
        bookings: sql<number>`count(*)::int`,
        covers: sql<number>`sum(${booking.partySize})::int`,
      })
      .from(booking)
      .where(active)
      .groupBy(booking.partySize)
      .orderBy(asc(booking.partySize)),
    ctx.db
      .select({ bucket: leadBucket, bookings: sql<number>`count(*)::int` })
      .from(booking)
      .where(active)
      .groupBy(leadBucket),
    ctx.db
      .select({
        median: sql<
          number | null
        >`percentile_cont(0.5) within group (order by ${leadHours})::float`,
        average: sql<number | null>`avg(${leadHours})::float`,
      })
      .from(booking)
      .where(active),
  ]);
  const byBucket = new Map(buckets.map((b) => [b.bucket, b.bookings]));
  return {
    partySizes: sizes,
    leadTime: {
      buckets: LEAD_TIME_BUCKETS.map((bucket) => ({ bucket, bookings: byBucket.get(bucket) ?? 0 })),
      medianHours: stats?.median ?? null,
      averageHours: stats?.average ?? null,
    },
  };
}

export async function getAnalytics(
  ctx: AppContext,
  r: RestaurantRow,
  q: AnalyticsQuery,
): Promise<AnalyticsDto> {
  const dates = datesBetween(q.from, q.to);
  const previousTo = addDaysToLocalDate(q.from, -1);
  const previousFrom = addDaysToLocalDate(previousTo, -(dates.length - 1));
  const previousDates = datesBetween(previousFrom, previousTo);
  const today = instantToLocal(ctx.now(), r.timezone).date;

  const [services, rooms] = await Promise.all([
    ctx.db
      .select()
      .from(service)
      .where(eq(service.restaurantId, r.id))
      .orderBy(asc(service.sortOrder), asc(service.name)),
    ctx.db
      .select({ id: area.id, seats: area.seats, active: area.active })
      .from(area)
      .where(eq(area.restaurantId, r.id)),
  ]);
  // rooms have no history: the seats open today stand for the whole range
  const seats = totalSeats(rooms.map((x): RoomDef => ({ ...x })));
  const [current, previous, dist, feedback] = await Promise.all([
    aggregateRange(ctx, r, dates, services, seats, today),
    aggregateRange(ctx, r, previousDates, services, seats, today),
    distributions(ctx, r, q.from, q.to),
    feedbackSummary(ctx, r.id, { from: q.from, to: q.to }),
  ]);

  return {
    from: q.from,
    to: q.to,
    seats,
    ...current,
    previous: { from: previousFrom, to: previousTo, totals: previous.totals },
    ...dist,
    feedback,
  };
}

// ---------- CSV export

const csvCell = (v: string | number | null): string => {
  if (v === null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per day of the range; the last line carries the totals. */
export function analyticsToCsv(data: AnalyticsDto): string {
  const lines: string[][] = [
    [
      "date",
      "weekday",
      "bookings",
      "covers",
      "cancelled",
      "no_shows",
      "capacity",
      "occupancy",
      "seat_capacity",
      "seat_occupancy",
    ],
  ];
  for (const d of data.days) {
    lines.push([
      d.date,
      weekdayOf(d.date),
      String(d.bookings),
      String(d.covers),
      String(d.cancelled),
      String(d.noShows),
      d.capacity === null ? "" : String(d.capacity),
      d.capacity ? (d.covers / d.capacity).toFixed(4) : "",
      d.seatCapacity === null ? "" : String(d.seatCapacity),
      d.seatCapacity ? (d.covers / d.seatCapacity).toFixed(4) : "",
    ]);
  }
  const t = data.totals;
  lines.push([
    "total",
    "",
    String(t.bookings),
    String(t.covers),
    String(t.cancelled),
    String(t.noShows),
    t.capacity === null ? "" : String(t.capacity),
    t.occupancy === null ? "" : t.occupancy.toFixed(4),
    t.seatCapacity === null ? "" : String(t.seatCapacity),
    t.seatOccupancy === null ? "" : t.seatOccupancy.toFixed(4),
  ]);
  return `${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
