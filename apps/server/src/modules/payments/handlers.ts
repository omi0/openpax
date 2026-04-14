import { paymentConfig } from "@openpax/db";
import { eq } from "drizzle-orm";
import { defineEventHandler } from "../../events/dispatch.js";
import { findRestaurantById } from "../../lib/restaurant-lookup.js";
import { chargeNoShowFee, getPaymentForBooking, refundPayment } from "./service.js";

const SYSTEM = { type: "system", id: null } as const;

export const paymentEventHandlers = [
  // a cancelled booking gives the deposit back when the policy says so
  defineEventHandler({
    type: "booking.cancelled",
    handle: async (event, ctx) => {
      if (!event.restaurantId) return;
      const payment = await getPaymentForBooking(ctx, event.payload.bookingId);
      if (payment?.status !== "paid") return;
      const [cfg] = await ctx.db
        .select({ refundOnCancel: paymentConfig.refundOnCancel })
        .from(paymentConfig)
        .where(eq(paymentConfig.restaurantId, event.restaurantId))
        .limit(1);
      if (!cfg?.refundOnCancel) return;
      try {
        await refundPayment(
          ctx,
          await findRestaurantById(ctx, event.restaurantId),
          event.payload.bookingId,
          SYSTEM,
        );
      } catch (error) {
        // the gateway said no: leave it to staff (the payment stays "paid" with a refund button)
        ctx.logger.warn({ err: error, bookingId: event.payload.bookingId }, "auto refund failed");
      }
    },
  }),
  // a no-show charges the fee on the saved card
  defineEventHandler({
    type: "booking.no_show",
    handle: async (event, ctx) => {
      if (!event.restaurantId) return;
      const payment = await getPaymentForBooking(ctx, event.payload.bookingId);
      if (payment?.status !== "card_saved") return;
      const [cfg] = await ctx.db
        .select({ chargeNoShow: paymentConfig.chargeNoShow })
        .from(paymentConfig)
        .where(eq(paymentConfig.restaurantId, event.restaurantId))
        .limit(1);
      if (!cfg?.chargeNoShow) return;
      await chargeNoShowFee(
        ctx,
        await findRestaurantById(ctx, event.restaurantId),
        event.payload.bookingId,
        SYSTEM,
      );
    },
  }),
];
