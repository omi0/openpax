import {
  ACTIVE_BOOKING_STATUSES,
  type AvailabilityInput,
  type AvailabilityResult,
  addDaysToLocalDate,
  type BookingLoad,
  type CapacityRuleDef,
  computeAvailability,
  type LocalDate,
  type RoomDef,
  resolveServiceWindows,
  type ScheduleExceptionDef,
  type ServiceDef,
  type TableDef,
  type TableLoad,
} from "@sitli/core";
import type { DbOrTx } from "@sitli/db";
import {
  area,
  booking,
  bookingPolicy,
  bookingTable,
  capacityRule,
  diningTable,
  scheduleException,
  service,
} from "@sitli/db";
import type { AvailabilityResponse, MonthAvailabilityResponse } from "@sitli/shared";
import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { AppContext, RestaurantRow } from "../../context.js";
import { ApiError } from "../../lib/errors.js";

export type ServiceRow = typeof service.$inferSelect;

export function serviceToDef(row: ServiceRow): ServiceDef {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    weeklyHours: row.weeklyHours,
    slotIntervalMinutes: row.slotIntervalMinutes,
    durationMinutes: row.durationMinutes,
    maxCoversPerSlot: row.maxCoversPerSlot,
    maxBookingsPerSlot: row.maxBookingsPerSlot,
    minPartySize: row.minPartySize,
    maxPartySize: row.maxPartySize,
  };
}

export type TableRow = typeof diningTable.$inferSelect;

