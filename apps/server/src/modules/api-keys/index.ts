import { defineModule } from "../module.js";
import { apiKeyRoutes } from "./routes.js";

export const apiKeysModule = defineModule({
  name: "api-keys",
  routes: apiKeyRoutes,
});
