import { type LocalDate, MINUTES_PER_DAY, parseLocalTime, type Weekday } from "../time/local.js";
import type { CandidateSlot } from "./slots.js";
import type { BookingLoad, CapacityRuleDef, ServiceDef, UnavailableReason } from "./types.js";

export interface SlotContext {
  serviceId: string;
  areaId: string | null;
  date: LocalDate;
  weekday: Weekday;
  /** Minutes from midnight of the service date (may exceed 1440). */
  startMin: number;
}

/** Does a capacity rule apply to a slot? */
export function ruleAppliesToSlot(rule: CapacityRuleDef, ctx: SlotContext): boolean {
  if (rule.serviceId !== null && rule.serviceId !== ctx.serviceId) return false;
  if (rule.areaId !== null && rule.areaId !== ctx.areaId) return false;
  if (rule.date !== null && rule.date !== ctx.date) return false;
  if (rule.weekday !== null && rule.weekday !== ctx.weekday) return false;
  if (rule.startTime !== null || rule.endTime !== null) {
    const start = rule.startTime !== null ? parseLocalTime(rule.startTime) : 0;
    const end = rule.endTime !== null ? parseLocalTime(rule.endTime) : MINUTES_PER_DAY;
    const wall = ctx.startMin % MINUTES_PER_DAY;
    const inWindow = end <= start ? wall >= start || wall < end : wall >= start && wall < end;
    if (!inWindow) return false;
  }
  return true;
}

/** Which existing bookings count against a rule. */
function bookingInRuleScope(rule: CapacityRuleDef, booking: BookingLoad): boolean {
  if (rule.serviceId !== null && rule.serviceId !== booking.serviceId) return false;
  if (rule.areaId !== null && rule.areaId !== booking.areaId) return false;
  return true;
}

export interface PeakLoad {
  covers: number;
  bookings: number;
}

/**
 * Highest number of covers/parties seated at the same moment during
 * [startsAt, endsAt), considering only bookings accepted by `filter`.
 * The peak can only change at a booking start, so those are the sample points.
 */
export function peakLoad(
  bookings: BookingLoad[],
  startsAt: Date,
  endsAt: Date,
  filter: (b: BookingLoad) => boolean = () => true,
): PeakLoad {
  const s = startsAt.getTime();
  const e = endsAt.getTime();
  const overlapping = bookings.filter(
    (b) => filter(b) && b.startsAt.getTime() < e && b.endsAt.getTime() > s,
  );
  if (overlapping.length === 0) return { covers: 0, bookings: 0 };

  const points = new Set<number>([s]);
  for (const b of overlapping) {
    const t = b.startsAt.getTime();
    if (t > s && t < e) points.add(t);
  }

  let peak: PeakLoad = { covers: 0, bookings: 0 };
  for (const t of points) {
    let covers = 0;
    let count = 0;
    for (const b of overlapping) {
      if (b.startsAt.getTime() <= t && b.endsAt.getTime() > t) {
        covers += b.partySize;
        count += 1;
      }
    }
    if (covers > peak.covers || (covers === peak.covers && count > peak.bookings)) {
      peak = { covers, bookings: count };
    }
  }
  return peak;
}

/** Covers/parties of `serviceId` whose booking starts within one slot interval of `startsAt`. */
export function arrivalsInSlot(
  bookings: BookingLoad[],
  serviceId: string,
  startsAt: Date,
  intervalMinutes: number,
): PeakLoad {
  const s = startsAt.getTime();
  const e = s + intervalMinutes * 60_000;
  let covers = 0;
  let count = 0;
  for (const b of bookings) {
    const t = b.startsAt.getTime();
    if (b.serviceId === serviceId && t >= s && t < e) {
      covers += b.partySize;
      count += 1;
    }
  }
  return { covers, bookings: count };
}

export interface CapacityVerdict {
  ok: boolean;
  reason?: Extract<UnavailableReason, "full" | "party_too_large">;
  /** Tightest remaining covers across all applicable limits; null = unlimited. */
  remainingCovers: number | null;
}

function tighten(current: number | null, next: number): number {
  return current === null ? next : Math.min(current, next);
}

/** Apply service pacing limits and every matching capacity rule to a candidate slot. */
export function evaluateCapacity(
  slot: CandidateSlot,
  service: ServiceDef,
  rules: CapacityRuleDef[],
  bookings: BookingLoad[],
  partySize: number,
  ctx: SlotContext,
): CapacityVerdict {
  let remaining: number | null = null;
  let full = false;

  if (service.maxCoversPerSlot !== null || (service.maxBookingsPerSlot ?? null) !== null) {
    const arrivals = arrivalsInSlot(bookings, service.id, slot.startsAt, service.slotIntervalMinutes);
    if (service.maxCoversPerSlot !== null) {
      const left = Math.max(0, service.maxCoversPerSlot - arrivals.covers);
      remaining = tighten(remaining, left);
      if (partySize > left) full = true;
    }
    const maxBookings = service.maxBookingsPerSlot ?? null;
    if (maxBookings !== null && arrivals.bookings + 1 > maxBookings) {
      remaining = tighten(remaining, 0);
      full = true;
    }
  }

  for (const rule of rules) {
    if (!ruleAppliesToSlot(rule, ctx)) continue;
    if (rule.maxPartySize !== null && partySize > rule.maxPartySize) {
      return { ok: false, reason: "party_too_large", remainingCovers: remaining };
    }
    if (rule.maxCovers !== null || rule.maxBookings !== null) {
      const peak = peakLoad(bookings, slot.startsAt, slot.endsAt, (b) =>
        bookingInRuleScope(rule, b),
      );
      if (rule.maxCovers !== null) {
        const left = Math.max(0, rule.maxCovers - peak.covers);
        remaining = tighten(remaining, left);
        if (partySize > left) full = true;
      }
      if (rule.maxBookings !== null && peak.bookings + 1 > rule.maxBookings) {
        remaining = tighten(remaining, 0);
        full = true;
      }
    }
  }

  return full ? { ok: false, reason: "full", remainingCovers: remaining } : { ok: true, remainingCovers: remaining };
}
