import type { BookingStatus } from "../booking/state-machine.js";

export const BOOKING_SOURCES = ["widget", "manual", "phone", "walk_in", "api"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

/**
 * Domain events are the only coupling point between the core booking flow and
 * everything else (notifications, webhooks, analytics...). Payloads carry IDs
 * and the minimum facts a subscriber needs to decide what to do; subscribers
 * load fresh data themselves.
 */
export interface DomainEventPayloads {
  "restaurant.created": { restaurantId: string; organizationId: string };
  "booking.created": {
    bookingId: string;
    status: BookingStatus;
    source: BookingSource;
    partySize: number;
    startsAt: string;
  };
  "booking.confirmed": { bookingId: string; previousStatus: BookingStatus };
  "booking.cancelled": {
    bookingId: string;
    previousStatus: BookingStatus;
    cancelledBy: "guest" | "staff" | "system";
  };
  "booking.modified": { bookingId: string; changes: string[] };
  "booking.seated": { bookingId: string };
  "booking.completed": { bookingId: string };
  "booking.no_show": { bookingId: string };
  "team.invitation_created": {
    invitationId: string;
    organizationId: string;
    email: string;
    role: string;
  };
}

export type DomainEventType = keyof DomainEventPayloads;

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  id: string;
  type: T;
  /** Schema version of the payload, bump on breaking payload changes. */
  version: 1;
  occurredAt: string;
  /** null for organization-level events (team, billing...). */
  restaurantId: string | null;
  payload: DomainEventPayloads[T];
}

export const DOMAIN_EVENT_TYPES = [
  "restaurant.created",
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.modified",
  "booking.seated",
  "booking.completed",
  "booking.no_show",
  "team.invitation_created",
] as const satisfies readonly DomainEventType[];

export function isDomainEventType(value: string): value is DomainEventType {
  return (DOMAIN_EVENT_TYPES as readonly string[]).includes(value);
}
