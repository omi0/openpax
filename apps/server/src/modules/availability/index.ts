import { defineModule } from "../module.js";
import { availabilityRoutes } from "./routes.js";

export const availabilityModule = defineModule({
  name: "availability",
  routes: availabilityRoutes,
});

/** Public API: the same availability the dashboard dialogs and the widget show. */
export { getAvailability } from "./service.js";
