import { defineModule } from "../module.js";
import { waitlistEventHandlers } from "./handlers.js";
import { expireOfferJob } from "./jobs.js";
import { waitlistRoutes } from "./routes.js";

export const waitlistModule = defineModule({
  name: "waitlist",
  routes: waitlistRoutes,
  jobs: [expireOfferJob],
  eventHandlers: waitlistEventHandlers,
});
