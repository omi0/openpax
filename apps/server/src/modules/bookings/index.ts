import { defineModule } from "../module.js";
import { bookingRoutes } from "./routes.js";

export const bookingsModule = defineModule({
  name: "bookings",
  routes: bookingRoutes,
});
