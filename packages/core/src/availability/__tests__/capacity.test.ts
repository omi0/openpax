import { describe, expect, it } from "vitest";
import { arrivalsInSlot, evaluateCapacity, peakLoad, ruleAppliesToSlot } from "../capacity.js";
import type { CapacityRuleDef } from "../types.js";
import { FRIDAY, TZ, at, booking, dinner } from "./fixtures.js";

const anyRule: CapacityRuleDef = {
  serviceId: null,
  areaId: null,
  weekday: null,
  date: null,
  startTime: null,
  endTime: null,
  maxCovers: null,
  maxBookings: null,
  maxPartySize: null,
};

const ctx = { serviceId: "dinner", areaId: null, date: FRIDAY, weekday: "fri" as const, startMin: 1200 };

function slotAt(time: string, duration = 120) {
  const startsAt = at(FRIDAY, time);
  return {
    serviceId: "dinner",
    startMin: 0,
    endMin: 0,
    startsAt,
    endsAt: new Date(startsAt.getTime() + duration * 60_000),
    startLocal: time,
  };
}

describe("peakLoad", () => {
  it("finds the busiest moment across staggered bookings", () => {
    const bookings = [
      booking("dinner", FRIDAY, "19:00", 4, 120),
      booking("dinner", FRIDAY, "20:00", 4, 120),
      booking("dinner", FRIDAY, "21:00", 4, 120),
    ];
    // 20:00-22:00 candidate: at 20:00 -> 8 covers (19:00 + 20:00), at 21:00 -> 8 (20:00 + 21:00)
    expect(peakLoad(bookings, at(FRIDAY, "20:00"), at(FRIDAY, "22:00"))).toEqual({ covers: 8, bookings: 2 });
    // 21:00-23:00 candidate: 19:00 booking already left (end exclusive)
    expect(peakLoad(bookings, at(FRIDAY, "21:00"), at(FRIDAY, "23:00"))).toEqual({ covers: 8, bookings: 2 });
    expect(peakLoad(bookings, at(FRIDAY, "23:00"), at(FRIDAY, "23:30"))).toEqual({ covers: 0, bookings: 0 });
  });

  it("honours the filter", () => {
    const bookings = [booking("dinner", FRIDAY, "19:00", 4, 120), booking("lunch", FRIDAY, "19:00", 2, 120)];
    expect(peakLoad(bookings, at(FRIDAY, "19:00"), at(FRIDAY, "20:00"), (b) => b.serviceId === "dinner").covers).toBe(4);
  });
});

describe("arrivalsInSlot", () => {
  it("counts bookings starting within the interval for the same service", () => {
    const bookings = [
      booking("dinner", FRIDAY, "20:00", 4, 120),
      booking("dinner", FRIDAY, "20:10", 2, 120),
      booking("dinner", FRIDAY, "20:30", 2, 120),
      booking("lunch", FRIDAY, "20:00", 9, 120),
    ];
    expect(arrivalsInSlot(bookings, "dinner", at(FRIDAY, "20:00"), 30)).toEqual({ covers: 6, bookings: 2 });
  });
});

describe("ruleAppliesToSlot", () => {
  it("matches on scope fields", () => {
    expect(ruleAppliesToSlot(anyRule, ctx)).toBe(true);
    expect(ruleAppliesToSlot({ ...anyRule, serviceId: "lunch" }, ctx)).toBe(false);
    expect(ruleAppliesToSlot({ ...anyRule, areaId: "terrace" }, ctx)).toBe(false);
    expect(ruleAppliesToSlot({ ...anyRule, areaId: "terrace" }, { ...ctx, areaId: "terrace" })).toBe(true);
    expect(ruleAppliesToSlot({ ...anyRule, weekday: "sat" }, ctx)).toBe(false);
    expect(ruleAppliesToSlot({ ...anyRule, date: "2026-06-13" }, ctx)).toBe(false);
    expect(ruleAppliesToSlot({ ...anyRule, date: FRIDAY }, ctx)).toBe(true);
  });

  it("matches time windows, including ones that wrap midnight", () => {
    expect(ruleAppliesToSlot({ ...anyRule, startTime: "19:00", endTime: "21:00" }, ctx)).toBe(true);
    expect(ruleAppliesToSlot({ ...anyRule, startTime: "20:30", endTime: "22:00" }, ctx)).toBe(false);
    expect(ruleAppliesToSlot({ ...anyRule, startTime: "22:00", endTime: "02:00" }, { ...ctx, startMin: 1440 + 30 })).toBe(true);
    expect(ruleAppliesToSlot({ ...anyRule, startTime: "22:00", endTime: "02:00" }, { ...ctx, startMin: 1440 + 150 })).toBe(false);
  });
});

