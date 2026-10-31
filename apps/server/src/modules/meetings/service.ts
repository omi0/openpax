import {
  addDaysToLocalDate,
  exceptionCoversDate,
  formatMinutesOfDay,
  instantToLocal,
  isActiveStatus,
  type LocalDate,
  localToInstant,
  weekdayOf,
  windowToMinutes,
} from "@openpax/core";
import type { DbOrTx } from "@openpax/db";
import {
  booking,
  bookingMeeting,
  bookingPolicy,
  customer,
  outboxEvent,
  scheduleException,
} from "@openpax/db";
import {
  MEETING_MINUTES,
  type MeetingDaysDto,
  type MeetingDto,
  type MeetingListItemDto,
  type MeetingSlotsDto,
  type ScheduleMeetingInput,
} from "@openpax/shared";
import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { emitEvent } from "../../events/outbox.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { uniqueViolation } from "../../lib/locks.js";

type MeetingRow = typeof bookingMeeting.$inferSelect;

const MEETING_MS = MEETING_MINUTES * 60_000;

export function toMeetingDto(m: MeetingRow): MeetingDto {
  return {
    id: m.id,
    bookingId: m.bookingId,
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
  };
}

type PolicyRow = typeof bookingPolicy.$inferSelect;

async function loadPolicy(db: DbOrTx, restaurantId: string): Promise<PolicyRow> {
  const [policy] = await db
    .select()
    .from(bookingPolicy)
    .where(eq(bookingPolicy.restaurantId, restaurantId))
    .limit(1);
  if (!policy) throw ApiError.notFound("Booking policy");
  return policy;
}

type ClosureRow = typeof scheduleException.$inferSelect;

/** Restaurant-wide closures overlapping [from, to]. */
async function loadClosures(db: DbOrTx, restaurantId: string, from: LocalDate, to: LocalDate) {
  return db
    .select()
    .from(scheduleException)
    .where(
      and(
        eq(scheduleException.restaurantId, restaurantId),
        isNull(scheduleException.serviceId),
        lte(scheduleException.date, to),
        gte(sql`coalesce(${scheduleException.endDate}, ${scheduleException.date})`, from),
      ),
    );
}

