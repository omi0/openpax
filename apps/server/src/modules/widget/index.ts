import { defineModule } from "../module.js";
import { widgetRoutes } from "./routes.js";

export const widgetModule = defineModule({
  name: "widget",
  routes: widgetRoutes,
});
