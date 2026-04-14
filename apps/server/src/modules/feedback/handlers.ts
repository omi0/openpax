import { booking, notificationSetting } from "@openpax/db";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { defineEventHandler } from "../../events/dispatch.js";

const DEFAULT_DELAY_MINUTES = 120;

/** Minutes after the visit ends before asking, from the restaurant's rules (null when the request is off). */
async function delayFor(ctx: AppContext, restaurantId: string): Promise<number | null> {
  const rows = await ctx.db
    .select({ enabled: notificationSetting.enabled, offset: notificationSetting.offsetMinutes })
    .from(notificationSetting)
    .where(
      and(
        eq(notificationSetting.restaurantId, restaurantId),
        eq(notificationSetting.event, "booking.feedback_request"),
      ),
    );
  // no explicit row = the default rule (email on, two hours after)
  if (rows.length === 0) return DEFAULT_DELAY_MINUTES;
  const enabled = rows.filter((r) => r.enabled);
  if (enabled.length === 0) return null;
  return Math.min(...enabled.map((r) => r.offset ?? DEFAULT_DELAY_MINUTES));
}

async function schedule(ctx: AppContext, bookingId: string) {
  const [row] = await ctx.db
    .select({
      status: booking.status,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      restaurantId: booking.restaurantId,
    })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  if (!row || !["confirmed", "seated"].includes(row.status)) return;
  const delay = await delayFor(ctx, row.restaurantId);
  if (delay === null) return;
  const startAfter = new Date(row.endsAt.getTime() + delay * 60_000);
  await ctx.jobs.send(
    "feedback.request",
    { bookingId, startsAt: row.startsAt.toISOString() },
    { startAfter, singletonKey: `feedback:${bookingId}:${row.startsAt.toISOString()}` },
  );
}

/** Every booking that ends up confirmed gets one feedback request after the visit. */
export const feedbackEventHandlers = [
  defineEventHandler({
    type: "booking.created",
    handle: async (event, ctx) => {
      if (event.payload.imported) return;
      if (event.payload.status === "confirmed" || event.payload.status === "seated")
        await schedule(ctx, event.payload.bookingId);
    },
  }),
  defineEventHandler({
    type: "booking.confirmed",
    handle: async (event, ctx) => schedule(ctx, event.payload.bookingId),
  }),
  defineEventHandler({
    type: "booking.modified",
    handle: async (event, ctx) => {
      if (event.payload.changes.includes("startsAt")) await schedule(ctx, event.payload.bookingId);
    },
  }),
];
