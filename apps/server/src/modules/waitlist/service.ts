import {
  addDaysToLocalDate,
  type BookingSource,
  computeAvailability,
  instantToLocal,
  OPEN_WAITLIST_STATUSES,
  pickOfferSlot,
  type WaitlistStatus,
} from "@sitli/core";
import type { DbOrTx } from "@sitli/db";
import { bookingPolicy, customer, service, waitlistEntry } from "@sitli/db";
import type { ListWaitlistQuery, PublicWaitlistEntryDto, WaitlistEntryDto } from "@sitli/shared";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { emitEvent } from "../../events/outbox.js";
import { writeAudit } from "../../lib/audit.js";
import { type GuestIdentity, upsertCustomer } from "../../lib/customers.js";
import { ApiError } from "../../lib/errors.js";
import { normalizePhone } from "../../lib/phone.js";
import { newToken } from "../../lib/random.js";
import { findRestaurantById } from "../../lib/restaurant-lookup.js";
import { loadAvailabilityInput } from "../availability/service.js";
import { type BookingWithRelations, createBooking, manageUrl } from "../bookings/index.js";

type EntryRow = typeof waitlistEntry.$inferSelect;
type CustomerRow = typeof customer.$inferSelect;

export interface EntryWithRelations {
  entry: EntryRow;
  customer: CustomerRow;
  serviceName: string | null;
  offeredServiceName: string | null;
  /** Manage token of the booking created from this entry, if any. */
  bookingManageToken: string | null;
}

// ---------- DTOs

