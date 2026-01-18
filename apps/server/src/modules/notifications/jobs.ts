import { booking, notificationLog } from "@sitli/db";
import { eq, sql } from "drizzle-orm";
import { defineJob } from "../../jobs/queue.js";
import type { NotificationProvider } from "../../notifications/provider.js";
import { loadBookingBundle, queueNotifications } from "./dispatch.js";
import { buildEmail, buildSms } from "./render.js";
import { isNotificationEvent, resolveProvider } from "./service.js";

export const sendNotificationJob = defineJob<{ logId: string }>({
  name: "notify.send",
  retryLimit: 4,
  retryDelaySeconds: 60,
  handler: async ({ logId }, ctx) => {
    const [log] = await ctx.db
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.id, logId))
      .limit(1);
    if (!log || log.status === "sent" || log.status === "skipped") return;
    if (!log.bookingId || !isNotificationEvent(log.event)) return;

    const bundle = await loadBookingBundle(ctx, log.bookingId);
    if (!bundle) return;

    const fail = async (error: string, final: boolean) => {
      await ctx.db
        .update(notificationLog)
        .set({
          status: final ? "skipped" : "failed",
          error,
          attempts: sql`${notificationLog.attempts} + 1`,
        })
        .where(eq(notificationLog.id, logId));
    };

    const resolved = await resolveProvider(ctx, bundle.restaurant, log.channel);
    if (!resolved) {
      await fail(`no ${log.channel} provider configured`, true);
      return;
    }

    try {
      let result: { providerMessageId?: string };
      if (log.channel === "email") {
        const message = await buildEmail(ctx, bundle, log.event, log.audience, log.recipient);
        result = await (resolved.provider as NotificationProvider<"email">).send(
          message,
          resolved.config,
        );
      } else {
        const message = await buildSms(ctx, bundle, log.event, log.audience, log.recipient);
        result = await (resolved.provider as NotificationProvider<"sms">).send(
          message,
          resolved.config,
        );
      }
      await ctx.db
        .update(notificationLog)
        .set({
          status: "sent",
          providerId: resolved.provider.id,
          providerMessageId: result.providerMessageId ?? null,
          error: null,
          sentAt: ctx.now(),
          attempts: sql`${notificationLog.attempts} + 1`,
        })
        .where(eq(notificationLog.id, logId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.db
        .update(notificationLog)
        .set({
          status: "failed",
          providerId: resolved.provider.id,
          error: message,
          attempts: sql`${notificationLog.attempts} + 1`,
        })
        .where(eq(notificationLog.id, logId));
      throw error; // let the queue retry
    }
  },
});

export const reminderJob = defineJob<{
  bookingId: string;
  startsAt: string;
  offsetMinutes: number;
}>({
  name: "notify.reminder",
  retryLimit: 2,
  handler: async ({ bookingId, startsAt, offsetMinutes }, ctx) => {
    const [row] = await ctx.db
      .select({ status: booking.status, startsAt: booking.startsAt })
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (row?.status !== "confirmed") return;
    // The booking moved after this reminder was scheduled: a fresh one exists.
    if (row.startsAt.toISOString() !== startsAt) return;
    await queueNotifications(ctx, {
      bookingId,
      event: "booking.reminder",
      dedupeBase: `reminder:${bookingId}:${startsAt}:${offsetMinutes}`,
      offsetMinutes,
    });
  },
});
