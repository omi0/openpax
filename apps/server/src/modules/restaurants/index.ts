import { defineModule } from "../module.js";
import { restaurantRoutes } from "./routes.js";

export const restaurantsModule = defineModule({
  name: "restaurants",
  routes: restaurantRoutes,
});
