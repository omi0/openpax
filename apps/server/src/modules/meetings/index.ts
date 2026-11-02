import { defineModule } from "../module.js";
import { meetingEmailJob, meetingEventHandlers } from "./jobs.js";
import { meetingRoutes } from "./routes.js";

export {
  cancelMeeting,
  getBookingMeeting,
  listMeetings,
  meetingSlots,
  scheduleMeeting,
} from "./service.js";

/** Planning meetings between large groups and the host (chef, manager), with calendar invites. */
export const meetingsModule = defineModule({
  name: "meetings",
  routes: meetingRoutes,
  jobs: [meetingEmailJob],
  eventHandlers: meetingEventHandlers,
});
