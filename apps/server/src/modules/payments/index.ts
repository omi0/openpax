import { defineModule } from "../module.js";
import { paymentEventHandlers } from "./handlers.js";
import { expirePaymentJob } from "./jobs.js";
import { paymentRoutes } from "./routes.js";

export const paymentsModule = defineModule({
  name: "payments",
  routes: paymentRoutes,
  jobs: [expirePaymentJob],
  eventHandlers: paymentEventHandlers,
});

/** Public API: the bookings module gates online bookings on a deposit through these. */
export {
  formatAmount,
  type PaymentRequirement,
  paymentVarsFor,
  requirementFor,
  startCheckout,
  syncPendingForBooking,
  toPaymentDto,
  toPublicPaymentDto,
} from "./service.js";
