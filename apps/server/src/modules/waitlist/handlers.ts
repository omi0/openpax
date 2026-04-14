import { booking, waitlistEntry } from "@openpax/db";
import { eq } from "drizzle-orm";
import { defineEventHandler } from "../../events/dispatch.js";
import { findRestaurantById } from "../../lib/restaurant-lookup.js";
import { autoOffer } from "./service.js";

/**
 * Whenever capacity may have freed up on a date, give the first waiting
 * guest a chance. Auto-offer is idempotent: it does nothing while an offer is
 * open and nothing when nobody fits.
 */
export const waitlistEventHandlers = [
  defineEventHandler({
    type: "booking.cancelled",
    handle: async (event, ctx) => {
      if (!event.restaurantId) return;
      const [row] = await ctx.db
        .select({ serviceDate: booking.serviceDate })
        .from(booking)
        .where(eq(booking.id, event.payload.bookingId))
        .limit(1);
      if (!row) return;
      await autoOffer(ctx, await findRestaurantById(ctx, event.restaurantId), row.serviceDate);
    },
  }),
  defineEventHandler({
    // the offer was taken (by the guest or by staff): the date may still have room for the next in line
    type: "waitlist.booked",
    handle: async (event, ctx) => {
      if (!event.restaurantId) return;
      const [row] = await ctx.db
        .select({ serviceDate: waitlistEntry.serviceDate })
        .from(waitlistEntry)
        .where(eq(waitlistEntry.id, event.payload.entryId))
        .limit(1);
      if (!row) return;
      await autoOffer(ctx, await findRestaurantById(ctx, event.restaurantId), row.serviceDate);
    },
  }),
  defineEventHandler({
    type: "waitlist.expired",
    handle: async (event, ctx) => {
      if (!event.restaurantId) return;
      await autoOffer(
        ctx,
        await findRestaurantById(ctx, event.restaurantId),
        event.payload.serviceDate,
      );
    },
  }),
  defineEventHandler({
    type: "waitlist.cancelled",
    handle: async (event, ctx) => {
      // only a declined offer frees a turn for the next guest
      if (!event.restaurantId || event.payload.previousStatus !== "offered") return;
      await autoOffer(
        ctx,
        await findRestaurantById(ctx, event.restaurantId),
        event.payload.serviceDate,
      );
    },
  }),
];
