import {
  isLocalTime,
  type LocalDate,
  MINUTES_PER_DAY,
  parseLocalTime,
  WEEKDAYS,
  type Weekday,
  weekdayOf,
} from "../time/local.js";
import type { ScheduleExceptionDef, TimeWindow, WeeklyHours } from "./types.js";
import { exceptionForService } from "./windows.js";

/** The earliest opening in minutes from midnight; null without a readable one. */
function firstStart(windows: readonly TimeWindow[]): number | null {
  let first: number | null = null;
  for (const w of windows) {
    // a malformed stored time must not break every list of services
    if (!isLocalTime(w.start)) continue;
    const at = parseLocalTime(w.start);
    if (first === null || at < first) first = at;
  }
  return first;
}

/** When the service opens on that weekday, in minutes from midnight; null when it is closed or the hours are unreadable. */
export function startOnWeekday(weeklyHours: WeeklyHours, weekday: Weekday): number | null {
  return firstStart(weeklyHours[weekday] ?? []);
}

/** The opening time the service has on most days (the earlier one on a tie); null without hours. */
export function usualStartMinutes(weeklyHours: WeeklyHours): number | null {
  const days = new Map<number, number>();
  for (const day of WEEKDAYS) {
    const at = startOnWeekday(weeklyHours, day);
    if (at !== null) days.set(at, (days.get(at) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestDays = 0;
  for (const [at, count] of days) {
    if (count > bestDays || (count === bestDays && best !== null && at < best)) {
      best = at;
      bestDays = count;
    }
  }
  return best;
}

interface OrderedService {
  id: string;
  name: string;
  weeklyHours: WeeklyHours;
  sortOrder: number;
}

/** When the service opens on that date, special hours included; null when it is closed. */
function startOnDate(
  s: OrderedService,
  date: LocalDate,
  exceptions: ScheduleExceptionDef[],
): number | null {
  const exception = exceptionForService(s.id, date, exceptions);
  if (exception?.closed) return null;
  if (exception?.windows && exception.windows.length > 0) return firstStart(exception.windows);
  return startOnWeekday(s.weeklyHours, weekdayOf(date));
}

/**
 * Services in the order of the day (lunch before aperitivo before dinner), then by sort
 * order and name. With a day, that day's hours decide; otherwise the usual hours.
 * Services without hours go last.
 */
export function sortServices<T extends OrderedService>(
  services: readonly T[],
  day?: { date: LocalDate; exceptions: ScheduleExceptionDef[] },
): T[] {
  const keyed = services.map((s) => {
    const usual = usualStartMinutes(s.weeklyHours);
    const start = day ? (startOnDate(s, day.date, day.exceptions) ?? usual) : usual;
    return { s, start: start ?? Number.POSITIVE_INFINITY };
  });
  keyed.sort((a, b) => {
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.s.sortOrder - b.s.sortOrder || a.s.name.localeCompare(b.s.name);
  });
  return keyed.map((k) => k.s);
}

/** Minutes from a time to a window (0 inside it), also counting past midnight. */
function distanceToWindow(minutes: number, w: TimeWindow): number {
  if (!isLocalTime(w.start) || !isLocalTime(w.end)) return Number.POSITIVE_INFINITY;
  const start = parseLocalTime(w.start);
  let end = parseLocalTime(w.end);
  if (end < start) end += MINUTES_PER_DAY;
  return Math.min(
    ...[minutes, minutes + MINUTES_PER_DAY].map((t) => Math.max(start - t, t - end, 0)),
  );
}

/**
 * The service a time on that weekday belongs to: the one open then, else the nearest
 * opening, the first in the list on a tie. Without any hours that day, the first.
 */
export function serviceAtTime<T extends OrderedService>(
  services: readonly T[],
  weekday: Weekday,
  minutes: number,
): T | undefined {
  const distance = (s: T) =>
    Math.min(
      Number.POSITIVE_INFINITY,
      ...(s.weeklyHours[weekday] ?? []).map((w) => distanceToWindow(minutes, w)),
    );
  let best = services[0];
  for (const s of services) if (best && distance(s) < distance(best)) best = s;
  return best;
}
