import {
  booking,
  bookingFeedback,
  bookingPayment,
  customer,
  notificationLog,
  notificationSetting,
  restaurant,
  service,
  waitlistEntry,
  widgetConfig,
} from "@openpax/db";
import type { NotificationAudience, NotificationChannel, NotificationEvent } from "@openpax/shared";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AppContext } from "../../context.js";
import { DEFAULT_SETTINGS, getSettings } from "./service.js";

/**
 * What a message is about: a booking, or a waitlist entry. Renderers only
 * see this shape, so every template works for both.
 */
export interface MessageSubject {
  kind: "booking" | "waitlist";
  bookingId: string | null;
  waitlistEntryId: string | null;
  restaurant: typeof restaurant.$inferSelect;
  widget: typeof widgetConfig.$inferSelect | null;
  customer: typeof customer.$inferSelect;
  /** Guest locale ("it"/"en"). */
  locale: string;
  serviceDate: string;
  /** Arrival instant; null for a waitlist entry that has no offer yet. */
  startsAt: Date | null;
  /** Waitlist only: the time the guest asked for. */
  preferredTime: string | null;
  partySize: number;
  confirmationCode: string;
  serviceName: string;
  notes: string | null;
  cancellationReason: string | null;
  /** Guest-facing link: manage the booking, or the waitlist entry. */
  manageUrl: string;
  dashboardUrl: string;
  /** Deposit / card hold of the booking, if any. */
  payment: {
    status: string;
    amountCents: number;
    currency: string;
    checkoutUrl: string | null;
  } | null;
  /** Where the guest rates the visit, and what they answered. */
  feedbackUrl: string;
  feedback: { rating: number; comment: string | null } | null;
}

export async function loadBookingSubject(
  ctx: AppContext,
  bookingId: string,
): Promise<MessageSubject | null> {
  const [row] = await ctx.db
    .select({
      booking,
      customer,
      restaurant,
      serviceName: service.name,
      widget: widgetConfig,
      payment: bookingPayment,
      feedback: bookingFeedback,
    })
    .from(booking)
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .innerJoin(restaurant, eq(restaurant.id, booking.restaurantId))
    .innerJoin(service, eq(service.id, booking.serviceId))
    .leftJoin(widgetConfig, eq(widgetConfig.restaurantId, booking.restaurantId))
    .leftJoin(bookingPayment, eq(bookingPayment.bookingId, booking.id))
    .leftJoin(bookingFeedback, eq(bookingFeedback.bookingId, booking.id))
    .where(eq(booking.id, bookingId))
    .limit(1);
  if (!row) return null;
  return {
    kind: "booking",
    bookingId: row.booking.id,
    waitlistEntryId: null,
    restaurant: row.restaurant,
    widget: row.widget,
    customer: row.customer,
    locale: row.booking.locale,
    serviceDate: row.booking.serviceDate,
    startsAt: row.booking.startsAt,
    preferredTime: null,
    partySize: row.booking.partySize,
    confirmationCode: row.booking.confirmationCode,
    serviceName: row.serviceName,
    notes: row.booking.notes,
    cancellationReason: row.booking.cancellationReason,
    manageUrl: `${ctx.env.PUBLIC_URL}/book/${row.restaurant.slug}/manage/${row.booking.manageToken}`,
    dashboardUrl: `${ctx.env.PUBLIC_URL}/r/${row.restaurant.id}/today?date=${row.booking.serviceDate}`,
    payment: row.payment
      ? {
          status: row.payment.status,
          amountCents: row.payment.amountCents,
          currency: row.payment.currency,
          checkoutUrl: row.payment.status === "pending" ? row.payment.checkoutUrl : null,
        }
      : null,
    feedbackUrl: `${ctx.env.PUBLIC_URL}/book/${row.restaurant.slug}/feedback/${row.booking.manageToken}`,
    feedback: row.feedback ? { rating: row.feedback.rating, comment: row.feedback.comment } : null,
  };
}

export async function loadWaitlistSubject(
  ctx: AppContext,
  entryId: string,
  event: NotificationEvent,
): Promise<MessageSubject | null> {
  const preferred = alias(service, "preferred_service");
  const offered = alias(service, "offered_service");
  const [row] = await ctx.db
    .select({
      entry: waitlistEntry,
      customer,
      restaurant,
      widget: widgetConfig,
      preferredName: preferred.name,
      offeredName: offered.name,
    })
    .from(waitlistEntry)
    .innerJoin(customer, eq(customer.id, waitlistEntry.customerId))
    .innerJoin(restaurant, eq(restaurant.id, waitlistEntry.restaurantId))
    .leftJoin(preferred, eq(preferred.id, waitlistEntry.serviceId))
    .leftJoin(offered, eq(offered.id, waitlistEntry.offeredServiceId))
    .leftJoin(widgetConfig, eq(widgetConfig.restaurantId, waitlistEntry.restaurantId))
    .where(eq(waitlistEntry.id, entryId))
    .limit(1);
  if (!row) return null;
  const offer = event === "waitlist.offered" && row.entry.offeredStartsAt;
  return {
    kind: "waitlist",
    bookingId: null,
    waitlistEntryId: row.entry.id,
    restaurant: row.restaurant,
    widget: row.widget,
    customer: row.customer,
    locale: row.entry.locale,
    serviceDate: row.entry.serviceDate,
    startsAt: offer ? row.entry.offeredStartsAt : null,
    preferredTime: row.entry.preferredTime,
    partySize: row.entry.partySize,
    confirmationCode: "",
    serviceName: (offer ? row.offeredName : row.preferredName) ?? "",
    notes: row.entry.notes,
    cancellationReason: null,
    manageUrl: `${ctx.env.PUBLIC_URL}/book/${row.restaurant.slug}/waitlist/${row.entry.token}`,
    dashboardUrl: `${ctx.env.PUBLIC_URL}/r/${row.restaurant.id}/today?date=${row.entry.serviceDate}`,
    payment: null,
    feedbackUrl: "",
    feedback: null,
  };
}