describe("evaluateCapacity", () => {
  it("is unlimited when nothing constrains the slot", () => {
    const svc = { ...dinner, maxCoversPerSlot: null };
    expect(evaluateCapacity(slotAt("20:00"), svc, [], [], 4, ctx)).toEqual({ ok: true, remainingCovers: null });
  });

  it("applies the per-slot pacing limit of the service", () => {
    const bookings = [booking("dinner", FRIDAY, "20:00", 18, 120)];
    expect(evaluateCapacity(slotAt("20:00"), dinner, [], bookings, 2, ctx)).toEqual({ ok: true, remainingCovers: 2 });
    expect(evaluateCapacity(slotAt("20:00"), dinner, [], bookings, 3, ctx)).toEqual({ ok: false, reason: "full", remainingCovers: 2 });
    // a different slot is unaffected by pacing
    expect(evaluateCapacity(slotAt("20:30"), dinner, [], bookings, 3, ctx).ok).toBe(true);
  });

  it("applies concurrent-cover rules with overlap", () => {
    const rule = { ...anyRule, maxCovers: 10 };
    const bookings = [booking("dinner", FRIDAY, "19:00", 8, 120)];
    // 20:00 overlaps the 19:00 table until 21:00 -> 2 left
    expect(evaluateCapacity(slotAt("20:00"), dinner, [rule], bookings, 2, ctx)).toEqual({ ok: true, remainingCovers: 2 });
    expect(evaluateCapacity(slotAt("20:00"), dinner, [rule], bookings, 4, ctx)).toEqual({ ok: false, reason: "full", remainingCovers: 2 });
    // 21:00 no longer overlaps -> full 10 left
    expect(evaluateCapacity(slotAt("21:00"), dinner, [rule], bookings, 4, ctx)).toEqual({ ok: true, remainingCovers: 10 });
  });

  it("applies party-count rules and party-size caps", () => {
    const bookings = [booking("dinner", FRIDAY, "20:00", 2, 120)];
    expect(evaluateCapacity(slotAt("20:00"), dinner, [{ ...anyRule, maxBookings: 1 }], bookings, 2, ctx)).toEqual({ ok: false, reason: "full", remainingCovers: 0 });
    expect(evaluateCapacity(slotAt("20:00"), dinner, [{ ...anyRule, maxPartySize: 6 }], [], 8, ctx)).toEqual({ ok: false, reason: "party_too_large", remainingCovers: 20 });
  });

  it("reports the tightest remaining count across all limits", () => {
    const rules = [{ ...anyRule, maxCovers: 30 }, { ...anyRule, serviceId: "dinner", areaId: null, maxCovers: 12 }];
    const bookings = [booking("dinner", FRIDAY, "20:00", 8, 120)];
    expect(evaluateCapacity(slotAt("20:00"), dinner, rules, bookings, 2, ctx)).toEqual({ ok: true, remainingCovers: 4 });
  });

  it("only counts bookings in the rule's scope", () => {
    const terraceRule = { ...anyRule, areaId: "terrace", maxCovers: 4 };
    const bookings = [booking("dinner", FRIDAY, "20:00", 4, 120, "inside")];
    const terraceCtx = { ...ctx, areaId: "terrace" };
    expect(evaluateCapacity(slotAt("20:00"), { ...dinner, maxCoversPerSlot: null }, [terraceRule], bookings, 2, terraceCtx)).toEqual({ ok: true, remainingCovers: 4 });
  });
});

describe("timezones in capacity math", () => {
  it("compares instants, not wall clocks", () => {
    const ny = booking("dinner", FRIDAY, "20:00", 4, 120, null, "America/New_York");
    expect(peakLoad([ny], at(FRIDAY, "20:00", TZ), at(FRIDAY, "22:00", TZ)).covers).toBe(0);
  });
});
