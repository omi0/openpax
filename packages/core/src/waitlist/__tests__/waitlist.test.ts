import { describe, expect, it } from "vitest";
import type { Slot } from "../../availability/types.js";
import { pickOfferSlot } from "../waitlist.js";

const slot = (serviceId: string, startLocal: string, available = true): Slot => ({
  serviceId,
  startsAt: new Date(`2026-06-12T${startLocal}:00Z`),
  endsAt: new Date(`2026-06-12T${startLocal}:00Z`),
  startLocal,
  remainingCovers: available ? 4 : 0,
  available,
  ...(available ? {} : { reason: "full" as const }),
});

describe("pickOfferSlot", () => {
  const slots = [
    slot("lunch", "12:30"),
    slot("dinner", "19:00", false),
    slot("dinner", "19:30"),
    slot("dinner", "21:00"),
  ];

  it("returns null when nothing is available", () => {
    expect(
      pickOfferSlot([slot("dinner", "20:00", false)], { serviceId: null, preferredTime: null }),
    ).toBeNull();
  });

  it("takes the earliest available slot without preferences", () => {
    expect(pickOfferSlot(slots, { serviceId: null, preferredTime: null })?.startLocal).toBe(
      "12:30",
    );
  });

  it("prefers the requested service and the closest time", () => {
    expect(pickOfferSlot(slots, { serviceId: "dinner", preferredTime: "20:30" })?.startLocal).toBe(
      "21:00",
    );
    expect(pickOfferSlot(slots, { serviceId: "dinner", preferredTime: "19:00" })?.startLocal).toBe(
      "19:30",
    );
  });

  it("falls back to any service when the preferred one has nothing", () => {
    expect(pickOfferSlot(slots, { serviceId: "brunch", preferredTime: "13:00" })?.startLocal).toBe(
      "12:30",
    );
  });
});
