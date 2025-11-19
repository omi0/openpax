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
  });
});