export function toEntryDto(x: EntryWithRelations): WaitlistEntryDto {
  const e = x.entry;
  return {
    id: e.id,
    restaurantId: e.restaurantId,
    customer: {
      id: x.customer.id,
      name: x.customer.name,
      email: x.customer.email,
      phone: x.customer.phone,
      locale: x.customer.locale as WaitlistEntryDto["customer"]["locale"],
      visitCount: x.customer.visitCount,
      noShowCount: x.customer.noShowCount,
    },
    serviceId: e.serviceId,
    serviceName: x.serviceName,
    serviceDate: e.serviceDate,
    partySize: e.partySize,
    preferredTime: e.preferredTime,
    notes: e.notes,
    locale: e.locale as WaitlistEntryDto["locale"],
    source: e.source,
    status: e.status,
    offer:
      e.offeredServiceId && e.offeredStartsAt && e.offerExpiresAt
        ? {
            serviceId: e.offeredServiceId,
            serviceName: x.offeredServiceName ?? "",
            startsAt: e.offeredStartsAt.toISOString(),
            expiresAt: e.offerExpiresAt.toISOString(),
          }
        : null,
    bookingId: e.bookingId,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function waitlistUrl(ctx: AppContext, r: RestaurantRow, token: string): string {
  return `${ctx.env.PUBLIC_URL}/book/${r.slug}/waitlist/${token}`;
}

export function toPublicEntryDto(
  ctx: AppContext,
  r: RestaurantRow,
  x: EntryWithRelations,
): PublicWaitlistEntryDto {
  const e = x.entry;
  const offerOpen =
    e.status === "offered" &&
    !!e.offerExpiresAt &&
    e.offerExpiresAt.getTime() > ctx.now().getTime();
  return {
    id: e.id,
    status: e.status,
    serviceDate: e.serviceDate,
    partySize: e.partySize,
    preferredTime: e.preferredTime,
    guestName: x.customer.name,
    restaurant: {
      name: r.name,
      slug: r.slug,
      timezone: r.timezone,
      address: r.address,
      phone: r.phone,
    },
    offer:
      e.status === "offered" && e.offeredStartsAt && e.offerExpiresAt
        ? {
            serviceName: x.offeredServiceName ?? "",
            startsAt: e.offeredStartsAt.toISOString(),
            expiresAt: e.offerExpiresAt.toISOString(),
          }
        : null,
    canAccept: offerOpen,
    bookingManageUrl: x.bookingManageToken ? manageUrl(ctx, r, x.bookingManageToken) : null,
    manageUrl: waitlistUrl(ctx, r, e.token),
  };
}

// ---------- lookups

const preferredService = alias(service, "preferred_service");
const offeredService = alias(service, "offered_service");

function selectEntry(db: DbOrTx) {
  return db
    .select({
      entry: waitlistEntry,
      customer,
      serviceName: preferredService.name,
      offeredServiceName: offeredService.name,
      bookingManageToken: sql<
        string | null
      >`(select manage_token from booking where booking.id = ${waitlistEntry.bookingId})`,
    })
    .from(waitlistEntry)
    .innerJoin(customer, eq(customer.id, waitlistEntry.customerId))
    .leftJoin(preferredService, eq(preferredService.id, waitlistEntry.serviceId))
    .leftJoin(offeredService, eq(offeredService.id, waitlistEntry.offeredServiceId));
}

export async function getEntry(
  db: DbOrTx,
  restaurantId: string,
  entryId: string,
): Promise<EntryWithRelations> {
  const [row] = await selectEntry(db)
    .where(and(eq(waitlistEntry.id, entryId), eq(waitlistEntry.restaurantId, restaurantId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Waitlist entry");
  return row;
}

export async function getEntryByToken(ctx: AppContext, token: string): Promise<EntryWithRelations> {
  const [row] = await selectEntry(ctx.db).where(eq(waitlistEntry.token, token)).limit(1);
  if (!row) throw ApiError.notFound("Waitlist entry");
  return row;
}

export async function listEntries(ctx: AppContext, r: RestaurantRow, q: ListWaitlistQuery) {
  const conditions = [eq(waitlistEntry.restaurantId, r.id)];
  if (q.date) conditions.push(eq(waitlistEntry.serviceDate, q.date));
  if (q.from) conditions.push(gte(waitlistEntry.serviceDate, q.from));
  if (q.to) conditions.push(lte(waitlistEntry.serviceDate, q.to));
  if (q.status && q.status.length > 0) conditions.push(inArray(waitlistEntry.status, q.status));
  if (q.customerId) conditions.push(eq(waitlistEntry.customerId, q.customerId));
  const where = and(...conditions);
  const [rows, [count]] = await Promise.all([
    selectEntry(ctx.db)
      .where(where)
      .orderBy(asc(waitlistEntry.serviceDate), asc(waitlistEntry.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    ctx.db.select({ total: sql<number>`count(*)::int` }).from(waitlistEntry).where(where),
  ]);
  return {
    items: rows.map(toEntryDto),
    page: q.page,
    pageSize: q.pageSize,
    total: count?.total ?? 0,
  };
}

async function loadPolicy(db: DbOrTx, restaurantId: string) {
  const [policy] = await db
    .select()
    .from(bookingPolicy)
    .where(eq(bookingPolicy.restaurantId, restaurantId))
    .limit(1);
  if (!policy) throw ApiError.notFound("Booking policy");
  return policy;
}

// ---------- joining

export interface JoinParams {
  serviceDate: string;
  partySize: number;
  serviceId?: string | null;
  preferredTime?: string | null;
  guest: GuestIdentity;
  notes?: string | null;
  marketingConsent?: boolean;
  source: BookingSource;
  actor: Actor;
}

export async function joinWaitlist(
  ctx: AppContext,
  r: RestaurantRow,
  p: JoinParams,
): Promise<EntryWithRelations> {
  const policy = await loadPolicy(ctx.db, r.id);
  const byGuest = p.actor.type === "guest";
  if (byGuest) {
    if (!policy.waitlistEnabled)
      throw new ApiError(422, "waitlist_disabled", "This restaurant does not run a waitlist");
    const today = instantToLocal(ctx.now(), r.timezone).date;
    if (p.serviceDate < today) throw ApiError.badRequest("date_in_past", "The date is in the past");
    if (p.serviceDate > addDaysToLocalDate(today, policy.maxAdvanceDays))
      throw ApiError.badRequest("too_far_ahead", "The date is too far ahead");
    if (p.partySize < policy.minPartySize || p.partySize > policy.maxPartySize)
      throw ApiError.badRequest("party_size", "Party size is outside the accepted range");
  }
  if (p.serviceId) {
    const [svc] = await ctx.db
      .select({ id: service.id })
      .from(service)
      .where(and(eq(service.id, p.serviceId), eq(service.restaurantId, r.id)))
      .limit(1);
    if (!svc) throw ApiError.notFound("Service");
  }
  const phone = normalizePhone(p.guest.phone, p.guest.locale ?? r.locale);
  if (p.guest.phone && !phone)
    throw ApiError.badRequest("invalid_phone", "Phone number is not valid");
  if (byGuest && !phone && !p.guest.email)
    throw ApiError.badRequest("contact_required", "An email address or phone number is required");

  const created = await ctx.db.transaction(async (tx) => {
    const cust = await upsertCustomer(tx, r.id, p.guest, phone, p.marketingConsent);
    const [row] = await tx
      .insert(waitlistEntry)
      .values({
        restaurantId: r.id,
        customerId: cust.id,
        serviceId: p.serviceId ?? null,
        serviceDate: p.serviceDate,
        partySize: p.partySize,
        preferredTime: p.preferredTime ?? null,
        notes: p.notes ?? null,
        locale: p.guest.locale ?? cust.locale ?? r.locale,
        source: p.source,
        token: newToken(),
        createdByUserId: p.actor.type === "user" ? p.actor.id : null,
      })
      .returning();
    if (!row) throw new Error("waitlist insert failed");
    await emitEvent(tx, {
      type: "waitlist.joined",
      restaurantId: r.id,
      aggregateType: "waitlist_entry",
      aggregateId: row.id,
      payload: {
        entryId: row.id,
        serviceDate: row.serviceDate,
        partySize: row.partySize,
        source: p.source,
      },
    });
    await writeAudit(tx, {
      restaurantId: r.id,
      actor: p.actor,
      action: "waitlist.joined",
      entityType: "waitlist_entry",
      entityId: row.id,
      data: { serviceDate: row.serviceDate, partySize: row.partySize, source: p.source },
    });
    return row;
  });
  return getEntry(ctx.db, r.id, created.id);
}

// ---------- offers

function assertOpen(entry: EntryRow) {
  if (!OPEN_WAITLIST_STATUSES.includes(entry.status))
    throw ApiError.conflict("not_open", `The entry is ${entry.status}`);
}

export interface OfferParams {
  entryId: string;
  serviceId: string;
  startsAt: Date;
  actor: Actor;
}

/** Offer a slot to a waiting guest; a second call replaces the previous offer. */
export async function offerEntry(
  ctx: AppContext,
  r: RestaurantRow,
  p: OfferParams,
): Promise<EntryWithRelations> {
  const policy = await loadPolicy(ctx.db, r.id);
  const [svc] = await ctx.db
    .select({ id: service.id })
    .from(service)
    .where(and(eq(service.id, p.serviceId), eq(service.restaurantId, r.id)))
    .limit(1);
  if (!svc) throw ApiError.notFound("Service");
  const expiresAt = new Date(ctx.now().getTime() + policy.waitlistOfferMinutes * 60_000);

  await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(waitlistEntry)
      .where(and(eq(waitlistEntry.id, p.entryId), eq(waitlistEntry.restaurantId, r.id)))
      .for("update");
    if (!row) throw ApiError.notFound("Waitlist entry");
    assertOpen(row);
    await tx
      .update(waitlistEntry)
      .set({
        status: "offered",
        offeredServiceId: p.serviceId,
        offeredStartsAt: p.startsAt,
        offerExpiresAt: expiresAt,
      })
      .where(eq(waitlistEntry.id, row.id));
    await emitEvent(tx, {
      type: "waitlist.offered",
      restaurantId: r.id,
      aggregateType: "waitlist_entry",
      aggregateId: row.id,
      payload: {
        entryId: row.id,
        startsAt: p.startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    });
    await writeAudit(tx, {
      restaurantId: r.id,
      actor: p.actor,
      action: "waitlist.offered",
      entityType: "waitlist_entry",
      entityId: row.id,
      data: { startsAt: p.startsAt.toISOString(), expiresAt: expiresAt.toISOString() },
    });
  });
  await ctx.jobs.send(
    "waitlist.expire",
    { entryId: p.entryId, offeredStartsAt: p.startsAt.toISOString() },
    { startAfter: expiresAt, singletonKey: `waitlist:${p.entryId}:${p.startsAt.toISOString()}` },
  );
  return getEntry(ctx.db, r.id, p.entryId);
}

/**
 * Offer the first waiting guest of a date a slot that fits them, if any.
 * Offers do not hold capacity, so only one guest is offered at a time; when
 * that offer lapses the next guest gets a turn.
 */
export async function autoOffer(
  ctx: AppContext,
  r: RestaurantRow,
  serviceDate: string,
): Promise<EntryWithRelations | null> {
  const policy = await loadPolicy(ctx.db, r.id);
  if (!policy.waitlistEnabled || !policy.waitlistAutoOffer) return null;
  const pending = await ctx.db
    .select()
    .from(waitlistEntry)
    .where(
      and(
        eq(waitlistEntry.restaurantId, r.id),
        eq(waitlistEntry.serviceDate, serviceDate),
        inArray(waitlistEntry.status, ["waiting", "offered"]),
      ),
    )
    .orderBy(asc(waitlistEntry.createdAt));
  // someone already has an open offer: let it play out first
  if (pending.some((e) => e.status === "offered")) return null;
  for (const entry of pending) {
    const loaded = await loadAvailabilityInput(ctx.db, ctx, r, {
      date: serviceDate,
      partySize: entry.partySize,
    });
    const slot = pickOfferSlot(computeAvailability(loaded.input).slots, {
      serviceId: entry.serviceId,
      preferredTime: entry.preferredTime,
    });
    if (!slot) continue;
    return offerEntry(ctx, r, {
      entryId: entry.id,
      serviceId: slot.serviceId,
      startsAt: slot.startsAt,
      actor: { type: "system", id: null },
    });
  }
  return null;
}

/** Job handler: an offer nobody accepted lapses, and the date is re-evaluated. */
export async function expireOffer(
  ctx: AppContext,
  entryId: string,
  offeredStartsAt: string,
): Promise<void> {
  const changed = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(waitlistEntry)
      .where(eq(waitlistEntry.id, entryId))
      .for("update");
    if (row?.status !== "offered") return false;
    // a newer offer replaced the one this job was scheduled for
    if (row.offeredStartsAt?.toISOString() !== offeredStartsAt) return false;
    await tx.update(waitlistEntry).set({ status: "expired" }).where(eq(waitlistEntry.id, row.id));
    await emitEvent(tx, {
      type: "waitlist.expired",
      restaurantId: row.restaurantId,
      aggregateType: "waitlist_entry",
      aggregateId: row.id,
      payload: { entryId: row.id, serviceDate: row.serviceDate },
    });
    await writeAudit(tx, {
      restaurantId: row.restaurantId,
      actor: { type: "system", id: null },
      action: "waitlist.expired",
      entityType: "waitlist_entry",
      entityId: row.id,
    });
    return true;
  });
  if (!changed) ctx.logger.debug({ entryId }, "waitlist offer already settled");
}

// ---------- booking the guest in

export interface BookParams {
  entryId: string;
  serviceId: string;
  startsAt: Date;
  ignoreCapacity?: boolean;
  source: BookingSource;
  actor: Actor;
}

/** Turn an entry into a confirmed booking. Capacity is checked like any booking. */
export async function bookEntry(
  ctx: AppContext,
  r: RestaurantRow,
  p: BookParams,
): Promise<{ entry: EntryWithRelations; booking: BookingWithRelations }> {
  const found = await getEntry(ctx.db, r.id, p.entryId);
  assertOpen(found.entry);
  const booking = await createBooking(ctx, r, {
    serviceId: p.serviceId,
    startsAt: p.startsAt,
    partySize: found.entry.partySize,
    guest: {
      id: found.customer.id,
      name: found.customer.name,
      email: found.customer.email,
      phone: found.customer.phone,
      locale: found.entry.locale,
    },
    notes: found.entry.notes,
    source: p.source,
    actor: p.actor,
    ignoreCapacity: p.ignoreCapacity ?? false,
    // an offered table must not end up pending: staff already vouched for it
    forceConfirmed: true,
  });
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(waitlistEntry)
      .set({ status: "booked", bookingId: booking.booking.id })
      .where(eq(waitlistEntry.id, found.entry.id));
    await emitEvent(tx, {
      type: "waitlist.booked",
      restaurantId: r.id,
      aggregateType: "waitlist_entry",
      aggregateId: found.entry.id,
      payload: { entryId: found.entry.id, bookingId: booking.booking.id },
    });
    await writeAudit(tx, {
      restaurantId: r.id,
      actor: p.actor,
      action: "waitlist.booked",
      entityType: "waitlist_entry",
      entityId: found.entry.id,
      data: { bookingId: booking.booking.id },
    });
  });
  return { entry: await getEntry(ctx.db, r.id, found.entry.id), booking };
}

/** The guest accepts the offered slot from their link. */
export async function acceptOffer(
  ctx: AppContext,
  token: string,
): Promise<{
  restaurant: RestaurantRow;
  entry: EntryWithRelations;
  booking: BookingWithRelations;
}> {
  const found = await getEntryByToken(ctx, token);
  const r = await findRestaurantById(ctx, found.entry.restaurantId);
  const e = found.entry;
  if (e.status !== "offered" || !e.offeredServiceId || !e.offeredStartsAt || !e.offerExpiresAt)
    throw ApiError.conflict("no_offer", "There is no table on offer for this entry");
  if (e.offerExpiresAt.getTime() <= ctx.now().getTime())
    throw ApiError.conflict("offer_expired", "The offer has expired");
  const result = await bookEntry(ctx, r, {
    entryId: e.id,
    serviceId: e.offeredServiceId,
    startsAt: e.offeredStartsAt,
    source: "widget",
    actor: { type: "guest", id: null },
  });
  return { restaurant: r, ...result };
}

// ---------- leaving

export async function cancelEntry(
  ctx: AppContext,
  r: RestaurantRow,
  entryId: string,
  actor: Actor,
): Promise<EntryWithRelations> {
  await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(waitlistEntry)
      .where(and(eq(waitlistEntry.id, entryId), eq(waitlistEntry.restaurantId, r.id)))
      .for("update");
    if (!row) throw ApiError.notFound("Waitlist entry");
    assertOpen(row);
    await tx
      .update(waitlistEntry)
      .set({ status: "cancelled", cancelledAt: ctx.now() })
      .where(eq(waitlistEntry.id, row.id));
    await emitEvent(tx, {
      type: "waitlist.cancelled",
      restaurantId: r.id,
      aggregateType: "waitlist_entry",
      aggregateId: row.id,
      payload: {
        entryId: row.id,
        serviceDate: row.serviceDate,
        previousStatus: row.status as WaitlistStatus,
        cancelledBy: actor.type === "guest" ? "guest" : "staff",
      },
    });
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action: "waitlist.cancelled",
      entityType: "waitlist_entry",
      entityId: row.id,
      data: { from: row.status },
    });
  });
  return getEntry(ctx.db, r.id, entryId);
}

export async function leaveByToken(
  ctx: AppContext,
  token: string,
): Promise<{ restaurant: RestaurantRow; entry: EntryWithRelations }> {
  const found = await getEntryByToken(ctx, token);
  const r = await findRestaurantById(ctx, found.entry.restaurantId);
  const entry = await cancelEntry(ctx, r, found.entry.id, { type: "guest", id: null });
  return { restaurant: r, entry };
}
