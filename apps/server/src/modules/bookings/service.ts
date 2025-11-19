import {
  addDaysToLocalDate,
  assertSlotBookable,
  type BookingAction,
  type BookingSource,
  type BookingStatus,
  instantToLocal,
  isActiveStatus,
  localDateParts,
  SlotUnavailableError,
  transition,
} from "@sitli/core";
import type { DbOrTx } from "@sitli/db";
import { booking, bookingPolicy, customer, service } from "@sitli/db";
import type {
  BookingDto,
  ListBookingsQuery,
  PublicBookingDto,
  UpdateBookingInput,
} from "@sitli/shared";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { emitEvent } from "../../events/outbox.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { normalizePhone } from "../../lib/phone.js";
import { newConfirmationCode, newToken } from "../../lib/random.js";
import { findRestaurantById } from "../../lib/restaurant-lookup.js";
import { loadAvailabilityInput } from "../availability/service.js";

type BookingRow = typeof booking.$inferSelect;
type CustomerRow = typeof customer.$inferSelect;

export interface BookingWithRelations {
  booking: BookingRow;
  customer: CustomerRow;
  serviceName: string;
}

// ---------- DTOs

export function toBookingDto(x: BookingWithRelations): BookingDto {
  return {
    id: x.booking.id,
    restaurantId: x.booking.restaurantId,
    serviceId: x.booking.serviceId,
    serviceName: x.serviceName,
    areaId: x.booking.areaId,
    customer: {
      id: x.customer.id,
      name: x.customer.name,
      email: x.customer.email,
      phone: x.customer.phone,
      locale: x.customer.locale as BookingDto["customer"]["locale"],
      visitCount: x.customer.visitCount,
      noShowCount: x.customer.noShowCount,
    },
    serviceDate: x.booking.serviceDate,
    startsAt: x.booking.startsAt.toISOString(),
    endsAt: x.booking.endsAt.toISOString(),
    partySize: x.booking.partySize,
    status: x.booking.status,
    source: x.booking.source,
    locale: x.booking.locale as BookingDto["locale"],
    notes: x.booking.notes,
    confirmationCode: x.booking.confirmationCode,
    createdAt: x.booking.createdAt.toISOString(),
    updatedAt: x.booking.updatedAt.toISOString(),
  };
}

export function manageUrl(ctx: AppContext, r: RestaurantRow, token: string): string {
  return `${ctx.env.PUBLIC_URL}/book/${r.slug}/manage/${token}`;
}

export function toPublicBookingDto(
  ctx: AppContext,
  r: RestaurantRow,
  x: BookingWithRelations,
  cutoffMinutes: number,
): PublicBookingDto {
  const cutoff = x.booking.startsAt.getTime() - cutoffMinutes * 60_000;
  return {
    id: x.booking.id,
    confirmationCode: x.booking.confirmationCode,
    status: x.booking.status,
    serviceDate: x.booking.serviceDate,
    startsAt: x.booking.startsAt.toISOString(),
    endsAt: x.booking.endsAt.toISOString(),
    partySize: x.booking.partySize,
    guestName: x.customer.name,
    serviceName: x.serviceName,
    restaurant: {
      name: r.name,
      slug: r.slug,
      timezone: r.timezone,
      address: r.address,
      phone: r.phone,
    },
    canCancel: isActiveStatus(x.booking.status) && ctx.now().getTime() < cutoff,
    manageUrl: manageUrl(ctx, r, x.booking.manageToken),
  };
}

// ---------- lookups

