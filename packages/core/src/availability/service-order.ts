import { isLocalTime, parseLocalTime, WEEKDAYS, type Weekday } from "../time/local.js";
import type { WeeklyHours } from "./types.js";

/** When the service opens on that weekday, in minutes from midnight; null when it is closed or the hours are unreadable. */
export function startOnWeekday(weeklyHours: WeeklyHours, weekday: Weekday): number | null {
  let first: number | null = null;
  for (const w of weeklyHours[weekday] ?? []) {
    // a malformed stored time must not break every list of services
    if (!isLocalTime(w.start)) continue;
    const at = parseLocalTime(w.start);
    if (first === null || at < first) first = at;
  }
  return first;
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
  name: string;
  weeklyHours: WeeklyHours;
  sortOrder: number;
}

/**
 * Services in the order of the day (lunch before aperitivo before dinner), then by sort
 * order and name. With a weekday, that day's hours decide; otherwise the usual hours.
 * Services without hours go last.
 */
export function sortServices<T extends OrderedService>(
  services: readonly T[],
  weekday?: Weekday,
): T[] {
  const keyed = services.map((s) => {
    const usual = usualStartMinutes(s.weeklyHours);
    const start = weekday ? (startOnWeekday(s.weeklyHours, weekday) ?? usual) : usual;
    return { s, start: start ?? Number.POSITIVE_INFINITY };
  });
  keyed.sort((a, b) => {
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.s.sortOrder - b.s.sortOrder || a.s.name.localeCompare(b.s.name);
  });
  return keyed.map((k) => k.s);
}
