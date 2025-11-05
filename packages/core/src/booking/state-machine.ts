import { DomainError } from "../errors.js";

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy capacity. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ["pending", "confirmed", "seated"];

export const BOOKING_ACTIONS = [
  "confirm",
  "seat",
  "complete",
  "cancel",
  "no_show",
  "reopen",
] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];

const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingAction, BookingStatus>>> = {
  pending: { confirm: "confirmed", cancel: "cancelled" },
  confirmed: { seat: "seated", cancel: "cancelled", no_show: "no_show" },
  seated: { complete: "completed", cancel: "cancelled" },
  completed: {},
  cancelled: { reopen: "confirmed" },
  no_show: { reopen: "confirmed" },
};

export class TransitionError extends DomainError {
  constructor(
    public readonly from: BookingStatus,
    public readonly action: BookingAction,
  ) {
    super("invalid_transition", `Cannot apply "${action}" to a booking in status "${from}"`);
  }
}

export function canTransition(from: BookingStatus, action: BookingAction): boolean {
  return TRANSITIONS[from][action] !== undefined;
}

export function transition(from: BookingStatus, action: BookingAction): BookingStatus {
  const to = TRANSITIONS[from][action];
  if (to === undefined) throw new TransitionError(from, action);
  return to;
}

export function isActiveStatus(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}
