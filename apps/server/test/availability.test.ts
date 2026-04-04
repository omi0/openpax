import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createFixture, createTestApp, FRIDAY, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Availability {
  closed: boolean;
  reasons: string[];
  slots: Array<{
    startLocal: string;
    startsAt: string;
    available: boolean;
    reason?: string;
    remainingCovers: number | null;
  }>;
}

describe("public availability", () => {
  it("lists dinner slots in the restaurant timezone", async () => {
    const fx = await createFixture(t);
    const res = await api<Availability>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability?date=${FRIDAY}&partySize=2`,
    );
    expect(res.status).toBe(200);
    expect(res.body.closed).toBe(false);
    expect(res.body.slots.map((s) => s.startLocal)).toEqual([
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
      "21:30",
      "22:00",
    ]);
    expect(res.body.slots[0]?.startsAt).toBe("2026-06-12T17:00:00.000Z");
    expect(res.body.slots.every((s) => s.available)).toBe(true);
    expect(res.body.slots[0]?.remainingCovers).toBe(20);
  });

  it("honours closures and party limits", async () => {
    const fx = await createFixture(t);
    const closed = await api(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/schedule-exceptions`,
      { date: FRIDAY, closed: true, reason: "Private event" },
      fx.session,
    );
    expect(closed.status).toBe(201);
    const res = await api<Availability>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability?date=${FRIDAY}&partySize=2`,
    );
    expect(res.body.closed).toBe(true);
    expect(res.body.reasons).toEqual(["closed"]);

    const big = await api<Availability>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability?date=2026-06-13&partySize=11`,
    );
    expect(big.body.reasons).toEqual(["party_too_large"]);
    expect(big.body.slots.every((s) => s.reason === "party_too_large")).toBe(true);
  });

  it("closes a whole period with one closure", async () => {
    const fx = await createFixture(t);
    const created = await api<{ endDate: string }>(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/schedule-exceptions`,
      { date: "2026-06-15", endDate: "2026-06-18", closed: true, reason: "Ferie" },
      fx.session,
    );
    expect(created.status).toBe(201);
    expect(created.body.endDate).toBe("2026-06-18");
    for (const [date, closed] of [
      ["2026-06-14", false],
      ["2026-06-15", true],
      ["2026-06-17", true],
      ["2026-06-18", true],
      ["2026-06-19", false],
    ] as const) {
      const res = await api<Availability>(
        t,
        "GET",
        `/api/public/v1/restaurants/${fx.slug}/availability?date=${date}&partySize=2`,
      );
      expect(res.body.closed, date).toBe(closed);
    }
    const month = await api<{ openDates: string[] }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability/month?month=2026-06`,
    );
    expect(month.body.openDates).toContain("2026-06-14");
    expect(month.body.openDates).not.toContain("2026-06-16");
    expect(month.body.openDates).toContain("2026-06-19");

    // a single day keeps its end date equal to the start; a backwards range is refused
    const single = await api<{ date: string; endDate: string }>(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/schedule-exceptions`,
      { date: "2026-06-22", closed: true },
      fx.session,
    );
    expect(single.body.endDate).toBe("2026-06-22");
    const backwards = await api(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/schedule-exceptions`,
      { date: "2026-06-22", endDate: "2026-06-21", closed: true },
      fx.session,
    );
    expect(backwards.status).toBe(400);
  });

  it("shows staff every slot with room, without the online booking rules", async () => {
    const fx = await createFixture(t);
    // day 61: beyond the 60-day horizon, and a party above the online maximum of 10
    const far = "2026-08-10";
    const guest = await api<Availability>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability?date=${far}&partySize=12`,
    );
    expect(guest.body.reasons).toEqual(
      expect.arrayContaining(["too_far_ahead", "party_too_large"]),
    );
    expect(guest.body.slots.some((s) => s.available)).toBe(false);

    const staff = await api<Availability>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/availability?date=${far}&partySize=12`,
      undefined,
      fx.session,
    );
    expect(staff.status).toBe(200);
    expect(staff.body.reasons).toEqual([]);
    expect(staff.body.slots.every((s) => s.available)).toBe(true);

    // capacity still counts: a closed day stays closed for staff too
    await api(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/schedule-exceptions`,
      { date: far, closed: true },
      fx.session,
    );
    const closed = await api<Availability>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/availability?date=${far}&partySize=2`,
      undefined,
      fx.session,
    );
    expect(closed.body.closed).toBe(true);

    const anonymous = await api(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/availability?date=${far}&partySize=2`,
    );
    expect(anonymous.status).toBe(401);
  });

  it("validates the query and unknown restaurants", async () => {
    const fx = await createFixture(t);
    const bad = await api<{ code: string }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability?date=tomorrow&partySize=2`,
    );
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("validation_error");
    const missing = await api(
      t,
      "GET",
      "/api/public/v1/restaurants/nope/availability?date=2026-06-12&partySize=2",
    );
    expect(missing.status).toBe(404);
  });

  it("reports open days of a month", async () => {
    const fx = await createFixture(t);
    await api(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/schedule-exceptions`,
      { date: "2026-07-14", closed: true },
      fx.session,
    );
    const res = await api<{ openDates: string[] }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability/month?month=2026-07`,
    );
    expect(res.body.openDates).toHaveLength(30);
    expect(res.body.openDates).not.toContain("2026-07-14");
    // 30-day months must not build an invalid "-31" date
    const sept = await api<{ openDates: string[] }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability/month?month=2026-09`,
    );
    expect(sept.status).toBe(200);
    expect(sept.body.openDates).toHaveLength(30);
    const feb = await api<{ openDates: string[] }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability/month?month=2028-02`,
    );
    expect(feb.body.openDates).toHaveLength(29);
  });
});
