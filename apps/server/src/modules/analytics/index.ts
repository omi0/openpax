import { defineModule } from "../module.js";
import { analyticsRoutes } from "./routes.js";

export const analyticsModule = defineModule({
  name: "analytics",
  routes: analyticsRoutes,
});