/** A closure covers the day (the latest-starting exception wins, as for services). */
function closedOn(closures: ClosureRow[], date: LocalDate): boolean {
  const latest = closures
    .filter((e) => exceptionCoversDate(e, date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  return latest?.closed ?? false;
}

/** Live meetings starting from just before `from` to the end of the day after `to`. */
async function loadTaken(db: DbOrTx, r: RestaurantRow, from: LocalDate, to: LocalDate) {
  return db
    .select({ id: bookingMeeting.id, startsAt: bookingMeeting.startsAt })
    .from(bookingMeeting)
    .where(
      and(
        eq(bookingMeeting.restaurantId, r.id),
        isNull(bookingMeeting.cancelledAt),
        gte(
          bookingMeeting.startsAt,
          new Date(localToInstant(from, 0, r.timezone).getTime() - MEETING_MS),
        ),
        lt(bookingMeeting.startsAt, localToInstant(addDaysToLocalDate(to, 2), 0, r.timezone)),
      ),
    );
}

/**
 * The host's slots on a date: every MEETING_MINUTES from the start of each
 * window, as long as the meeting is over by the window's end. Taken and past
 * slots stay in the list as unavailable, and so does any slot overlapping a
 * booked meeting (windows may overlap); `ignoreMeetingId` frees the slot of
 * the meeting being moved.
 */
function computeSlots(
  policy: PolicyRow,
  closures: ClosureRow[],
  taken: Array<{ id: string; startsAt: Date }>,
  r: RestaurantRow,
  date: LocalDate,
  now: number,
  ignoreMeetingId?: string,
): MeetingSlotsDto {
  if (closedOn(closures, date)) return { date, closed: true, slots: [] };
  const windows = policy.meetingHours[weekdayOf(date)] ?? [];
  const busy = taken.filter((m) => m.id !== ignoreMeetingId).map((m) => m.startsAt.getTime());
  const starts = new Set(
    windows.flatMap((w) => {
      const { startMin, endMin } = windowToMinutes(w);
      const list: number[] = [];
      for (let m = startMin; m + MEETING_MINUTES <= endMin; m += MEETING_MINUTES) list.push(m);
      return list;
    }),
  );
  const slots = [...starts]
    .sort((a, b) => a - b)
    .map((minutes) => {
      const at = localToInstant(date, minutes, r.timezone).getTime();
      return {
        startsAt: new Date(at).toISOString(),
        startLocal: formatMinutesOfDay(minutes),
        available: at > now && !busy.some((b) => b < at + MEETING_MS && b + MEETING_MS > at),
      };
    });
  return { date, closed: false, slots };
}

export async function meetingSlots(
  ctx: AppContext,
  db: DbOrTx,
  r: RestaurantRow,
  date: LocalDate,
  ignoreMeetingId?: string,
  loadedPolicy?: PolicyRow,
): Promise<MeetingSlotsDto> {
  const policy = loadedPolicy ?? (await loadPolicy(db, r.id));
  const [closures, taken] = await Promise.all([
    loadClosures(db, r.id, date, date),
    loadTaken(db, r, date, date),
  ]);
  return computeSlots(policy, closures, taken, r, date, ctx.now().getTime(), ignoreMeetingId);
}

/** Free slots per day between two dates, for a month calendar (at most 62 days). */
export async function meetingDays(
  ctx: AppContext,
  r: RestaurantRow,
  q: { from: LocalDate; to: LocalDate; before?: string | undefined },
): Promise<MeetingDaysDto> {
  const policy = await loadPolicy(ctx.db, r.id);
  const [closures, taken] = await Promise.all([
    loadClosures(ctx.db, r.id, q.from, q.to),
    loadTaken(ctx.db, r, q.from, q.to),
  ]);
  const now = ctx.now().getTime();
  // only slots whose meeting is over by then count (the start of the event)
  const latest = q.before ? new Date(q.before).getTime() : Number.POSITIVE_INFINITY;
  const days: MeetingDaysDto["days"] = [];
  for (let d = q.from, i = 0; d <= q.to && i < 62; d = addDaysToLocalDate(d, 1), i += 1) {
    const day = computeSlots(policy, closures, taken, r, d, now);
    const free = day.slots.filter(
      (s) => s.available && new Date(s.startsAt).getTime() + MEETING_MS <= latest,
    );
    days.push({ date: d, closed: day.closed, free: free.length });
  }
  return { days };
}

async function activeMeeting(db: DbOrTx, restaurantId: string, bookingId: string) {
  const [row] = await db
    .select()
    .from(bookingMeeting)
    .where(
      and(
        eq(bookingMeeting.restaurantId, restaurantId),
        eq(bookingMeeting.bookingId, bookingId),
        isNull(bookingMeeting.cancelledAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getBookingMeeting(
  ctx: AppContext,
  r: RestaurantRow,
  bookingId: string,
): Promise<MeetingDto | null> {
  const row = await activeMeeting(ctx.db, r.id, bookingId);
  return row ? toMeetingDto(row) : null;
}

export async function listMeetings(
  ctx: AppContext,
  r: RestaurantRow,
  q: { from: LocalDate; to: LocalDate },
): Promise<MeetingListItemDto[]> {
  const rows = await ctx.db
    .select({ meeting: bookingMeeting, booking, customer })
    .from(bookingMeeting)
    .innerJoin(booking, eq(booking.id, bookingMeeting.bookingId))
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .where(
      and(
        eq(bookingMeeting.restaurantId, r.id),
        isNull(bookingMeeting.cancelledAt),
        gte(bookingMeeting.startsAt, localToInstant(q.from, 0, r.timezone)),
        lt(bookingMeeting.startsAt, localToInstant(addDaysToLocalDate(q.to, 1), 0, r.timezone)),
      ),
    )
    .orderBy(asc(bookingMeeting.startsAt));
  return rows.map((x) => ({
    ...toMeetingDto(x.meeting),
    customerName: x.customer.name,
    customerPhone: x.customer.phone,
    partySize: x.booking.partySize,
    bookingStartsAt: x.booking.startsAt.toISOString(),
    bookingStatus: x.booking.status,
  }));
}

/** Book (or move) the meeting of a group booking on one of the host's free slots. */
export async function scheduleMeeting(
  ctx: AppContext,
  r: RestaurantRow,
  bookingId: string,
  input: ScheduleMeetingInput,
  actor: Actor,
): Promise<MeetingDto> {
  const startsAt = new Date(input.startsAt);
  try {
    return await ctx.db.transaction(async (tx) => {
      const [b] = await tx
        .select()
        .from(booking)
        .where(and(eq(booking.id, bookingId), eq(booking.restaurantId, r.id)))
        .for("update");
      if (!b) throw ApiError.notFound("Booking");
      if (!isActiveStatus(b.status))
        throw ApiError.conflict("not_active", "Only active bookings can have a meeting");
      const policy = await loadPolicy(tx, r.id);
      if (policy.meetingMinPartySize === null || b.partySize < policy.meetingMinPartySize)
        throw ApiError.badRequest(
          "meeting_not_allowed",
          "Meetings are only for groups from the configured size",
        );

      if (startsAt.getTime() + MEETING_MS > b.startsAt.getTime())
        throw ApiError.badRequest(
          "meeting_after_event",
          "The meeting must be over before the event starts",
        );

      // one host: meetings of the restaurant are booked one at a time
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${r.id}), hashtext('booking_meeting'))`,
      );
      const current = await activeMeeting(tx, r.id, b.id);
      if (current && current.startsAt.getTime() === startsAt.getTime())
        return toMeetingDto(current);
      // after midnight a slot may belong to the previous day's window
      const { date } = instantToLocal(startsAt, r.timezone);
      let slot: MeetingSlotsDto["slots"][number] | undefined;
      for (const day of [date, addDaysToLocalDate(date, -1)]) {
        const list = await meetingSlots(ctx, tx, r, day, current?.id, policy);
        slot = list.slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
        if (slot) break;
      }
      if (!slot) throw ApiError.badRequest("meeting_not_a_slot", "The host is not available then");
      if (!slot.available) throw ApiError.conflict("meeting_slot_taken", "This slot is taken");

      const endsAt = new Date(startsAt.getTime() + MEETING_MS);
      const [row] = current
        ? await tx
            .update(bookingMeeting)
            .set({ startsAt, endsAt, sequence: current.sequence + 1 })
            .where(eq(bookingMeeting.id, current.id))
            .returning()
        : await tx
            .insert(bookingMeeting)
            .values({
              restaurantId: r.id,
              bookingId: b.id,
              startsAt,
              endsAt,
              createdByUserId: actor.type === "user" ? actor.id : null,
            })
            .returning();
      if (!row) throw new Error("meeting write failed");
      await emitEvent(tx, {
        type: "meeting.scheduled",
        restaurantId: r.id,
        aggregateType: "booking",
        aggregateId: b.id,
        payload: { meetingId: row.id, bookingId: b.id, sequence: row.sequence },
      });
      await writeAudit(tx, {
        restaurantId: r.id,
        actor,
        action: current ? "meeting.moved" : "meeting.scheduled",
        entityType: "booking_meeting",
        entityId: row.id,
        data: { bookingId: b.id, startsAt: startsAt.toISOString() },
      });
      return toMeetingDto(row);
    });
  } catch (error) {
    // two operators on the same slot at the same moment: the unique index decides
    if (uniqueViolation(error) === "booking_meeting_slot_uidx")
      throw ApiError.conflict("meeting_slot_taken", "This slot is taken");
    throw error;
  }
}

async function cancelRow(tx: DbOrTx, r: { id: string }, row: MeetingRow, actor: Actor, now: Date) {
  const sequence = row.sequence + 1;
  await tx
    .update(bookingMeeting)
    .set({ cancelledAt: now, sequence })
    .where(eq(bookingMeeting.id, row.id));
  await emitEvent(tx, {
    type: "meeting.cancelled",
    restaurantId: r.id,
    aggregateType: "booking",
    aggregateId: row.bookingId,
    payload: { meetingId: row.id, bookingId: row.bookingId, sequence },
  });
  await writeAudit(tx, {
    restaurantId: r.id,
    actor,
    action: "meeting.cancelled",
    entityType: "booking_meeting",
    entityId: row.id,
    data: { bookingId: row.bookingId },
  });
}

export async function cancelMeeting(
  ctx: AppContext,
  r: RestaurantRow,
  bookingId: string,
  actor: Actor,
): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const row = await activeMeeting(tx, r.id, bookingId);
    if (!row) throw ApiError.notFound("Meeting");
    await cancelRow(tx, r, row, actor, ctx.now());
  });
}

/** The booking was cancelled: free the host's slot too (no-op without a meeting). */
export async function cancelMeetingOfBooking(
  ctx: AppContext,
  restaurantId: string,
  bookingId: string,
): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const row = await activeMeeting(tx, restaurantId, bookingId);
    if (row)
      await cancelRow(tx, { id: restaurantId }, row, { type: "system", id: null }, ctx.now());
  });
}

/**
 * The event booking changed (time, size, notes): send the host the invite
 * again so the description is current. When the meeting no longer fits (the
 * event now starts before it ends, or this change made the group too small
 * for one) it is cancelled instead, and the host gets the cancellation. A
 * minimum changed later does not touch meetings already booked. No-op without
 * a live meeting, and once per `eventId`: the outbox may deliver it again.
 */
export async function refreshMeetingOfBooking(
  ctx: AppContext,
  restaurantId: string,
  bookingId: string,
  change: { eventId: string; previousPartySize?: number | undefined },
): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const row = await activeMeeting(tx, restaurantId, bookingId);
    if (!row) return;
    const [done] = await tx
      .select({ id: outboxEvent.id })
      .from(outboxEvent)
      .where(
        and(
          eq(outboxEvent.type, "meeting.scheduled"),
          eq(outboxEvent.aggregateId, bookingId),
          sql`${outboxEvent.payload}->>'cause' = ${change.eventId}`,
        ),
      )
      .limit(1);
    if (done) return;
    const [b] = await tx
      .select({ startsAt: booking.startsAt, partySize: booking.partySize })
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    const policy = await loadPolicy(tx, restaurantId);
    const min = policy.meetingMinPartySize;
    const previous = change.previousPartySize;
    const tooSmallNow =
      b !== undefined &&
      min !== null &&
      previous !== undefined &&
      b.partySize < previous &&
      b.partySize < min;
    const fits = b !== undefined && row.endsAt.getTime() <= b.startsAt.getTime() && !tooSmallNow;
    if (!fits) {
      await cancelRow(tx, { id: restaurantId }, row, { type: "system", id: null }, ctx.now());
      return;
    }
    const sequence = row.sequence + 1;
    await tx.update(bookingMeeting).set({ sequence }).where(eq(bookingMeeting.id, row.id));
    await emitEvent(tx, {
      type: "meeting.scheduled",
      restaurantId,
      aggregateType: "booking",
      aggregateId: bookingId,
      payload: { meetingId: row.id, bookingId, sequence, cause: change.eventId },
    });
  });
}