export function tableToDef(row: TableRow): TableDef {
  return {
    id: row.id,
    areaId: row.areaId,
    name: row.name,
    minCovers: row.minCovers,
    maxCovers: row.maxCovers,
    joinable: row.joinable,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export interface LoadedAvailability {
  input: AvailabilityInput;
  services: ServiceRow[];
  tables: TableRow[];
}

export interface LoadParams {
  date: LocalDate;
  partySize: number;
  areaId?: string | null;
  now?: Date;
  /** Exclude one booking from the load (when modifying it). */
  excludeBookingId?: string;
}

/** Load everything the engine needs for one restaurant date. Safe to call inside a transaction. */
export async function loadAvailabilityInput(
  db: DbOrTx,
  ctx: AppContext,
  r: RestaurantRow,
  params: LoadParams,
): Promise<LoadedAvailability> {
  // Sequential on purpose: this often runs inside a transaction (one connection).
  const services = await db
    .select()
    .from(service)
    .where(and(eq(service.restaurantId, r.id), eq(service.active, true)));
  const exceptions = await db
    .select()
    .from(scheduleException)
    .where(and(eq(scheduleException.restaurantId, r.id), eq(scheduleException.date, params.date)));
  const rules = await db
    .select()
    .from(capacityRule)
    .where(and(eq(capacityRule.restaurantId, r.id), eq(capacityRule.active, true)));
  const [policy] = await db
    .select()
    .from(bookingPolicy)
    .where(eq(bookingPolicy.restaurantId, r.id))
    .limit(1);
  const bookings = await db
    .select({
      id: booking.id,
      serviceId: booking.serviceId,
      areaId: booking.areaId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      partySize: booking.partySize,
    })
    .from(booking)
    .where(
      and(
        eq(booking.restaurantId, r.id),
        gte(booking.serviceDate, addDaysToLocalDate(params.date, -1)),
        lte(booking.serviceDate, addDaysToLocalDate(params.date, 1)),
        inArray(booking.status, [...ACTIVE_BOOKING_STATUSES]),
      ),
    );
  if (!policy) throw ApiError.notFound("Booking policy");
  const rooms = await db
    .select({ id: area.id, name: area.name, seats: area.seats, active: area.active })
    .from(area)
    .where(eq(area.restaurantId, r.id));
  const tables = await db
    .select()
    .from(diningTable)
    .where(and(eq(diningTable.restaurantId, r.id), eq(diningTable.active, true)))
    .orderBy(asc(diningTable.sortOrder), asc(diningTable.name));
  const tableRows =
    tables.length === 0
      ? []
      : await db
          .select({
            bookingId: bookingTable.bookingId,
            tableId: bookingTable.tableId,
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
          })
          .from(bookingTable)
          .innerJoin(booking, eq(booking.id, bookingTable.bookingId))
          .where(
            and(
              eq(booking.restaurantId, r.id),
              gte(booking.serviceDate, addDaysToLocalDate(params.date, -1)),
              lte(booking.serviceDate, addDaysToLocalDate(params.date, 1)),
              inArray(booking.status, [...ACTIVE_BOOKING_STATUSES]),
            ),
          );

  const existing: BookingLoad[] = bookings
    .filter((b) => b.id !== params.excludeBookingId)
    .map((b) => ({
      serviceId: b.serviceId,
      areaId: b.areaId,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      partySize: b.partySize,
    }));

  const input: AvailabilityInput = {
    timezone: r.timezone,
    date: params.date,
    partySize: params.partySize,
    now: params.now ?? ctx.now(),
    areaId: params.areaId ?? null,
    services: services.map(serviceToDef),
    exceptions: exceptions.map(
      (e): ScheduleExceptionDef => ({
        serviceId: e.serviceId,
        date: e.date,
        closed: e.closed,
        windows: e.windows,
      }),
    ),
    capacityRules: rules.map(
      (c): CapacityRuleDef => ({
        id: c.id,
        serviceId: c.serviceId,
        areaId: c.areaId,
        weekday: c.weekday as CapacityRuleDef["weekday"],
        date: c.date,
        startTime: c.startTime,
        endTime: c.endTime,
        maxCovers: c.maxCovers,
        maxBookings: c.maxBookings,
        maxPartySize: c.maxPartySize,
      }),
    ),
    policy: {
      minLeadMinutes: policy.minLeadMinutes,
      maxAdvanceDays: policy.maxAdvanceDays,
      minPartySize: policy.minPartySize,
      maxPartySize: policy.maxPartySize,
    },
    existingBookings: existing,
    rooms: rooms.map(
      (x): RoomDef => ({ id: x.id, name: x.name, seats: x.seats, active: x.active }),
    ),
    ...(tables.length > 0
      ? {
          tables: tables.map(tableToDef),
          tableLoads: tableRows
            .filter((t) => t.bookingId !== params.excludeBookingId)
            .map(
              (t): TableLoad => ({ tableId: t.tableId, startsAt: t.startsAt, endsAt: t.endsAt }),
            ),
        }
      : {}),
  };
  return { input, services, tables };
}

export function toAvailabilityResponse(
  r: RestaurantRow,
  loaded: LoadedAvailability,
  result: AvailabilityResult,
): AvailabilityResponse {
  return {
    date: result.date,
    timezone: r.timezone,
    closed: result.closed,
    reasons: result.reasons,
    services: loaded.services.map((s) => ({ id: s.id, name: s.name })),
    slots: result.slots.map((s) => ({
      serviceId: s.serviceId,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      startLocal: s.startLocal,
      remainingCovers: s.remainingCovers,
      available: s.available,
      ...(s.reason ? { reason: s.reason } : {}),
    })),
  };
}

export async function getAvailability(
  ctx: AppContext,
  r: RestaurantRow,
  params: LoadParams,
): Promise<AvailabilityResponse> {
  const loaded = await loadAvailabilityInput(ctx.db, ctx, r, params);
  return toAvailabilityResponse(r, loaded, computeAvailability(loaded.input));
}

/** Days of a month with at least one open service (ignores capacity and policy). */
export async function getMonthAvailability(
  ctx: AppContext,
  r: RestaurantRow,
  month: string,
): Promise<MonthAvailabilityResponse> {
  const first: LocalDate = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextMonth: LocalDate = `${String(m === 12 ? (y ?? 0) + 1 : y).padStart(4, "0")}-${String(m === 12 ? 1 : (m ?? 0) + 1).padStart(2, "0")}-01`;
  const [services, exceptions] = await Promise.all([
    ctx.db
      .select()
      .from(service)
      .where(and(eq(service.restaurantId, r.id), eq(service.active, true))),
    ctx.db
      .select()
      .from(scheduleException)
      .where(
        and(
          eq(scheduleException.restaurantId, r.id),
          gte(scheduleException.date, first),
          lt(scheduleException.date, nextMonth),
        ),
      ),
  ]);
  const defs = services.map(serviceToDef);
  const exDefs = exceptions.map(
    (e): ScheduleExceptionDef => ({
      serviceId: e.serviceId,
      date: e.date,
      closed: e.closed,
      windows: e.windows,
    }),
  );
  const openDates: LocalDate[] = [];
  for (let d = first; d.startsWith(month); d = addDaysToLocalDate(d, 1)) {
    if (defs.some((s) => !resolveServiceWindows(s, d, exDefs).closed)) openDates.push(d);
  }
  return { month, openDates };
}
