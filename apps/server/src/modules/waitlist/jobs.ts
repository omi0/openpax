import { defineJob } from "../../jobs/queue.js";
import { expireOffer } from "./service.js";

/** Scheduled when a table is offered; marks the offer expired if it was never accepted. */
export const expireOfferJob = defineJob<{ entryId: string; offeredStartsAt: string }>({
  name: "waitlist.expire",
  retryLimit: 2,
  handler: async ({ entryId, offeredStartsAt }, ctx) => {
    await expireOffer(ctx, entryId, offeredStartsAt);
  },
});
