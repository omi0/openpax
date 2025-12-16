import { defineModule } from "../module.js";
import { customerRoutes } from "./routes.js";

export const customersModule = defineModule({
  name: "customers",
  routes: customerRoutes,
});
