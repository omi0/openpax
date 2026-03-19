import { defineModule } from "../module.js";
import { restaurantRoutes } from "./routes.js";

export const restaurantsModule = defineModule({
  name: "restaurants",
  routes: restaurantRoutes,
});

/** Public API for other modules: read-only lookups of a restaurant's configuration. */
export { listAreas, listServices } from "./service.js";
