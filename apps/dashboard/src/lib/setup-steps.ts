import type { SetupStep } from "@sitli/shared";
import {
  Bell,
  Clock,
  LayoutGrid,
  type LucideIcon,
  Rocket,
  SlidersHorizontal,
  Store,
  Users,
} from "lucide-react";
import type { SettingsSection } from "./settings-nav";

/** Icon and settings page of each setup-guide step; texts live under `setup.steps.*`. */
export const SETUP_STEP_META: Record<
  SetupStep,
  { Icon: LucideIcon; settingsTo: SettingsSection["to"] }
> = {
  restaurant: { Icon: Store, settingsTo: "/r/$restaurantId/settings/restaurant" },
  services: { Icon: Clock, settingsTo: "/r/$restaurantId/settings/services" },
  rooms: { Icon: LayoutGrid, settingsTo: "/r/$restaurantId/settings/tables" },
  policy: { Icon: SlidersHorizontal, settingsTo: "/r/$restaurantId/settings/widget" },
  notifications: { Icon: Bell, settingsTo: "/r/$restaurantId/settings/notifications" },
  team: { Icon: Users, settingsTo: "/r/$restaurantId/settings/team" },
  widget: { Icon: Rocket, settingsTo: "/r/$restaurantId/settings/widget" },
};
