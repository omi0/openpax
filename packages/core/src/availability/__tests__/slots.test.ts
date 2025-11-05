import { describe, expect, it } from "vitest";
import { enumerateSlots } from "../slots.js";
import { FRIDAY, TZ, dinner, late } from "./fixtures.js";

describe("enumerateSlots", () => {
  it("includes the last seating time and applies the duration", () => {
    const slots = enumerateSlots(dinner, [{ startMin: 1140, endMin: 1320 }], FRIDAY, TZ);
    expect(slots.map((s) => s.startLocal)).toEqual(["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"]);
    const last = slots.at(-1);
    expect(last?.startsAt.toISOString()).toBe("2026-06-12T20:00:00.000Z");
    expect(last?.endsAt.toISOString()).toBe("2026-06-12T22:00:00.000Z");
  });

  it("dedupes overlapping windows", () => {
    const slots = enumerateSlots(
      dinner,
      [
        { startMin: 1140, endMin: 1200 },
        { startMin: 1170, endMin: 1230 },
      ],
      FRIDAY,
      TZ,
    );
    expect(slots.map((s) => s.startLocal)).toEqual(["19:00", "19:30", "20:00", "20:30"]);
  });

  it("labels after-midnight slots and places them on the next calendar day", () => {
    const slots = enumerateSlots(late, [{ startMin: 1320, endMin: 1500 }], FRIDAY, TZ);
    expect(slots.map((s) => s.startLocal)).toEqual(["22:00", "22:30", "23:00", "23:30", "00:00", "00:30", "01:00"]);
    expect(slots.at(-1)?.startsAt.toISOString()).toBe("2026-06-12T23:00:00.000Z");
  });

  it("collapses wall-clock times that share an instant on spring-forward day", () => {
    const nightOwl = { ...late, weeklyHours: {}, slotIntervalMinutes: 30, durationMinutes: 30 };
    const slots = enumerateSlots(nightOwl, [{ startMin: 60, endMin: 240 }], "2026-03-29", TZ);
    const instants = slots.map((s) => s.startsAt.getTime());
    expect(new Set(instants).size).toBe(instants.length);
    // 02:00 and 02:30 do not exist; they collapse into 03:00 and 03:30
    expect(slots.map((s) => s.startLocal)).toEqual(["01:00", "01:30", "03:00", "03:30", "04:00"]);
    for (let i = 1; i < instants.length; i += 1) {
      expect((instants[i] ?? 0) > (instants[i - 1] ?? 0)).toBe(true);
    }
  });

  it("rejects invalid service configuration", () => {
    expect(() => enumerateSlots({ ...dinner, slotIntervalMinutes: 0 }, [], FRIDAY, TZ)).toThrow(/slot interval/);
    expect(() => enumerateSlots({ ...dinner, durationMinutes: -5 }, [], FRIDAY, TZ)).toThrow(/duration/);
  });
});
