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

/** Public API for features that show or offer waitlist spots on staff's behalf (assistants). */
export { cancelEntry, listEntries, offerEntry, toEntryDto } from "./service.js";
