import { type LocalDate, MINUTES_PER_DAY, parseLocalTime, weekdayOf } from "../time/local.js";
import type { ScheduleExceptionDef, ServiceDef, TimeWindow } from "./types.js";

/** A window in minutes from midnight of the service date; endMin may exceed 1440. */
export interface ResolvedWindow {
  startMin: number;
  endMin: number;
}

export function windowToMinutes(window: TimeWindow): ResolvedWindow {
  const startMin = parseLocalTime(window.start);
  let endMin = parseLocalTime(window.end);
  if (endMin < startMin) endMin += MINUTES_PER_DAY;
  return { startMin, endMin };
}

/**
 * Opening windows of a service on a date. Precedence:
 * service-specific exception > restaurant-wide exception > weekly hours.
 */
export function resolveServiceWindows(
  service: ServiceDef,
  date: LocalDate,
  exceptions: ScheduleExceptionDef[],
): { closed: boolean; windows: ResolvedWindow[] } {
  const forDay = exceptions.filter((e) => e.date === date);
  const exception =
    forDay.find((e) => e.serviceId === service.id) ?? forDay.find((e) => e.serviceId === null);

  if (exception) {
    if (exception.closed) return { closed: true, windows: [] };
    if (exception.windows && exception.windows.length > 0) {
      return { closed: false, windows: exception.windows.map(windowToMinutes) };
    }
  }

  const weekly = service.weeklyHours[weekdayOf(date)] ?? [];
  if (weekly.length === 0) return { closed: true, windows: [] };
  return { closed: false, windows: weekly.map(windowToMinutes) };
}
