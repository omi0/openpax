import { builtinProviders } from "../../notifications/providers/index.js";
import { defineModule } from "../module.js";
import { notificationEventHandlers } from "./handlers.js";
import { invitationCreatedHandler, invitationEmailJob } from "./invitations.js";
import { reminderJob, sendNotificationJob } from "./jobs.js";
import { notificationRoutes } from "./routes.js";

export const notificationsModule = defineModule({
  name: "notifications",
  routes: notificationRoutes,
  jobs: [sendNotificationJob, reminderJob, invitationEmailJob],
  eventHandlers: [...notificationEventHandlers, invitationCreatedHandler],
  providers: builtinProviders,
});