export async function getBookingWithRelations(
  db: DbOrTx,
  restaurantId: string,
  bookingId: string,
): Promise<BookingWithRelations> {
  const [row] = await db
    .select({ booking, customer, serviceName: service.name })
    .from(booking)
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .innerJoin(service, eq(service.id, booking.serviceId))
    .where(and(eq(booking.id, bookingId), eq(booking.restaurantId, restaurantId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Booking");
  return row;
}

export async function getBookingByToken(
  ctx: AppContext,
  token: string,
): Promise<BookingWithRelations> {
  const [row] = await ctx.db
    .select({ booking, customer, serviceName: service.name })
    .from(booking)
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .innerJoin(service, eq(service.id, booking.serviceId))
    .where(eq(booking.manageToken, token))
    .limit(1);
  if (!row) throw ApiError.notFound("Booking");
  return row;
}

export async function listBookings(ctx: AppContext, r: RestaurantRow, q: ListBookingsQuery) {
  const conditions = [eq(booking.restaurantId, r.id)];
  if (q.date) conditions.push(eq(booking.serviceDate, q.date));
  if (q.from) conditions.push(gte(booking.serviceDate, q.from));
  if (q.to) conditions.push(lte(booking.serviceDate, q.to));
  if (q.status && q.status.length > 0) conditions.push(inArray(booking.status, q.status));
  if (q.serviceId) conditions.push(eq(booking.serviceId, q.serviceId));
  if (q.search) {
    const term = `%${q.search}%`;
    const match = or(
      ilike(customer.name, term),
      ilike(customer.email, term),
      ilike(customer.phone, term),
      ilike(booking.confirmationCode, term),
    );
    if (match) conditions.push(match);
  }
  const where = and(...conditions);
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select({ booking, customer, serviceName: service.name })
      .from(booking)
      .innerJoin(customer, eq(customer.id, booking.customerId))
      .innerJoin(service, eq(service.id, booking.serviceId))
      .where(where)
      .orderBy(asc(booking.startsAt), desc(booking.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    ctx.db
      .select({ total: sql<number>`count(*)::int` })
      .from(booking)
      .innerJoin(customer, eq(customer.id, booking.customerId))
      .where(where),
  ]);
  return {
    items: rows.map(toBookingDto),
    page: q.page,
    pageSize: q.pageSize,
    total: count?.total ?? 0,
  };
}

// ---------- creation

export interface CreateBookingParams {
  serviceId: string;
  startsAt: Date;
  partySize: number;
  areaId?: string | null;
  guest: {
    id?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    locale?: string | null;
  };
  notes?: string | null;
  marketingConsent?: boolean;
  idempotencyKey?: string | null;
  source: BookingSource;
  actor: Actor;
  /** Staff options. */
  ignoreCapacity?: boolean;
  seatNow?: boolean;
  requirePhone?: boolean;
}

function yyyymmdd(date: string): number {
  const { year, month, day } = localDateParts(date);
  return year * 10_000 + month * 100 + day;
}

/** Serialise bookings of the same restaurant on the same (and previous) service date. */
async function lockDates(tx: DbOrTx, restaurantId: string, dates: string[]) {
  const keys = [...new Set(dates.map(yyyymmdd))].sort((a, b) => a - b);
  for (const key of keys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${restaurantId}), ${key})`);
  }
}

async function upsertCustomer(
  tx: DbOrTx,
  restaurantId: string,
  guest: CreateBookingParams["guest"],
  phone: string | null,
  marketingConsent: boolean | undefined,
): Promise<CustomerRow> {
  const email = guest.email?.trim().toLowerCase() || null;
  let existing: CustomerRow | undefined;
  if (guest.id) {
    [existing] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.id, guest.id), eq(customer.restaurantId, restaurantId)))
      .limit(1);
  }
  if (!existing && email) {
    [existing] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.restaurantId, restaurantId), eq(customer.email, email)))
      .limit(1);
  }
  if (!existing && phone) {
    [existing] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.restaurantId, restaurantId), eq(customer.phone, phone)))
      .limit(1);
  }
  if (existing) {
    const [updated] = await tx
      .update(customer)
      .set({
        name: guest.name || existing.name,
        ...(email && !existing.email ? { email } : {}),
        ...(phone && !existing.phone ? { phone } : {}),
        ...(guest.locale ? { locale: guest.locale } : {}),
        ...(marketingConsent ? { marketingConsent: true } : {}),
      })
      .where(eq(customer.id, existing.id))
      .returning();
    return updated ?? existing;
  }
  const [created] = await tx
    .insert(customer)
    .values({
      restaurantId,
      name: guest.name,
      email,
      phone,
      locale: guest.locale ?? null,
      marketingConsent: marketingConsent ?? false,
    })
    .returning();
  if (!created) throw new Error("customer insert failed");
  return created;
}

async function freeConfirmationCode(tx: DbOrTx, restaurantId: string): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = newConfirmationCode();
    const [hit] = await tx
      .select({ id: booking.id })
      .from(booking)
      .where(and(eq(booking.restaurantId, restaurantId), eq(booking.confirmationCode, code)))
      .limit(1);
    if (!hit) return code;
  }
  throw new Error("could not allocate a confirmation code");
}

export async function createBooking(
  ctx: AppContext,
  r: RestaurantRow,
  p: CreateBookingParams,
): Promise<BookingWithRelations> {
  if (p.idempotencyKey) {
    const [hit] = await ctx.db
      .select({ id: booking.id })
      .from(booking)
      .where(and(eq(booking.restaurantId, r.id), eq(booking.idempotencyKey, p.idempotencyKey)))
      .limit(1);
    if (hit) return getBookingWithRelations(ctx.db, r.id, hit.id);
  }

  const phone = normalizePhone(p.guest.phone, p.guest.locale ?? r.locale);
  if (p.guest.phone && !phone)
    throw ApiError.badRequest("invalid_phone", "Phone number is not valid");
  if (p.requirePhone && !phone)
    throw ApiError.badRequest("phone_required", "Phone number is required");

  const localDate = instantToLocal(p.startsAt, r.timezone).date;
  const candidateDates = [localDate, addDaysToLocalDate(localDate, -1)];

  const created = await ctx.db.transaction(async (tx) => {
    await lockDates(tx, r.id, candidateDates);

    let serviceDate = localDate;
    let endsAt: Date | null = null;
    let lastReason = "not_a_slot";
    for (const date of candidateDates) {
      const loaded = await loadAvailabilityInput(tx, ctx, r, {
        date,
        partySize: p.partySize,
        areaId: p.areaId ?? null,
      });
      const verdict = assertSlotBookable(loaded.input, {
        serviceId: p.serviceId,
        startsAt: p.startsAt,
        partySize: p.partySize,
      });
      if (verdict.ok) {
        serviceDate = date;
        endsAt = verdict.endsAt;
        break;
      }
      lastReason = verdict.reason;
      if (verdict.reason !== "not_a_slot") break;
    }

    if (!endsAt) {
      if (!p.ignoreCapacity) throw new SlotUnavailableError(lastReason);
      // Staff override: keep the requested time and derive the end from the service duration.
      const [svc] = await tx
        .select()
        .from(service)
        .where(and(eq(service.id, p.serviceId), eq(service.restaurantId, r.id)))
        .limit(1);
      if (!svc) throw ApiError.notFound("Service");
      endsAt = new Date(p.startsAt.getTime() + svc.durationMinutes * 60_000);
      const local = instantToLocal(p.startsAt, r.timezone);
      serviceDate = local.minutesOfDay < 6 * 60 ? addDaysToLocalDate(local.date, -1) : local.date;
    }

    const [policy] = await tx
      .select()
      .from(bookingPolicy)
      .where(eq(bookingPolicy.restaurantId, r.id))
      .limit(1);
    if (!policy) throw ApiError.notFound("Booking policy");

    let status: BookingStatus;
    if (p.seatNow) status = "seated";
    else if (p.actor.type === "guest") {
      const large =
        policy.largePartyThreshold !== null && p.partySize >= policy.largePartyThreshold;
      status = policy.autoConfirm && !large ? "confirmed" : "pending";
    } else status = "confirmed";

    const cust = await upsertCustomer(tx, r.id, p.guest, phone, p.marketingConsent);
    const locale = p.guest.locale ?? cust.locale ?? r.locale;
    const [row] = await tx
      .insert(booking)
      .values({
        restaurantId: r.id,
        serviceId: p.serviceId,
        areaId: p.areaId ?? null,
        customerId: cust.id,
        serviceDate,
        startsAt: p.startsAt,
        endsAt,
        partySize: p.partySize,
        status,
        source: p.source,
        locale,
        notes: p.notes ?? null,
        confirmationCode: await freeConfirmationCode(tx, r.id),
        manageToken: newToken(),
        idempotencyKey: p.idempotencyKey ?? null,
        createdByUserId: p.actor.type === "user" ? p.actor.id : null,
      })
      .returning();
    if (!row) throw new Error("booking insert failed");

    if (status === "seated") {
      await tx
        .update(customer)
        .set({ visitCount: sql`${customer.visitCount} + 1`, lastVisitAt: ctx.now() })
        .where(eq(customer.id, cust.id));
    }

    await emitEvent(tx, {
      type: "booking.created",
      restaurantId: r.id,
      aggregateType: "booking",
      aggregateId: row.id,
      payload: {
        bookingId: row.id,
        status,
        source: p.source,
        partySize: row.partySize,
        startsAt: row.startsAt.toISOString(),
      },
    });
    await writeAudit(tx, {
      restaurantId: r.id,
      actor: p.actor,
      action: "booking.created",
      entityType: "booking",
      entityId: row.id,
      data: {
        status,
        source: p.source,
        partySize: row.partySize,
        startsAt: row.startsAt.toISOString(),
        ignoreCapacity: p.ignoreCapacity ?? false,
      },
    });
    return row;
  });

  return getBookingWithRelations(ctx.db, r.id, created.id);
}

// ---------- status changes

export interface ApplyActionParams {
  bookingId: string;
  action: BookingAction;
  actor: Actor;
  reason?: string | null;
}

export async function applyBookingAction(
  ctx: AppContext,
  r: RestaurantRow,
  p: ApplyActionParams,
): Promise<BookingWithRelations> {
  await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(booking)
      .where(and(eq(booking.id, p.bookingId), eq(booking.restaurantId, r.id)))
      .for("update");
    if (!row) throw ApiError.notFound("Booking");
    const next = transition(row.status, p.action);

    if (p.action === "reopen") {
      // Re-check capacity before letting a cancelled booking back in.
      await lockDates(tx, r.id, [row.serviceDate]);
      const loaded = await loadAvailabilityInput(tx, ctx, r, {
        date: row.serviceDate,
        partySize: row.partySize,
        areaId: row.areaId,
      });
      const verdict = assertSlotBookable(loaded.input, {
        serviceId: row.serviceId,
        startsAt: row.startsAt,
        partySize: row.partySize,
      });
      if (!verdict.ok && verdict.reason === "full") throw new SlotUnavailableError(verdict.reason);
    }

    await tx
      .update(booking)
      .set({
        status: next,
        ...(next === "cancelled"
          ? { cancelledAt: ctx.now(), cancellationReason: p.reason ?? null }
          : {}),
        ...(p.action === "reopen" ? { cancelledAt: null, cancellationReason: null } : {}),
      })
      .where(eq(booking.id, row.id));

    if (p.action === "seat") {
      await tx
        .update(customer)
        .set({ visitCount: sql`${customer.visitCount} + 1`, lastVisitAt: ctx.now() })
        .where(eq(customer.id, row.customerId));
    } else if (p.action === "no_show") {
      await tx
        .update(customer)
        .set({ noShowCount: sql`${customer.noShowCount} + 1` })
        .where(eq(customer.id, row.customerId));
    }

    const base = { restaurantId: r.id, aggregateType: "booking", aggregateId: row.id } as const;
    switch (p.action) {
      case "confirm":
      case "reopen":
        await emitEvent(tx, {
          ...base,
          type: "booking.confirmed",
          payload: { bookingId: row.id, previousStatus: row.status },
        });
        break;
      case "cancel":
        await emitEvent(tx, {
          ...base,
          type: "booking.cancelled",
          payload: {
            bookingId: row.id,
            previousStatus: row.status,
            cancelledBy:
              p.actor.type === "guest" ? "guest" : p.actor.type === "system" ? "system" : "staff",
          },
        });
        break;
      case "seat":
        await emitEvent(tx, { ...base, type: "booking.seated", payload: { bookingId: row.id } });
        break;
      case "complete":
        await emitEvent(tx, { ...base, type: "booking.completed", payload: { bookingId: row.id } });
        break;
      case "no_show":
        await emitEvent(tx, { ...base, type: "booking.no_show", payload: { bookingId: row.id } });
        break;
    }
    await writeAudit(tx, {
      restaurantId: r.id,
      actor: p.actor,
      action: `booking.${p.action}`,
      entityType: "booking",
      entityId: row.id,
      data: { from: row.status, to: next, reason: p.reason ?? null },
    });
  });
  return getBookingWithRelations(ctx.db, r.id, p.bookingId);
}

export async function cancelByGuest(
  ctx: AppContext,
  token: string,
  reason?: string | null,
): Promise<{ restaurant: RestaurantRow; result: BookingWithRelations }> {
  const found = await getBookingByToken(ctx, token);
  const r = await findRestaurantById(ctx, found.booking.restaurantId);
  const [policy] = await ctx.db
    .select()
    .from(bookingPolicy)
    .where(eq(bookingPolicy.restaurantId, r.id))
    .limit(1);
  const cutoff =
    found.booking.startsAt.getTime() - (policy?.cancellationCutoffMinutes ?? 0) * 60_000;
  if (ctx.now().getTime() >= cutoff) {
    throw new ApiError(
      422,
      "cancellation_cutoff",
      "This booking can no longer be cancelled online. Please call the restaurant.",
    );
  }
  const result = await applyBookingAction(ctx, r, {
    bookingId: found.booking.id,
    action: "cancel",
    actor: { type: "guest", id: null },
    reason,
  });
  return { restaurant: r, result };
}

// ---------- modification

export async function updateBooking(
  ctx: AppContext,
  r: RestaurantRow,
  bookingId: string,
  input: UpdateBookingInput,
  actor: Actor,
): Promise<BookingWithRelations> {
  await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(booking)
      .where(and(eq(booking.id, bookingId), eq(booking.restaurantId, r.id)))
      .for("update");
    if (!row) throw ApiError.notFound("Booking");
    if (!isActiveStatus(row.status))
      throw ApiError.conflict("not_active", "Only active bookings can be modified");

    const startsAt = input.startsAt ? new Date(input.startsAt) : row.startsAt;
    const partySize = input.partySize ?? row.partySize;
    const serviceId = input.serviceId ?? row.serviceId;
    const areaId = input.areaId === undefined ? row.areaId : input.areaId;
    const timingChanged =
      startsAt.getTime() !== row.startsAt.getTime() ||
      partySize !== row.partySize ||
      serviceId !== row.serviceId ||
      areaId !== row.areaId;

    const changes: string[] = [];
    let endsAt = row.endsAt;
    let serviceDate = row.serviceDate;
    if (timingChanged) {
      const localDate = instantToLocal(startsAt, r.timezone).date;
      const candidates = [localDate, addDaysToLocalDate(localDate, -1)];
      await lockDates(tx, r.id, [...candidates, row.serviceDate]);
      let ok = false;
      let lastReason = "not_a_slot";
      for (const date of candidates) {
        const loaded = await loadAvailabilityInput(tx, ctx, r, {
          date,
          partySize,
          areaId,
          excludeBookingId: row.id,
        });
        const verdict = assertSlotBookable(loaded.input, { serviceId, startsAt, partySize });
        if (verdict.ok) {
          ok = true;
          endsAt = verdict.endsAt;
          serviceDate = date;
          break;
        }
        lastReason = verdict.reason;
        if (verdict.reason !== "not_a_slot") break;
      }
      if (!ok) {
        if (!input.ignoreCapacity) throw new SlotUnavailableError(lastReason);
        const [svc] = await tx.select().from(service).where(eq(service.id, serviceId)).limit(1);
        if (!svc) throw ApiError.notFound("Service");
        endsAt = new Date(startsAt.getTime() + svc.durationMinutes * 60_000);
        serviceDate = instantToLocal(startsAt, r.timezone).date;
      }
      if (startsAt.getTime() !== row.startsAt.getTime()) changes.push("startsAt");
      if (partySize !== row.partySize) changes.push("partySize");
      if (serviceId !== row.serviceId) changes.push("serviceId");
      if (areaId !== row.areaId) changes.push("areaId");
    }
    if (input.notes !== undefined && input.notes !== row.notes) changes.push("notes");
    if (changes.length === 0) return;

    await tx
      .update(booking)
      .set({
        startsAt,
        endsAt,
        serviceDate,
        partySize,
        serviceId,
        areaId,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .where(eq(booking.id, row.id));
    await emitEvent(tx, {
      type: "booking.modified",
      restaurantId: r.id,
      aggregateType: "booking",
      aggregateId: row.id,
      payload: { bookingId: row.id, changes },
    });
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action: "booking.modified",
      entityType: "booking",
      entityId: row.id,
      data: { changes },
    });
  });
  return getBookingWithRelations(ctx.db, r.id, bookingId);
}
