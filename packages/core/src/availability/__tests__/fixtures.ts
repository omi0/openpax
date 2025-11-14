import { type LocalDate, type LocalTime, parseLocalTime } from "../../time/local.js";
import { localToInstant } from "../../time/zoned.js";
import type {
  AvailabilityInput,
  BookingLoad,
  BookingPolicyDef,
  ServiceDef,
  TimeWindow,
  WeeklyHours,
} from "../types.js";

export const TZ = "Europe/Rome";

export function everyDay(windows: TimeWindow[]): WeeklyHours {
  return {
    mon: windows,
    tue: windows,
    wed: windows,
    thu: windows,
    fri: windows,
    sat: windows,
    sun: windows,
  };
}

export const lunch: ServiceDef = {
  id: "lunch",
  weeklyHours: { ...everyDay([{ start: "12:00", end: "14:00" }]), sun: [] },
  slotIntervalMinutes: 30,
  durationMinutes: 90,
  maxCoversPerSlot: null,
};

export const dinner: ServiceDef = {
  id: "dinner",
  weeklyHours: everyDay([{ start: "19:00", end: "22:00" }]),
  slotIntervalMinutes: 30,
  durationMinutes: 120,
  maxCoversPerSlot: 20,
};

export const late: ServiceDef = {
  id: "late",
  weeklyHours: everyDay([{ start: "22:00", end: "01:00" }]),
  slotIntervalMinutes: 30,
  durationMinutes: 60,
  maxCoversPerSlot: null,
};

export const policy: BookingPolicyDef = {
  minLeadMinutes: 60,
  maxAdvanceDays: 60,
  minPartySize: 1,
  maxPartySize: 12,
};

/** Friday. */
export const FRIDAY: LocalDate = "2026-06-12";

export function at(date: LocalDate, time: LocalTime, tz = TZ): Date {
  return localToInstant(date, parseLocalTime(time), tz);
}

export function booking(
  serviceId: string,
  date: LocalDate,
  time: LocalTime,
  partySize: number,
  durationMinutes: number,
  areaId: string | null = null,
  tz = TZ,
): BookingLoad {
  const start = parseLocalTime(time);
  return {
    serviceId,
    areaId,
    partySize,
    startsAt: localToInstant(date, start, tz),
    endsAt: localToInstant(date, start + durationMinutes, tz),
  };
}

export function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: TZ,
    date: FRIDAY,
    partySize: 2,
    now: at("2026-06-10", "10:00"),
    services: [lunch, dinner],
    exceptions: [],
    capacityRules: [],
    policy,
    existingBookings: [],
    ...overrides,
  };
}
