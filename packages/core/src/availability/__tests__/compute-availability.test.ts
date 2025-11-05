import { describe, expect, it } from "vitest";
import { DomainError } from "../../errors.js";
import { assertSlotBookable, computeAvailability } from "../compute-availability.js";
import { FRIDAY, TZ, at, baseInput, booking, dinner, everyDay, late, lunch } from "./fixtures.js";

describe("computeAvailability", () => {
  it("lists every slot of every open service, sorted by time", () => {
    const result = computeAvailability(baseInput());
    expect(result.closed).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.slots).toHaveLength(5 + 7);
    expect(result.slots.every((s) => s.available)).toBe(true);
    expect(result.slots.map((s) => `${s.serviceId}@${s.startLocal}`).slice(0, 6)).toEqual([
      "lunch@12:00",
      "lunch@12:30",
      "lunch@13:00",
      "lunch@13:30",
      "lunch@14:00",
      "dinner@19:00",
    ]);
    const first = result.slots[0];
    expect(first?.startsAt.toISOString()).toBe("2026-06-12T10:00:00.000Z");
    expect(first?.endsAt.toISOString()).toBe("2026-06-12T11:30:00.000Z");
  });

  it("marks the day closed when no service is open", () => {
    const closedSunday = computeAvailability(baseInput({ date: "2026-06-14", services: [lunch] }));
    expect(closedSunday).toMatchObject({ closed: true, reasons: ["closed"], slots: [] });
    const nothingConfigured = computeAvailability(baseInput({ services: [] }));
    expect(nothingConfigured.reasons).toEqual(["no_service"]);
    const holiday = computeAvailability(
      baseInput({ exceptions: [{ serviceId: null, date: FRIDAY, closed: true, windows: null }] }),
    );
    expect(holiday.closed).toBe(true);
  });

  it("keeps slots visible but unavailable when the party is out of policy", () => {
    const result = computeAvailability(baseInput({ partySize: 14 }));
    expect(result.reasons).toEqual(["party_too_large"]);
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.every((s) => s.available === false && s.reason === "party_too_large")).toBe(true);
  });

  it("applies lead time relative to now in the restaurant timezone", () => {
    const result = computeAvailability(baseInput({ now: at(FRIDAY, "18:30"), services: [dinner] }));
    const byTime = Object.fromEntries(result.slots.map((s) => [s.startLocal, s.reason ?? "ok"]));
    expect(byTime).toMatchObject({ "19:00": "outside_lead_time", "19:30": "ok", "22:00": "ok" });
    const lunchToday = computeAvailability(baseInput({ now: at(FRIDAY, "18:30"), services: [lunch] }));
    expect(lunchToday.slots.every((s) => s.reason === "in_past")).toBe(true);
  });

  it("uses the restaurant timezone for 'today' even when UTC has moved on", () => {
    const nyDinner = { ...dinner, weeklyHours: everyDay([{ start: "19:00", end: "21:00" }]) };
    const result = computeAvailability(
      baseInput({ timezone: "America/New_York", now: new Date("2026-06-12T23:30:00Z"), services: [nyDinner] }),
    );
    // 23:30Z = 19:30 in New York on the same date
    const byTime = Object.fromEntries(result.slots.map((s) => [s.startLocal, s.reason ?? "ok"]));
    expect(byTime).toEqual({
      "19:00": "in_past",
      "19:30": "in_past",
      "20:00": "outside_lead_time",
      "20:30": "ok",
      "21:00": "ok",
    });
  });

  it("marks slots full under a restaurant-wide concurrent cover limit", () => {
    const rule = {
      serviceId: null,
      areaId: null,
      weekday: null,
      date: null,
      startTime: null,
      endTime: null,
      maxCovers: 10,
      maxBookings: null,
      maxPartySize: null,
    };
    const existing = [booking("dinner", FRIDAY, "19:00", 6, 120), booking("dinner", FRIDAY, "19:30", 4, 120)];
    const result = computeAvailability(
      baseInput({ services: [dinner], capacityRules: [rule], existingBookings: existing, partySize: 2 }),
    );
    const byTime = Object.fromEntries(result.slots.map((s) => [s.startLocal, [s.available, s.remainingCovers]]));
    expect(byTime["19:00"]).toEqual([false, 0]);
    expect(byTime["20:00"]).toEqual([false, 0]);
    expect(byTime["20:30"]).toEqual([false, 0]);
    expect(byTime["21:00"]).toEqual([true, 6]); // 19:00 party left; 19:30 party stays until 21:30
    expect(byTime["21:30"]).toEqual([true, 10]);
  });

  it("supports services that cross midnight", () => {
    const result = computeAvailability(baseInput({ services: [late] }));
    const last = result.slots.at(-1);
    expect(last?.startLocal).toBe("01:00");
    expect(last?.startsAt.toISOString()).toBe("2026-06-12T23:00:00.000Z");
    expect(last?.available).toBe(true);
  });

  it("stays consistent across DST transitions", () => {
    const spring = computeAvailability(baseInput({ date: "2026-03-29", now: at("2026-03-20", "10:00"), services: [dinner] }));
    expect(spring.slots[0]?.startsAt.toISOString()).toBe("2026-03-29T17:00:00.000Z"); // 19:00 +02:00
    expect(spring.slots.every((s) => s.endsAt.getTime() - s.startsAt.getTime() === 120 * 60_000)).toBe(true);

    const bar = { ...late, weeklyHours: everyDay([{ start: "22:00", end: "03:00" }]) };
    const fall = computeAvailability(baseInput({ date: "2026-10-24", now: at("2026-10-20", "10:00"), services: [bar] }));
    const instants = fall.slots.map((s) => s.startsAt.getTime());
    expect(new Set(instants).size).toBe(instants.length);
    for (let i = 1; i < instants.length; i += 1) {
      expect((instants[i] ?? 0) > (instants[i - 1] ?? 0)).toBe(true);
    }
  });

  it("ignores inactive services", () => {
    const result = computeAvailability(baseInput({ services: [{ ...dinner, active: false }, lunch] }));
    expect(result.slots.every((s) => s.serviceId === "lunch")).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(() => computeAvailability(baseInput({ timezone: "Nowhere/Land" }))).toThrow(DomainError);
    expect(() => computeAvailability(baseInput({ date: "2026-02-30" }))).toThrow(DomainError);
  });
});

