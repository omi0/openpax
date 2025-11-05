import { TZDate } from "@date-fns/tz";
import {
  addDaysToLocalDate,
  formatLocalDate,
  type LocalDate,
  localDateParts,
  MINUTES_PER_DAY,
} from "./local.js";

/**
 * The only place in the domain core that converts between wall-clock time in
 * a restaurant's timezone and absolute instants. Everything else works in
 * minutes-of-day and calls these two functions at the boundary.
 */

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wall-clock `date` + `minutesOfDay` in `timeZone` -> instant.
 * `minutesOfDay` may exceed 1440 to express times after midnight that still
 * belong to the given service date (e.g. 1500 = 01:00 the next morning).
 * Non-existent wall times (DST spring-forward gap) resolve forward.
 */
export function localToInstant(date: LocalDate, minutesOfDay: number, timeZone: string): Date {
  const dayOffset = Math.floor(minutesOfDay / MINUTES_PER_DAY);
  const minutes = minutesOfDay - dayOffset * MINUTES_PER_DAY;
  const day = dayOffset === 0 ? date : addDaysToLocalDate(date, dayOffset);
  const { year, month, day: d } = localDateParts(day);
  const zoned = new TZDate(year, month - 1, d, Math.floor(minutes / 60), minutes % 60, timeZone);
  return new Date(zoned.getTime());
}

/** Instant -> wall-clock date and minutes-of-day in `timeZone`. */
export function instantToLocal(
  instant: Date,
  timeZone: string,
): { date: LocalDate; minutesOfDay: number } {
  const zoned = new TZDate(instant.getTime(), timeZone);
  return {
    date: formatLocalDate(zoned.getFullYear(), zoned.getMonth() + 1, zoned.getDate()),
    minutesOfDay: zoned.getHours() * 60 + zoned.getMinutes(),
  };
}

export function todayIn(timeZone: string, now: Date): LocalDate {
  return instantToLocal(now, timeZone).date;
}
