import { describe, expect, it } from "vitest";
import { resolveServiceWindows, windowToMinutes } from "../windows.js";
import { dinner, FRIDAY, lunch } from "./fixtures.js";

describe("resolveServiceWindows", () => {
  it("uses weekly hours by default", () => {
    expect(resolveServiceWindows(dinner, FRIDAY, [])).toEqual({
      closed: false,
      windows: [{ startMin: 1140, endMin: 1320 }],
    });
  });

  it("is closed when the weekday has no hours", () => {
    expect(resolveServiceWindows(lunch, "2026-06-14", [])).toEqual({ closed: true, windows: [] });
  });

  it("closes for a restaurant-wide exception", () => {
    const ex = [{ serviceId: null, date: FRIDAY, closed: true, windows: null }];
    expect(resolveServiceWindows(dinner, FRIDAY, ex).closed).toBe(true);
    expect(resolveServiceWindows(dinner, "2026-06-13", ex).closed).toBe(false);
  });

  it("lets a service-specific exception beat a restaurant-wide one", () => {
    const ex = [
      { serviceId: null, date: FRIDAY, closed: true, windows: null },
      {
        serviceId: "dinner",
        date: FRIDAY,
        closed: false,
        windows: [{ start: "20:00", end: "21:00" }],
      },
    ];
    expect(resolveServiceWindows(dinner, FRIDAY, ex)).toEqual({
      closed: false,
      windows: [{ startMin: 1200, endMin: 1260 }],
    });
    expect(resolveServiceWindows(lunch, FRIDAY, ex).closed).toBe(true);
  });

  it("falls back to weekly hours for an open exception without windows", () => {
    const ex = [{ serviceId: null, date: FRIDAY, closed: false, windows: null }];
    expect(resolveServiceWindows(dinner, FRIDAY, ex).windows).toEqual([
      { startMin: 1140, endMin: 1320 },
    ]);
  });

  it("extends windows that cross midnight", () => {
    expect(windowToMinutes({ start: "22:00", end: "01:00" })).toEqual({
      startMin: 1320,
      endMin: 1500,
    });
  });
});
