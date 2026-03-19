import { analyticsModule } from "./analytics/index.js";
import { apiKeysModule } from "./api-keys/index.js";
import { availabilityModule } from "./availability/index.js";
import { bookingsModule } from "./bookings/index.js";
import { csvModule } from "./csv/index.js";
import { customersModule } from "./customers/index.js";
import { feedbackModule } from "./feedback/index.js";
import type { SitliModule } from "./module.js";
import { notificationsModule } from "./notifications/index.js";
import { paymentsModule } from "./payments/index.js";
import { restaurantsModule } from "./restaurants/index.js";
import { setupModule } from "./setup/index.js";
import { tablesModule } from "./tables/index.js";
import { teamModule } from "./team/index.js";
import { waitlistModule } from "./waitlist/index.js";
import { widgetModule } from "./widget/index.js";

/** Order matters only for route registration. */
export const modules: SitliModule[] = [
  restaurantsModule,
  // before bookings and customers: its /export and /import paths would otherwise match their {id} routes
  csvModule,
  availabilityModule,
  widgetModule,
  bookingsModule,
  waitlistModule,
  tablesModule,
  paymentsModule,
  feedbackModule,
  customersModule,
  notificationsModule,
  teamModule,
  apiKeysModule,
  analyticsModule,
  setupModule,
];