describe("assertSlotBookable", () => {
  it("accepts a valid slot and returns the end time", () => {
    const verdict = assertSlotBookable(baseInput(), { serviceId: "dinner", startsAt: at(FRIDAY, "20:00") });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.endsAt.toISOString()).toBe("2026-06-12T20:00:00.000Z");
  });

  it("rejects off-grid times, unknown services and full slots", () => {
    expect(assertSlotBookable(baseInput(), { serviceId: "dinner", startsAt: at(FRIDAY, "20:10") })).toEqual({
      ok: false,
      reason: "not_a_slot",
    });
    expect(assertSlotBookable(baseInput(), { serviceId: "brunch", startsAt: at(FRIDAY, "20:00") })).toEqual({
      ok: false,
      reason: "no_service",
    });
    const packed = baseInput({ existingBookings: [booking("dinner", FRIDAY, "20:00", 20, 120)] });
    expect(assertSlotBookable(packed, { serviceId: "dinner", startsAt: at(FRIDAY, "20:00") })).toEqual({
      ok: false,
      reason: "full",
    });
  });

  it("reports date-level reasons for a slot on a closed day", () => {
    const input = baseInput({ exceptions: [{ serviceId: null, date: FRIDAY, closed: true, windows: null }] });
    expect(assertSlotBookable(input, { serviceId: "dinner", startsAt: at(FRIDAY, "20:00") })).toEqual({
      ok: false,
      reason: "closed",
    });
  });

  it("lets the request override the party size", () => {
    const verdict = assertSlotBookable(baseInput({ partySize: 2 }), {
      serviceId: "dinner",
      startsAt: at(FRIDAY, "20:00"),
      partySize: 30,
    });
    expect(verdict).toEqual({ ok: false, reason: "party_too_large" });
  });
});
