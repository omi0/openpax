import type { BookingStatus } from "../booking/state-machine.js";
import type { WaitlistStatus } from "../waitlist/waitlist.js";

export const BOOKING_SOURCES = [
  "widget",
  "manual",
  "phone",
  "walk_in",
  "api",
  "assistant",
] as const;
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
    /** The booking stays pending until the guest pays a deposit or saves a card. */
    paymentRequired?: boolean;
    /** Loaded from a CSV (history from another system): no messages, no feedback request. */
    imported?: boolean;
    /** Staff chose not to send the guest the confirmation (the restaurant is still told). */
    notifyGuest?: boolean;
  };
  "booking.confirmed": { bookingId: string; previousStatus: BookingStatus };
  "booking.cancelled": {
    bookingId: string;
    previousStatus: BookingStatus;
    cancelledBy: "guest" | "staff" | "system";
  };
  "booking.modified": {
    bookingId: string;
    changes: string[];
    /** Staff chose not to tell the guest about the change. */
    notifyGuest?: boolean;
  };
  "booking.seated": { bookingId: string };
  "booking.completed": { bookingId: string };
  "booking.no_show": { bookingId: string };
  "team.invitation_created": {
    invitationId: string;
    organizationId: string;
    email: string;
    role: string;
  };
  "waitlist.joined": {
    entryId: string;
    serviceDate: string;
    partySize: number;
    source: BookingSource;
  };
  "waitlist.offered": { entryId: string; startsAt: string; expiresAt: string };
  "waitlist.booked": { entryId: string; bookingId: string };
  "waitlist.expired": { entryId: string; serviceDate: string };
  "waitlist.cancelled": {
    entryId: string;
    serviceDate: string;
    previousStatus: WaitlistStatus;
    cancelledBy: "guest" | "staff";
  };
  /** A deposit was paid or a card saved; the booking is confirmed by the same handler. */
  "payment.completed": { bookingId: string; paymentId: string; kind: "deposit" | "card_hold" };
  "payment.refunded": { bookingId: string; paymentId: string; amountCents: number };
  "payment.charged": {
    bookingId: string;
    paymentId: string;
    amountCents: number;
    succeeded: boolean;
  };
  /** The guest never paid: the booking was cancelled. */
  "payment.expired": { bookingId: string; paymentId: string };
  /** Time to ask the guest how it went. */
  "feedback.requested": { bookingId: string };
  "feedback.received": { bookingId: string; feedbackId: string; rating: number };
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
  "waitlist.joined",
  "waitlist.offered",
  "waitlist.booked",
  "waitlist.expired",
  "waitlist.cancelled",
  "payment.completed",
  "payment.refunded",
  "payment.charged",
  "payment.expired",
  "feedback.requested",
  "feedback.received",
] as const satisfies readonly DomainEventType[];

export function isDomainEventType(value: string): value is DomainEventType {
  return (DOMAIN_EVENT_TYPES as readonly string[]).includes(value);
}
