import { booking, bookingFeedback, customer, notificationLog, service } from "@openpax/db";
import type {
  FeedbackDto,
  FeedbackSummaryDto,
  ListFeedbackQuery,
  PublicFeedbackDto,
  SubmitFeedbackInput,
} from "@openpax/shared";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { AppContext, RestaurantRow } from "../../context.js";
import { emitEvent } from "../../events/outbox.js";
import { ApiError } from "../../lib/errors.js";
import { findRestaurantById } from "../../lib/restaurant-lookup.js";

/** Bookings that presumably took place: nobody cancelled and nobody marked a no-show. */
const VISITED = ["confirmed", "seated", "completed"] as const;

type FeedbackRow = typeof bookingFeedback.$inferSelect;

function toDto(row: {
  feedback: FeedbackRow;
  customer: typeof customer.$inferSelect;
  booking: typeof booking.$inferSelect;
  serviceName: string;
}): FeedbackDto {
  return {
    id: row.feedback.id,
    bookingId: row.feedback.bookingId,
    customer: {
      id: row.customer.id,
      name: row.customer.name,
      email: row.customer.email,
      phone: row.customer.phone,
      locale: row.customer.locale as FeedbackDto["customer"]["locale"],
      visitCount: row.customer.visitCount,
      noShowCount: row.customer.noShowCount,
      cancelCount: row.customer.cancelCount,
    },
    serviceDate: row.booking.serviceDate,
    startsAt: row.booking.startsAt.toISOString(),
    partySize: row.booking.partySize,
    serviceName: row.serviceName,
    rating: row.feedback.rating,
    comment: row.feedback.comment,
    createdAt: row.feedback.createdAt.toISOString(),
  };
}

function select(ctx: AppContext) {
  return ctx.db
    .select({ feedback: bookingFeedback, customer, booking, serviceName: service.name })
    .from(bookingFeedback)
    .innerJoin(booking, eq(booking.id, bookingFeedback.bookingId))
    .innerJoin(customer, eq(customer.id, bookingFeedback.customerId))
    .innerJoin(service, eq(service.id, booking.serviceId));
}

