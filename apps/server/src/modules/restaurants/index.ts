import { defineModule } from "../module.js";
import { restaurantRoutes } from "./routes.js";

export const restaurantsModule = defineModule({
  name: "restaurants",
  routes: restaurantRoutes,
});

/** Public API for other modules: lookups of a restaurant's configuration and the days it closes. */
export {
  createException,
  getPolicy,
  listAreas,
  listExceptions,
  listRestaurantsForUser,
  listServices,
} from "./service.js";
