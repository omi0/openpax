import { describe, expect, it } from "vitest";
import {
  checkDatePolicy,
  checkPartyPolicy,
  checkServiceParty,
  checkSlotTiming,
} from "../policy.js";
import { at, dinner, FRIDAY, policy, TZ } from "./fixtures.js";

describe("policy checks", () => {
  it("rejects past dates and dates beyond the booking horizon", () => {
    const now = at("2026-06-10", "10:00");
    expect(checkDatePolicy("2026-06-09", now, TZ, policy)).toBe("in_past");
    expect(checkDatePolicy("2026-06-10", now, TZ, policy)).toBeNull();
    expect(checkDatePolicy("2026-08-09", now, TZ, policy)).toBeNull(); // day 60
    expect(checkDatePolicy("2026-08-10", now, TZ, policy)).toBe("too_far_ahead"); // day 61
  });

  it("uses the restaurant's calendar day, not UTC", () => {
    // 23:30 UTC on Jun 12 is already Jun 13 in Rome
    const now = new Date("2026-06-12T23:30:00Z");
    expect(checkDatePolicy(FRIDAY, now, TZ, policy)).toBe("in_past");
    expect(checkDatePolicy(FRIDAY, now, "America/New_York", policy)).toBeNull();
  });

  it("checks party size against the policy and the service", () => {
    expect(checkPartyPolicy(0, policy)).toBe("party_too_small");
    expect(checkPartyPolicy(1.5, policy)).toBe("party_too_small");
    expect(checkPartyPolicy(13, policy)).toBe("party_too_large");
    expect(checkPartyPolicy(12, policy)).toBeNull();
    expect(checkServiceParty(1, { ...dinner, minPartySize: 2 })).toBe("party_too_small");
    expect(checkServiceParty(9, { ...dinner, maxPartySize: 8 })).toBe("party_too_large");
    expect(checkServiceParty(4, dinner)).toBeNull();
  });

  it("enforces lead time on the arrival instant", () => {
    const now = at(FRIDAY, "18:30");
    expect(checkSlotTiming(at(FRIDAY, "18:00"), now, policy)).toBe("in_past");
    expect(checkSlotTiming(at(FRIDAY, "18:30"), now, policy)).toBe("in_past");
    expect(checkSlotTiming(at(FRIDAY, "19:00"), now, policy)).toBe("outside_lead_time");
    expect(checkSlotTiming(at(FRIDAY, "19:30"), now, policy)).toBeNull();
  });
});
