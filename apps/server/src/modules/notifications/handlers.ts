import { defineEventHandler } from "../../events/dispatch.js";
import { queueNotifications, scheduleReminders } from "./dispatch.js";

export const notificationEventHandlers = [
  defineEventHandler({
    type: "booking.created",
    handle: async (event, ctx) => {
      const { bookingId, status } = event.payload;
      if (status === "confirmed" || status === "seated") {
        await queueNotifications(ctx, {
          bookingId,
          event: "booking.confirmed",
          dedupeBase: event.id,
        });
        await scheduleReminders(ctx, bookingId);
      } else if (status === "pending") {
        await queueNotifications(ctx, {
          bookingId,
          event: "booking.pending",
          dedupeBase: event.id,
        });
      }
    },
  }),
  defineEventHandler({
    type: "booking.confirmed",
    handle: async (event, ctx) => {
      await queueNotifications(ctx, {
        bookingId: event.payload.bookingId,
        event: "booking.confirmed",
        dedupeBase: event.id,
      });
      await scheduleReminders(ctx, event.payload.bookingId);
    },
  }),
  defineEventHandler({
    type: "booking.cancelled",
    handle: async (event, ctx) => {
      await queueNotifications(ctx, {
        bookingId: event.payload.bookingId,
        event: "booking.cancelled",
        dedupeBase: event.id,
      });
    },
  }),
  defineEventHandler({
    type: "booking.modified",
    handle: async (event, ctx) => {
      await queueNotifications(ctx, {
        bookingId: event.payload.bookingId,
        event: "booking.modified",
        dedupeBase: event.id,
      });
      if (event.payload.changes.includes("startsAt"))
        await scheduleReminders(ctx, event.payload.bookingId);
    },
  }),
];
