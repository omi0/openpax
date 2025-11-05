import { compareLocalDates, diffLocalDays, type LocalDate } from "../time/local.js";
import { todayIn } from "../time/zoned.js";
import type { BookingPolicyDef, ServiceDef, UnavailableReason } from "./types.js";

export function checkDatePolicy(
  date: LocalDate,
  now: Date,
  timeZone: string,
  policy: BookingPolicyDef,
): UnavailableReason | null {
  const today = todayIn(timeZone, now);
  if (compareLocalDates(date, today) < 0) return "in_past";
  if (diffLocalDays(today, date) > policy.maxAdvanceDays) return "too_far_ahead";
  return null;
}

export function checkPartyPolicy(
  partySize: number,
  policy: BookingPolicyDef,
): UnavailableReason | null {
  if (!Number.isInteger(partySize) || partySize < 1) return "party_too_small";
  if (partySize < policy.minPartySize) return "party_too_small";
  if (partySize > policy.maxPartySize) return "party_too_large";
  return null;
}

export function checkServiceParty(
  partySize: number,
  service: ServiceDef,
): UnavailableReason | null {
  const min = service.minPartySize ?? null;
  const max = service.maxPartySize ?? null;
  if (min !== null && partySize < min) return "party_too_small";
  if (max !== null && partySize > max) return "party_too_large";
  return null;
}

export function checkSlotTiming(
  startsAt: Date,
  now: Date,
  policy: BookingPolicyDef,
): UnavailableReason | null {
  const lead = startsAt.getTime() - now.getTime();
  if (lead <= 0) return "in_past";
  if (lead < policy.minLeadMinutes * 60_000) return "outside_lead_time";
  return null;
}
