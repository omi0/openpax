import { DomainError } from "../errors.js";
import { formatMinutesOfDay, type LocalDate, type LocalTime } from "../time/local.js";
import { localToInstant } from "../time/zoned.js";
import type { ServiceDef } from "./types.js";
import type { ResolvedWindow } from "./windows.js";

export interface CandidateSlot {
  serviceId: string;
  startMin: number;
  endMin: number;
  startsAt: Date;
  endsAt: Date;
  startLocal: LocalTime;
}

/**
 * Enumerate every bookable arrival time of a service on a date.
 * Slots are keyed by instant: on a DST spring-forward day two wall-clock
 * times can resolve to the same instant, and the later (real) label wins.
 */
export function enumerateSlots(
  service: ServiceDef,
  windows: ResolvedWindow[],
  date: LocalDate,
  timeZone: string,
): CandidateSlot[] {
  if (!Number.isInteger(service.slotIntervalMinutes) || service.slotIntervalMinutes <= 0) {
    throw new DomainError("invalid_service", `Service ${service.id} has an invalid slot interval`);
  }
  if (!Number.isInteger(service.durationMinutes) || service.durationMinutes <= 0) {
    throw new DomainError("invalid_service", `Service ${service.id} has an invalid duration`);
  }

  const byInstant = new Map<number, CandidateSlot>();
  const sortedWindows = [...windows].sort((a, b) => a.startMin - b.startMin);
  for (const window of sortedWindows) {
    for (let t = window.startMin; t <= window.endMin; t += service.slotIntervalMinutes) {
      const endMin = t + service.durationMinutes;
      const startsAt = localToInstant(date, t, timeZone);
      byInstant.set(startsAt.getTime(), {
        serviceId: service.id,
        startMin: t,
        endMin,
        startsAt,
        endsAt: localToInstant(date, endMin, timeZone),
        startLocal: formatMinutesOfDay(t),
      });
    }
  }
  return [...byInstant.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
