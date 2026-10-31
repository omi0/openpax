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

/** Does an exception (a single day or a range of days) cover `date`? */
export function exceptionCoversDate(
  exception: Pick<ScheduleExceptionDef, "date" | "endDate">,
  date: LocalDate,
): boolean {
  return exception.date <= date && date <= (exception.endDate ?? exception.date);
}

/**
 * The exception that decides a service's day: service-specific before
 * restaurant-wide; among overlapping ones the one that starts last wins.
 */
export function exceptionForService(
  serviceId: string,
  date: LocalDate,
  exceptions: ScheduleExceptionDef[],
): ScheduleExceptionDef | undefined {
  const forDay = exceptions
    .filter((e) => exceptionCoversDate(e, date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return forDay.find((e) => e.serviceId === serviceId) ?? forDay.find((e) => e.serviceId === null);
}

/**
 * Opening windows of a service on a date. Precedence:
 * service-specific exception > restaurant-wide exception > weekly hours.
 * Among overlapping exceptions the one that starts last wins, so a single
 * day inside a longer closure can still be reopened with special hours.
 */
export function resolveServiceWindows(
  service: ServiceDef,
  date: LocalDate,
  exceptions: ScheduleExceptionDef[],
): { closed: boolean; windows: ResolvedWindow[] } {
  const exception = exceptionForService(service.id, date, exceptions);

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