export async function listFeedback(ctx: AppContext, r: RestaurantRow, q: ListFeedbackQuery) {
  const conditions = [eq(bookingFeedback.restaurantId, r.id)];
  if (q.from) conditions.push(gte(booking.serviceDate, q.from));
  if (q.to) conditions.push(lte(booking.serviceDate, q.to));
  if (q.rating) conditions.push(eq(bookingFeedback.rating, q.rating));
  if (q.customerId) conditions.push(eq(bookingFeedback.customerId, q.customerId));
  const where = and(...conditions);
  const [rows, [count]] = await Promise.all([
    select(ctx)
      .where(where)
      .orderBy(desc(bookingFeedback.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    ctx.db
      .select({ total: sql<number>`count(*)::int` })
      .from(bookingFeedback)
      .innerJoin(booking, eq(booking.id, bookingFeedback.bookingId))
      .where(where),
  ]);
  return { items: rows.map(toDto), page: q.page, pageSize: q.pageSize, total: count?.total ?? 0 };
}

/** Responses, average and star distribution over a service-date range (whole history when omitted). */
export async function feedbackSummary(
  ctx: AppContext,
  restaurantId: string,
  range?: { from: string; to: string },
): Promise<FeedbackSummaryDto> {
  const conditions = [eq(bookingFeedback.restaurantId, restaurantId)];
  if (range) {
    conditions.push(gte(booking.serviceDate, range.from), lte(booking.serviceDate, range.to));
  }
  const rows = await ctx.db
    .select({ rating: bookingFeedback.rating, count: sql<number>`count(*)::int` })
    .from(bookingFeedback)
    .innerJoin(booking, eq(booking.id, bookingFeedback.bookingId))
    .where(and(...conditions))
    .groupBy(bookingFeedback.rating);
  const distribution = [0, 0, 0, 0, 0];
  let responses = 0;
  let total = 0;
  for (const row of rows) {
    distribution[row.rating - 1] = row.count;
    responses += row.count;
    total += row.rating * row.count;
  }
  return { responses, averageRating: responses > 0 ? total / responses : null, distribution };
}

// ---------- guest side

async function loadByToken(ctx: AppContext, token: string) {
  const [row] = await ctx.db
    .select({ booking, customer, serviceName: service.name, feedback: bookingFeedback })
    .from(booking)
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .innerJoin(service, eq(service.id, booking.serviceId))
    .leftJoin(bookingFeedback, eq(bookingFeedback.bookingId, booking.id))
    .where(eq(booking.manageToken, token))
    .limit(1);
  if (!row) throw ApiError.notFound("Booking");
  const r = await findRestaurantById(ctx, row.booking.restaurantId);
  return { ...row, restaurant: r };
}

function toPublicDto(row: Awaited<ReturnType<typeof loadByToken>>): PublicFeedbackDto {
  return {
    restaurant: {
      name: row.restaurant.name,
      slug: row.restaurant.slug,
      timezone: row.restaurant.timezone,
    },
    booking: {
      startsAt: row.booking.startsAt.toISOString(),
      partySize: row.booking.partySize,
      serviceName: row.serviceName,
      guestName: row.customer.name,
    },
    canAnswer: (VISITED as readonly string[]).includes(row.booking.status),
    feedback: row.feedback ? { rating: row.feedback.rating, comment: row.feedback.comment } : null,
  };
}

export async function getFeedbackPage(ctx: AppContext, token: string): Promise<PublicFeedbackDto> {
  return toPublicDto(await loadByToken(ctx, token));
}

/** Save (or replace) the guest's answer; the first answer notifies the restaurant. */
export async function submitFeedback(
  ctx: AppContext,
  token: string,
  input: SubmitFeedbackInput,
): Promise<PublicFeedbackDto> {
  const row = await loadByToken(ctx, token);
  if (!(VISITED as readonly string[]).includes(row.booking.status))
    throw ApiError.conflict("not_visited", "Feedback is only open for bookings that took place");
  if (row.booking.endsAt.getTime() > ctx.now().getTime())
    throw ApiError.conflict("too_early", "Feedback opens after the visit");
  await ctx.db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(bookingFeedback)
      .values({
        restaurantId: row.restaurant.id,
        bookingId: row.booking.id,
        customerId: row.customer.id,
        rating: input.rating,
        comment: input.comment || null,
      })
      .onConflictDoUpdate({
        target: bookingFeedback.bookingId,
        set: { rating: input.rating, comment: input.comment || null },
      })
      .returning({ id: bookingFeedback.id, createdAt: bookingFeedback.createdAt });
    if (!saved) throw new Error("feedback insert failed");
    // updated answers keep the original createdAt: only a brand-new one is an event
    if (!row.feedback) {
      await emitEvent(tx, {
        type: "feedback.received",
        restaurantId: row.restaurant.id,
        aggregateType: "booking",
        aggregateId: row.booking.id,
        payload: { bookingId: row.booking.id, feedbackId: saved.id, rating: input.rating },
      });
    }
  });
  return toPublicDto(await loadByToken(ctx, token));
}

/** Job body: ask for feedback if the visit happened and nobody asked yet. */
export async function requestFeedback(
  ctx: AppContext,
  bookingId: string,
  startsAt: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({
      status: booking.status,
      startsAt: booking.startsAt,
      restaurantId: booking.restaurantId,
      answered: bookingFeedback.id,
    })
    .from(booking)
    .leftJoin(bookingFeedback, eq(bookingFeedback.bookingId, booking.id))
    .where(eq(booking.id, bookingId))
    .limit(1);
  if (!row || !(VISITED as readonly string[]).includes(row.status)) return false;
  // the booking moved after this was scheduled: a fresh job exists for the new time
  if (row.startsAt.toISOString() !== startsAt) return false;
  if (row.answered) return false;
  // asked already (a reopened booking schedules the job again): one request per booking
  const [asked] = await ctx.db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.bookingId, bookingId),
        eq(notificationLog.event, "booking.feedback_request"),
      ),
    )
    .limit(1);
  if (asked) return false;
  await emitEvent(ctx.db, {
    type: "feedback.requested",
    restaurantId: row.restaurantId,
    aggregateType: "booking",
    aggregateId: bookingId,
    payload: { bookingId },
  });
  return true;
}
