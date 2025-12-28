import { defineModule } from "../module.js";
import { teamRoutes } from "./routes.js";

export const teamModule = defineModule({
  name: "team",
  routes: teamRoutes,
});
