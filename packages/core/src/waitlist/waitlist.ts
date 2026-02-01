import type { Slot } from "../availability/types.js";
import { parseLocalTime } from "../time/local.js";

export const WAITLIST_STATUSES = ["waiting", "offered", "booked", "expired", "cancelled"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/** Entries that still want a table. */
export const OPEN_WAITLIST_STATUSES: readonly WaitlistStatus[] = ["waiting", "offered"];

export interface OfferPreference {
  /** Service the guest asked for, if any. */
  serviceId: string | null;
  /** Wall-clock time the guest asked for ("HH:mm"), if any. */
  preferredTime: string | null;
}

/**
 * Choose the slot to offer a waiting guest: an available one, in the
 * preferred service when possible, closest to the preferred time (earliest
 * otherwise). Returns null when nothing is available.
 */
export function pickOfferSlot(slots: readonly Slot[], pref: OfferPreference): Slot | null {
  const available = slots.filter((s) => s.available);
  if (available.length === 0) return null;
  const inService = pref.serviceId ? available.filter((s) => s.serviceId === pref.serviceId) : [];
  const pool = inService.length > 0 ? inService : available;
  if (!pref.preferredTime) return pool[0] ?? null;
  const wanted = parseLocalTime(pref.preferredTime);
  let best: Slot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of pool) {
    let minutes = parseLocalTime(slot.startLocal);
    // after-midnight slots belong to the evening before
    if (minutes < 6 * 60) minutes += 24 * 60;
    const distance = Math.abs(minutes - wanted);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}
