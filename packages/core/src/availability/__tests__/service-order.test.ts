import { describe, expect, it } from "vitest";
import type { LocalTime } from "../../time/local.js";
import { serviceAtTime, sortServices, usualStartMinutes } from "../service-order.js";
import type { WeeklyHours } from "../types.js";

const days = (start: string, end: string, on = ["mon", "tue", "wed", "thu", "fri", "sat"]) =>
  Object.fromEntries(
    on.map((d) => [d, [{ start: start as LocalTime, end: end as LocalTime }]]),
  ) as WeeklyHours;
const SUNDAY = "2026-11-01";
const names = (list: Array<{ name: string }>) => list.map((s) => s.name);

describe("sortServices", () => {
  it("orders services by the time they open, not by name", () => {
    const services = [
      { id: "x", name: "Cena", weeklyHours: days("19:00", "23:00"), sortOrder: 0 },
      { id: "x", name: "Aperitivo", weeklyHours: days("18:00", "19:00"), sortOrder: 0 },
      { id: "x", name: "Pranzo", weeklyHours: days("12:00", "15:00"), sortOrder: 0 },
    ];
    expect(names(sortServices(services))).toEqual(["Pranzo", "Aperitivo", "Cena"]);
  });

  it("uses the usual opening, so one early day does not move a service everywhere", () => {
    const cena = {
      id: "cena",
      name: "Cena",
      weeklyHours: {
        ...days("19:30", "23:00"),
        sun: [{ start: "17:30", end: "22:00" }],
      } as WeeklyHours,
      sortOrder: 0,
    };
    const aperitivo = {
      id: "x",
      name: "Aperitivo",
      weeklyHours: days("18:30", "19:30"),
      sortOrder: 0,
    };
    expect(usualStartMinutes(cena.weeklyHours)).toBe(19 * 60 + 30);
    expect(names(sortServices([cena, aperitivo]))).toEqual(["Aperitivo", "Cena"]);
    // on Sunday that day's hours decide (Aperitivo is closed: it keeps its usual time)
    expect(names(sortServices([aperitivo, cena], { date: SUNDAY, exceptions: [] }))).toEqual([
      "Cena",
      "Aperitivo",
    ]);
  });

  it("lets special hours of that day decide, and a closed service keeps its usual time", () => {
    const cena = { id: "cena", name: "Cena", weeklyHours: days("19:00", "23:00"), sortOrder: 0 };
    const aperitivo = {
      id: "aperitivo",
      name: "Aperitivo",
      weeklyHours: days("18:00", "19:00"),
      sortOrder: 0,
    };
    const date = "2026-12-31";
    const special = {
      serviceId: "cena",
      date,
      closed: false,
      windows: [{ start: "17:00", end: "23:00" }],
    };
    expect(names(sortServices([aperitivo, cena], { date, exceptions: [special] }))).toEqual([
      "Cena",
      "Aperitivo",
    ]);
    const closed = { serviceId: "aperitivo", date, closed: true, windows: null };
    expect(names(sortServices([cena, aperitivo], { date, exceptions: [closed] }))).toEqual([
      "Aperitivo",
      "Cena",
    ]);
  });

  it("puts services without hours last and skips unreadable times instead of throwing", () => {
    const broken = {
      id: "brunch",
      name: "Brunch",
      weeklyHours: { sun: [{ start: "25:99", end: "14:00" }] } as unknown as WeeklyHours,
      sortOrder: 0,
    };
    const lunch = { id: "x", name: "Pranzo", weeklyHours: days("12:00", "15:00"), sortOrder: 0 };
    const empty = { id: "x", name: "Eventi", weeklyHours: {}, sortOrder: 0 };
    expect(names(sortServices([empty, broken, lunch]))).toEqual(["Pranzo", "Brunch", "Eventi"]);
  });
});

describe("serviceAtTime", () => {
  const lunch = { id: "l", name: "Pranzo", weeklyHours: days("12:00", "15:00"), sortOrder: 0 };
  const dinner = { id: "d", name: "Cena", weeklyHours: days("19:00", "23:00"), sortOrder: 0 };

  it("picks the service open at that time, else the nearest", () => {
    expect(serviceAtTime([lunch, dinner], "mon", 20 * 60 + 30)?.name).toBe("Cena");
    expect(serviceAtTime([lunch, dinner], "mon", 13 * 60)?.name).toBe("Pranzo");
    expect(serviceAtTime([lunch, dinner], "mon", 18 * 60)?.name).toBe("Cena");
  });

  it("falls back to the first service on a day without hours", () => {
    expect(serviceAtTime([lunch, dinner], "sun", 20 * 60)?.name).toBe("Pranzo");
  });
});
