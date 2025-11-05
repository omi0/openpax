import { describe, expect, it } from "vitest";
import {
  addDaysToLocalDate,
  diffLocalDays,
  formatMinutesOfDay,
  isLocalDate,
  isLocalTime,
  parseLocalTime,
  weekdayOf,
} from "../local.js";

describe("local date/time helpers", () => {
  it("validates calendar dates", () => {
    expect(isLocalDate("2026-06-12")).toBe(true);
    expect(isLocalDate("2024-02-29")).toBe(true);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("2026-6-1")).toBe(false);
    expect(isLocalDate(20260612)).toBe(false);
  });

  it("validates wall-clock times", () => {
    expect(isLocalTime("00:00")).toBe(true);
    expect(isLocalTime("23:59")).toBe(true);
    expect(isLocalTime("24:00")).toBe(false);
    expect(isLocalTime("9:30")).toBe(false);
  });

  it("parses and formats minutes of day, wrapping past midnight", () => {
    expect(parseLocalTime("19:30")).toBe(1170);
    expect(formatMinutesOfDay(1170)).toBe("19:30");
    expect(formatMinutesOfDay(1500)).toBe("01:00");
    expect(formatMinutesOfDay(0)).toBe("00:00");
    expect(() => parseLocalTime("25:00")).toThrow(RangeError);
  });

  it("computes weekdays and day arithmetic", () => {
    expect(weekdayOf("2026-06-12")).toBe("fri");
    expect(weekdayOf("2026-03-29")).toBe("sun");
    expect(weekdayOf("2026-01-01")).toBe("thu");
    expect(addDaysToLocalDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToLocalDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToLocalDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffLocalDays("2026-06-10", "2026-06-12")).toBe(2);
    expect(diffLocalDays("2026-06-12", "2026-06-10")).toBe(-2);
  });
});
