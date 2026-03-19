import { defineModule } from "../module.js";
import { setupRoutes } from "./routes.js";

/** The setup guide: reads the other modules' public APIs to say what is still missing. */
export const setupModule = defineModule({
  name: "setup",
  routes: setupRoutes,
});
