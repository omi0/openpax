import { describe, expect, it } from "vitest";
import type { LocalTime } from "../../time/local.js";
import { sortServices, usualStartMinutes } from "../service-order.js";
import type { WeeklyHours } from "../types.js";

const days = (start: string, end: string, on = ["mon", "tue", "wed", "thu", "fri", "sat"]) =>
  Object.fromEntries(
    on.map((d) => [d, [{ start: start as LocalTime, end: end as LocalTime }]]),
  ) as WeeklyHours;
const names = (list: Array<{ name: string }>) => list.map((s) => s.name);

describe("sortServices", () => {
  it("orders services by the time they open, not by name", () => {
    const services = [
      { name: "Cena", weeklyHours: days("19:00", "23:00"), sortOrder: 0 },
      { name: "Aperitivo", weeklyHours: days("18:00", "19:00"), sortOrder: 0 },
      { name: "Pranzo", weeklyHours: days("12:00", "15:00"), sortOrder: 0 },
    ];
    expect(names(sortServices(services))).toEqual(["Pranzo", "Aperitivo", "Cena"]);
  });

  it("uses the usual opening, so one early day does not move a service everywhere", () => {
    const cena = {
      name: "Cena",
      weeklyHours: {
        ...days("19:30", "23:00"),
        sun: [{ start: "17:30", end: "22:00" }],
      } as WeeklyHours,
      sortOrder: 0,
    };
    const aperitivo = { name: "Aperitivo", weeklyHours: days("18:30", "19:30"), sortOrder: 0 };
    expect(usualStartMinutes(cena.weeklyHours)).toBe(19 * 60 + 30);
    expect(names(sortServices([cena, aperitivo]))).toEqual(["Aperitivo", "Cena"]);
    // on Sunday that day's hours decide (Aperitivo is closed: it keeps its usual time)
    expect(names(sortServices([aperitivo, cena], "sun"))).toEqual(["Cena", "Aperitivo"]);
  });

  it("puts services without hours last and skips unreadable times instead of throwing", () => {
    const broken = {
      name: "Brunch",
      weeklyHours: { sun: [{ start: "25:99", end: "14:00" }] } as unknown as WeeklyHours,
      sortOrder: 0,
    };
    const lunch = { name: "Pranzo", weeklyHours: days("12:00", "15:00"), sortOrder: 0 };
    const empty = { name: "Eventi", weeklyHours: {}, sortOrder: 0 };
    expect(names(sortServices([empty, broken, lunch]))).toEqual(["Pranzo", "Brunch", "Eventi"]);
  });
});
