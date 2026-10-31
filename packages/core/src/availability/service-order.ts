import { parseLocalTime } from "../time/local.js";
import type { WeeklyHours } from "./types.js";

/** Earliest opening of the week, in minutes from midnight; Infinity when the service has no hours. */
export function firstStartMinutes(weeklyHours: WeeklyHours): number {
  let first = Number.POSITIVE_INFINITY;
  for (const windows of Object.values(weeklyHours)) {
    for (const w of windows ?? []) first = Math.min(first, parseLocalTime(w.start));
  }
  return first;
}

interface OrderedService {
  name: string;
  weeklyHours: WeeklyHours;
  sortOrder: number;
}

/** Services in the order of the day (lunch before aperitivo before dinner), then by sort order and name. */
export function compareServices(a: OrderedService, b: OrderedService): number {
  const byStart = firstStartMinutes(a.weeklyHours) - firstStartMinutes(b.weeklyHours);
  if (byStart !== 0 && !Number.isNaN(byStart)) return byStart;
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}
