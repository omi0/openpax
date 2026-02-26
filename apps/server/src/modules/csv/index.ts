import { defineModule } from "../module.js";
import { csvRoutes } from "./routes.js";

export const csvModule = defineModule({
  name: "csv",
  routes: csvRoutes,
});
