import { defineModule } from "../module.js";
import { teamRoutes } from "./routes.js";

export const teamModule = defineModule({
  name: "team",
  routes: teamRoutes,
});

/** Public API for other modules: members and pending invitations of the restaurant's organization. */
export { getTeam } from "./service.js";
