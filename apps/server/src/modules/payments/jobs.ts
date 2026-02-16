import { bookingPayment } from "@sitli/db";
import { eq } from "drizzle-orm";
import { defineJob } from "../../jobs/queue.js";
import { expirePayment, syncPayment } from "./service.js";

/** Runs a minute after the checkout window: settles a missed webhook, else drops the booking. */
export const expirePaymentJob = defineJob<{ paymentId: string }>({
  name: "payment.expire",
  retryLimit: 3,
  retryDelaySeconds: 60,
  handler: async ({ paymentId }, ctx) => {
    const [row] = await ctx.db
      .select()
      .from(bookingPayment)
      .where(eq(bookingPayment.id, paymentId))
      .limit(1);
    if (row?.status !== "pending") return;
    const after = await syncPayment(ctx, row);
    if (after?.status === "pending") await expirePayment(ctx, row.id);
  },
});
