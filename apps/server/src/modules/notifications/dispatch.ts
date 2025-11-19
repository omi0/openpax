import {
  booking,
  customer,
  notificationLog,
  notificationSetting,
  restaurant,
  service,
  widgetConfig,
} from "@sitli/db";
import type { NotificationAudience, NotificationChannel, NotificationEvent } from "@sitli/shared";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { DEFAULT_SETTINGS, getSettings } from "./service.js";

export interface BookingBundle {
  booking: typeof booking.$inferSelect;
  customer: typeof customer.$inferSelect;
  restaurant: typeof restaurant.$inferSelect;
  serviceName: string;
  widget: typeof widgetConfig.$inferSelect | null;
}

export async function loadBookingBundle(
  ctx: AppContext,
  bookingId: string,
): Promise<BookingBundle | null> {
  const [row] = await ctx.db
    .select({ booking, customer, restaurant, serviceName: service.name, widget: widgetConfig })
    .from(booking)
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .innerJoin(restaurant, eq(restaurant.id, booking.restaurantId))
    .innerJoin(service, eq(service.id, booking.serviceId))
    .leftJoin(widgetConfig, eq(widgetConfig.restaurantId, booking.restaurantId))
    .where(eq(booking.id, bookingId))
    .limit(1);
  return row ?? null;
}

export function recipientFor(
  bundle: BookingBundle,
  channel: NotificationChannel,
  audience: NotificationAudience,
): string | null {
  if (audience === "guest")
    return channel === "email" ? bundle.customer.email : bundle.customer.phone;
  return channel === "email" ? bundle.restaurant.email : bundle.restaurant.phone;
}

export interface QueueParams {
  bookingId: string;
  event: NotificationEvent;
  /** Stable key for this occurrence, e.g. the domain event id. */
  dedupeBase: string;
  /** Reminders: only settings with this offset. */
  offsetMinutes?: number;
}

/**
 * Create one notification_log row per enabled (channel, audience) and enqueue
 * a send job for each. The unique dedupe key makes re-delivery of the same
 * domain event a no-op.
 */
export async function queueNotifications(ctx: AppContext, p: QueueParams): Promise<number> {
  const bundle = await loadBookingBundle(ctx, p.bookingId);
  if (!bundle) return 0;
  const settings = await getSettings(ctx, bundle.restaurant.id);
  let queued = 0;
  for (const s of settings) {
    if (s.event !== p.event || !s.enabled) continue;
    if (p.offsetMinutes !== undefined && s.offsetMinutes !== p.offsetMinutes) continue;
    const recipient = recipientFor(bundle, s.channel, s.audience);
    const dedupeKey = `${p.dedupeBase}:${s.channel}:${s.audience}`;
    const [row] = await ctx.db
      .insert(notificationLog)
      .values({
        restaurantId: bundle.restaurant.id,
        bookingId: bundle.booking.id,
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

/** Schedule reminder jobs for every enabled reminder setting of the restaurant. */
export async function scheduleReminders(ctx: AppContext, bookingId: string): Promise<void> {
  const bundle = await loadBookingBundle(ctx, bookingId);
  if (bundle?.booking.status !== "confirmed") return;
  const settings = await getSettings(ctx, bundle.restaurant.id);
  const offsets = new Set<number>();
  for (const s of settings) {
    if (s.event === "booking.reminder" && s.enabled && s.offsetMinutes)
      offsets.add(s.offsetMinutes);
  }
  const startsAt = bundle.booking.startsAt;
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
