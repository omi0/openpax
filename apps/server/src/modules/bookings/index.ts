import { defineModule } from "../module.js";
import { bookingRoutes } from "./routes.js";

export const bookingsModule = defineModule({
  name: "bookings",
  routes: bookingRoutes,
});

export {
  ACTIVITY_ACTIONS,
  type ActivityItem,
  listActivity,
} from "./activity.js";
/**
 * Public API of the module for features that create or change bookings on a
 * guest's behalf (waitlist offers, deposits, table assignment). Everything
 * else in this directory is private.
 */
export {
  applyBookingAction,
  type BookingWithRelations,
  type CreateBookingParams,
  createBooking,
  getBookingWithRelations,
  listBookings,
  manageUrl,
  toBookingDto,
  toPublicBookingDto,
  updateBooking,
} from "./service.js";
