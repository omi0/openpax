/**
 * Local (wall-clock) date and time helpers. These are timezone-agnostic:
 * a LocalDate is a calendar day and a LocalTime is a wall-clock time in the
 * restaurant's own timezone. Conversion to instants lives in ./zoned.ts.
 */

/** Calendar date in ISO form, e.g. "2026-03-29". */
export type LocalDate = string;
/** Wall-clock time in 24h "HH:mm" form, e.g. "19:30". */
export type LocalTime = string;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const MINUTES_PER_DAY = 1440;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const { year, month, day } = localDateParts(value);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === "string" && TIME_RE.test(value);
}

export function localDateParts(date: LocalDate): { year: number; month: number; day: number } {
  const [y, m, d] = date.split("-");
  return { year: Number(y), month: Number(m), day: Number(d) };
}

export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "19:30" -> 1170 (minutes since midnight). */
export function parseLocalTime(time: LocalTime): number {
  if (!isLocalTime(time)) throw new RangeError(`Invalid local time: ${time}`);
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/** 1170 -> "19:30". Values outside a day wrap around (1500 -> "01:00"). */
export function formatMinutesOfDay(minutes: number): LocalTime {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function toUtcMidnight(date: LocalDate): Date {
  const { year, month, day } = localDateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDaysToLocalDate(date: LocalDate, days: number): LocalDate {
  const d = toUtcMidnight(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function weekdayOf(date: LocalDate): Weekday {
  const jsDay = toUtcMidnight(date).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(jsDay + 6) % 7] as Weekday;
}

/** Whole days from `a` to `b` (positive when b is after a). */
export function diffLocalDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMidnight(b).getTime() - toUtcMidnight(a).getTime()) / 86_400_000);
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
