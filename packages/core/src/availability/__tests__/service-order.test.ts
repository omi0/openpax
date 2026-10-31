import { describe, expect, it } from "vitest";
import { compareServices, firstStartMinutes } from "../service-order.js";
import type { WeeklyHours } from "../types.js";

const hours = (start: string, end: string): WeeklyHours => ({
  fri: [{ start, end }],
  sat: [{ start, end }],
});

describe("compareServices", () => {
  it("orders services by the time they open, not by name", () => {
    const services = [
      { name: "Cena", weeklyHours: hours("19:00", "23:00"), sortOrder: 0 },
      { name: "Aperitivo", weeklyHours: hours("18:00", "19:00"), sortOrder: 0 },
      { name: "Pranzo", weeklyHours: hours("12:00", "15:00"), sortOrder: 0 },
    ];
    expect(services.sort(compareServices).map((s) => s.name)).toEqual([
      "Pranzo",
      "Aperitivo",
      "Cena",
    ]);
  });

  it("takes the earliest opening of the week and puts services without hours last", () => {
    const brunch = {
      name: "Brunch",
      weeklyHours: { sun: [{ start: "11:00", end: "14:00" }] },
      sortOrder: 0,
    };
    const lunch = { name: "Lunch", weeklyHours: hours("12:00", "15:00"), sortOrder: 0 };
    const empty = { name: "Events", weeklyHours: {}, sortOrder: 0 };
    expect(firstStartMinutes(brunch.weeklyHours)).toBe(660);
    expect([empty, lunch, brunch].sort(compareServices).map((s) => s.name)).toEqual([
      "Brunch",
      "Lunch",
      "Events",
    ]);
  });
});
