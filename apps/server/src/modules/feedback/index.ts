import { defineModule } from "../module.js";
import { feedbackEventHandlers } from "./handlers.js";
import { feedbackRequestJob } from "./jobs.js";
import { feedbackRoutes } from "./routes.js";

export const feedbackModule = defineModule({
  name: "feedback",
  routes: feedbackRoutes,
  jobs: [feedbackRequestJob],
  eventHandlers: feedbackEventHandlers,
});

/** Public API: analytics folds the star summary into its report. */
export { feedbackSummary } from "./service.js";
