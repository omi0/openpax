import {
  Bell,
  CalendarOff,
  Clock,
  CreditCard,
  Globe,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  Store,
  Users,
} from "lucide-react";

export interface SettingsSection {
  to:
    | "/r/$restaurantId/settings/restaurant"
    | "/r/$restaurantId/settings/services"
    | "/r/$restaurantId/settings/closures"
    | "/r/$restaurantId/settings/tables"
    | "/r/$restaurantId/settings/notifications"
    | "/r/$restaurantId/settings/payments"
    | "/r/$restaurantId/settings/widget"
    | "/r/$restaurantId/settings/team"
    | "/r/$restaurantId/settings/api-keys";
  /** i18n key of the section title. */
  titleKey: string;
  /** i18n key of the one-line explanation. */
  descKey: string;
  Icon: LucideIcon;
  /** Hidden from staff members. */
  managersOnly?: boolean;
}

/** The settings sections in display order, shared by the hub page and the side navigation. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    to: "/r/$restaurantId/settings/restaurant",
    titleKey: "restaurant.title",
    descKey: "settings.desc.restaurant",
    Icon: Store,
  },
  {
    to: "/r/$restaurantId/settings/services",
    titleKey: "services.title",
    descKey: "settings.desc.services",
    Icon: Clock,
  },
  {
    to: "/r/$restaurantId/settings/closures",
    titleKey: "closures.title",
    descKey: "settings.desc.closures",
    Icon: CalendarOff,
  },
  {
    to: "/r/$restaurantId/settings/tables",
    titleKey: "tables.title",
    descKey: "settings.desc.tables",
    Icon: LayoutGrid,
  },
  {
    to: "/r/$restaurantId/settings/notifications",
    titleKey: "notifications.title",
    descKey: "settings.desc.notifications",
    Icon: Bell,
  },
  {
    to: "/r/$restaurantId/settings/payments",
    titleKey: "payments.title",
    descKey: "settings.desc.payments",
    Icon: CreditCard,
    managersOnly: true,
  },
  {
    to: "/r/$restaurantId/settings/widget",
    titleKey: "widget.title",
    descKey: "settings.desc.widget",
    Icon: Globe,
  },
  {
    to: "/r/$restaurantId/settings/team",
    titleKey: "team.title",
    descKey: "settings.desc.team",
    Icon: Users,
  },
  {
    to: "/r/$restaurantId/settings/api-keys",
    titleKey: "apiKeys.title",
    descKey: "settings.desc.apiKeys",
    Icon: KeyRound,
    managersOnly: true,
  },
];
