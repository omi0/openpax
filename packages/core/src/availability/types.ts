import type { TableDef, TableLoad } from "../tables/tables.js";
import type { LocalDate, LocalTime, Weekday } from "../time/local.js";

/**
 * A bookable arrival window. `start` and `end` are the FIRST and LAST
 * bookable arrival times, both inclusive (e.g. 19:00–22:00 offers 22:00).
 * When `end` is earlier than `start` the window crosses midnight
 * (e.g. 22:00–01:00); those late slots still belong to the same service date.
 */
export interface TimeWindow {
  start: LocalTime;
  end: LocalTime;
}

export type WeeklyHours = Partial<Record<Weekday, TimeWindow[]>>;

export interface ServiceDef {
  id: string;
  name?: string;
  active?: boolean;
  weeklyHours: WeeklyHours;
  /** Distance between bookable arrival times, in minutes (e.g. 15 or 30). */
  slotIntervalMinutes: number;
  /** How long a table is considered occupied from arrival, in minutes. */
  durationMinutes: number;
  /** Pacing limit: max covers whose booking STARTS within one slot interval. */
  maxCoversPerSlot: number | null;
  /** Pacing limit: max parties whose booking STARTS within one slot interval. */
  maxBookingsPerSlot?: number | null;
  minPartySize?: number | null;
  maxPartySize?: number | null;
}

export interface ScheduleExceptionDef {
  /** null = applies to every service of the restaurant that day. */
  serviceId: string | null;
  date: LocalDate;
  closed: boolean;
  /** When set (and not closed) these windows replace the weekly hours for that day. */
  windows: TimeWindow[] | null;
}

/**
 * Capacity rules constrain how many covers/parties may be seated CONCURRENTLY
 * (overlapping in time) within their scope. Every field that is null widens
 * the scope; all rules matching a slot apply and the most restrictive wins.
 */
export interface CapacityRuleDef {
  id?: string;
  serviceId: string | null;
  areaId: string | null;
  weekday: Weekday | null;
  date: LocalDate | null;
  /** Wall-clock window in which the SLOT START must fall for the rule to apply. */
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  maxCovers: number | null;
  maxBookings: number | null;
  maxPartySize: number | null;
}

export interface BookingPolicyDef {
  /** Minimum minutes between "now" and the arrival time. */
  minLeadMinutes: number;
  /** How many days ahead guests may book (0 = today only). */
  maxAdvanceDays: number;
  minPartySize: number;
  maxPartySize: number;
}

/** An existing booking that occupies capacity (active statuses only). */
export interface BookingLoad {
  serviceId: string;
  areaId: string | null;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
}

export interface AvailabilityInput {
  /** Tables of the restaurant; when non-empty a slot also needs a free table (or pair) for the party. */
  tables?: TableDef[];
  /** Tables taken by active bookings. */
  tableLoads?: TableLoad[];
  /** IANA timezone of the restaurant, e.g. "Europe/Rome". */
  timezone: string;
  /** Service date being queried, in the restaurant's timezone. */
  date: LocalDate;
  partySize: number;
  /** Injected clock; never read Date.now() inside the engine. */
  now: Date;
  /** Requested area, if the guest picked one (null = no preference). */
  areaId?: string | null;
  services: ServiceDef[];
  exceptions: ScheduleExceptionDef[];
  capacityRules: CapacityRuleDef[];
  policy: BookingPolicyDef;
  existingBookings: BookingLoad[];
}

export type UnavailableReason =
  | "closed"
  | "no_service"
  | "in_past"
  | "outside_lead_time"
  | "too_far_ahead"
  | "party_too_small"
  | "party_too_large"
  | "full"
  | "no_table"
  | "not_a_slot";

export interface Slot {
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  /** Wall-clock arrival time, e.g. "19:30" (after-midnight slots read "00:30"). */
  startLocal: LocalTime;
  /** Covers still bookable at this time under the tightest applicable limit; null = unlimited. */
  remainingCovers: number | null;
  available: boolean;
  reason?: UnavailableReason;
}

export interface AvailabilityResult {
  date: LocalDate;
  /** True when no active service is open on that date. */
  closed: boolean;
  /** Date- or party-level reasons that make every slot unavailable. */
  reasons: UnavailableReason[];
  /** Every candidate slot of every open service, sorted by time, including unavailable ones. */
  slots: Slot[];
}

export interface SlotRequest {
  serviceId: string;
  startsAt: Date;
  partySize?: number;
}

export type BookabilityVerdict =
  | { ok: true; slot: Slot; endsAt: Date }
  | { ok: false; reason: UnavailableReason };