export function recipientFor(
  subject: MessageSubject,
  channel: NotificationChannel,
  audience: NotificationAudience,
): string | null {
  if (audience === "guest")
    return channel === "email" ? subject.customer.email : subject.customer.phone;
  return channel === "email" ? subject.restaurant.email : subject.restaurant.phone;
}

export type QueueParams = {
  event: NotificationEvent;
  /** Stable key for this occurrence, e.g. the domain event id. */
  dedupeBase: string;
  /** Reminders: only settings with this offset. */
  offsetMinutes?: number;
  /** Only these audiences (default: every enabled one). */
  audiences?: NotificationAudience[];
} & (
  | { bookingId: string; waitlistEntryId?: never }
  | { waitlistEntryId: string; bookingId?: never }
);

/**
 * Create one notification_log row per enabled (channel, audience) and enqueue
 * a send job for each. The unique dedupe key makes re-delivery of the same
 * domain event a no-op.
 */
export async function queueNotifications(ctx: AppContext, p: QueueParams): Promise<number> {
  const subject = p.bookingId
    ? await loadBookingSubject(ctx, p.bookingId)
    : p.waitlistEntryId
      ? await loadWaitlistSubject(ctx, p.waitlistEntryId, p.event)
      : null;
  if (!subject) return 0;
  const settings = await getSettings(ctx, subject.restaurant.id);
  let queued = 0;
  for (const s of settings) {
    if (s.event !== p.event || !s.enabled) continue;
    if (p.offsetMinutes !== undefined && s.offsetMinutes !== p.offsetMinutes) continue;
    if (p.audiences && !p.audiences.includes(s.audience)) continue;
    const recipient = recipientFor(subject, s.channel, s.audience);
    const dedupeKey = `${p.dedupeBase}:${s.channel}:${s.audience}`;
    const [row] = await ctx.db
      .insert(notificationLog)
      .values({
        restaurantId: subject.restaurant.id,
        bookingId: subject.bookingId,
        waitlistEntryId: subject.waitlistEntryId,
        event: p.event,
        channel: s.channel,
        audience: s.audience,
        dedupeKey,
        recipient: recipient ?? "",
        status: recipient ? "queued" : "skipped",
        error: recipient ? null : "no recipient",
      })
      .onConflictDoNothing({ target: notificationLog.dedupeKey })
      .returning({ id: notificationLog.id, status: notificationLog.status });
    if (row?.status !== "queued") continue;
    await ctx.jobs.send("notify.send", { logId: row.id });
    queued += 1;
  }
  return queued;
}

/** The guest-facing message that describes a booking in its current status. */
export function eventForStatus(status: string): NotificationEvent | null {
  switch (status) {
    case "confirmed":
    case "seated":
    case "completed":
      return "booking.confirmed";
    case "pending":
      return "booking.pending";
    case "cancelled":
      return "booking.cancelled";
    default:
      return null;
  }
}

/**
 * Send the guest the message for the booking's current status again (the
 * email went to spam, the phone number was fixed). Bypasses the dedupe key
 * of the original event and only reaches the guest.
 */
export async function resendToGuest(
  ctx: AppContext,
  bookingId: string,
): Promise<{ queued: number; event: NotificationEvent | null }> {
  const [row] = await ctx.db
    .select({ status: booking.status })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  const event = row ? eventForStatus(row.status) : null;
  if (!event) return { queued: 0, event: null };
  const queued = await queueNotifications(ctx, {
    bookingId,
    event,
    dedupeBase: `resend:${bookingId}:${ctx.now().getTime()}:${Math.random().toString(36).slice(2, 8)}`,
    audiences: ["guest"],
  });
  return { queued, event };
}

/** Schedule reminder jobs for every enabled reminder setting of the restaurant. */
export async function scheduleReminders(ctx: AppContext, bookingId: string): Promise<void> {
  const [row] = await ctx.db
    .select({
      status: booking.status,
      startsAt: booking.startsAt,
      restaurantId: booking.restaurantId,
    })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  if (row?.status !== "confirmed") return;
  const settings = await getSettings(ctx, row.restaurantId);
  const offsets = new Set<number>();
  for (const s of settings) {
    if (s.event === "booking.reminder" && s.enabled && s.offsetMinutes)
      offsets.add(s.offsetMinutes);
  }
  const startsAt = row.startsAt;
  for (const offset of offsets) {
    const startAfter = new Date(startsAt.getTime() - offset * 60_000);
    if (startAfter.getTime() <= ctx.now().getTime()) continue;
    await ctx.jobs.send(
      "notify.reminder",
      { bookingId, startsAt: startsAt.toISOString(), offsetMinutes: offset },
      { startAfter, singletonKey: `reminder:${bookingId}:${offset}:${startsAt.toISOString()}` },
    );
  }
}

export function knownSettingsFor(event: NotificationEvent) {
  return DEFAULT_SETTINGS.filter((s) => s.event === event);
}

export async function hasAnyEnabled(
  ctx: AppContext,
  restaurantId: string,
  event: NotificationEvent,
): Promise<boolean> {
  const rows = await ctx.db
    .select({ enabled: notificationSetting.enabled })
    .from(notificationSetting)
    .where(
      and(eq(notificationSetting.restaurantId, restaurantId), eq(notificationSetting.event, event)),
    );
  if (rows.length === 0) return knownSettingsFor(event).some((s) => s.enabled);
  return rows.some((r) => r.enabled);
}
