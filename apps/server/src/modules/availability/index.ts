import { defineModule } from "../module.js";
import { availabilityRoutes } from "./routes.js";

export const availabilityModule = defineModule({
  name: "availability",
  routes: availabilityRoutes,
});
