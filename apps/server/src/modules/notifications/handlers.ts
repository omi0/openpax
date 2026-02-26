import { defineEventHandler } from "../../events/dispatch.js";
import { queueNotifications, scheduleReminders } from "./dispatch.js";

export const notificationEventHandlers = [
  defineEventHandler({
    type: "booking.created",
    handle: async (event, ctx) => {
      const { bookingId, status } = event.payload;
      if (event.payload.imported) return;
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
          event: event.payload.paymentRequired ? "booking.payment_required" : "booking.pending",
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
  defineEventHandler({
    type: "feedback.requested",
    handle: async (event, ctx) => {
      await queueNotifications(ctx, {
        bookingId: event.payload.bookingId,
        event: "booking.feedback_request",
        dedupeBase: event.id,
      });
    },
  }),
  defineEventHandler({
    type: "feedback.received",
    handle: async (event, ctx) => {
      await queueNotifications(ctx, {
        bookingId: event.payload.bookingId,
        event: "booking.feedback_received",
        dedupeBase: event.id,
      });
    },
  }),
  defineEventHandler({
    type: "waitlist.joined",
    handle: async (event, ctx) => {
      await queueNotifications(ctx, {
        waitlistEntryId: event.payload.entryId,
        event: "waitlist.joined",
        dedupeBase: event.id,
      });
    },
  }),
  defineEventHandler({
    type: "waitlist.offered",
    handle: async (event, ctx) => {
      await queueNotifications(ctx, {
        waitlistEntryId: event.payload.entryId,
        event: "waitlist.offered",
        dedupeBase: event.id,
      });
    },
  }),
];
