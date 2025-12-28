import { apiKeysModule } from "./api-keys/index.js";
import { availabilityModule } from "./availability/index.js";
import { bookingsModule } from "./bookings/index.js";
import { customersModule } from "./customers/index.js";
import type { SitliModule } from "./module.js";
import { notificationsModule } from "./notifications/index.js";
import { restaurantsModule } from "./restaurants/index.js";
import { teamModule } from "./team/index.js";
import { widgetModule } from "./widget/index.js";

/** Order matters only for route registration. */
export const modules: SitliModule[] = [
  restaurantsModule,
  availabilityModule,
  widgetModule,
  bookingsModule,
  customersModule,
  notificationsModule,
  teamModule,
  apiKeysModule,
];
