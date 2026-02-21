import { defineJob } from "../../jobs/queue.js";
import { requestFeedback } from "./service.js";

/** Fires after the visit: emits `feedback.requested`, which the notifications module turns into the email/SMS. */
export const feedbackRequestJob = defineJob<{ bookingId: string; startsAt: string }>({
  name: "feedback.request",
  retryLimit: 2,
  handler: async ({ bookingId, startsAt }, ctx) => {
    await requestFeedback(ctx, bookingId, startsAt);
  },
});
