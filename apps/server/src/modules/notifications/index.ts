import { builtinProviders } from "../../notifications/providers/index.js";
import { defineModule } from "../module.js";
import { passwordResetJob } from "./account.js";
import { notificationEventHandlers } from "./handlers.js";
import { invitationCreatedHandler, invitationEmailJob } from "./invitations.js";
import { reminderJob, sendNotificationJob } from "./jobs.js";
import { notificationRoutes } from "./routes.js";

export const notificationsModule = defineModule({
  name: "notifications",
  routes: notificationRoutes,
  jobs: [sendNotificationJob, reminderJob, invitationEmailJob, passwordResetJob],
  eventHandlers: [...notificationEventHandlers, invitationCreatedHandler],
  providers: builtinProviders,
});
