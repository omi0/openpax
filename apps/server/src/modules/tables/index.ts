import { defineModule } from "../module.js";
import { tableRoutes } from "./routes.js";

export const tablesModule = defineModule({
  name: "tables",
  routes: tableRoutes,
});

/** Public API for other modules. */
export { listTables } from "./service.js";
