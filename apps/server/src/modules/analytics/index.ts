import { defineModule } from "../module.js";
import { analyticsRoutes } from "./routes.js";

export const analyticsModule = defineModule({
  name: "analytics",
  routes: analyticsRoutes,
});

/** Public API: the figures of the analytics page, for assistants. */
export { getAnalytics } from "./service.js";
