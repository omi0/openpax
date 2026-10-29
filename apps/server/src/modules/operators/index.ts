import { defineModule } from "../module.js";
import { operatorRoutes } from "./routes.js";

/** Floor staff behind the shared dashboard login, each with a 6-digit code. */
export const operatorsModule = defineModule({ name: "operators", routes: operatorRoutes });

export { assertOperatorName, requireOperator } from "./service.js";
