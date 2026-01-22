import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createFixture,
  createTestApp,
  FRIDAY,
  guestBooking,
  romeInstant,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Analytics {
  totals: {
    created: number;
    bookings: number;
    covers: number;
    cancelled: number;
    noShows: number;
    averagePartySize: number | null;
    noShowRate: number | null;
    cancellationRate: number | null;
    capacity: number | null;
    occupancy: number | null;
  };
  days: Array<{ date: string; bookings: number; covers: number; capacity: number | null }>;
  services: Array<{ name: string; bookings: number; covers: number; capacity: number | null }>;
  sources: Array<{ source: string; bookings: number }>;
  weekdays: Array<{ weekday: string; bookings: number }>;
}

describe("analytics", () => {
  it("aggregates bookings, covers, no-shows and offered capacity over a range", async () => {
    const fx = await createFixture(t);
    const staff = `/api/v1/restaurants/${fx.restaurantId}/bookings`;
    const publicPath = `/api/public/v1/restaurants/${fx.slug}/bookings`;

    // two online bookings on Friday, one of them cancelled
    await api(t, "POST", publicPath, guestBooking(fx));
    const cancelled = await api<{ id: string }>(
      t,
      "POST",
      publicPath,
      guestBooking(fx, {
        startsAt: romeInstant(FRIDAY, "21:00"),
        partySize: 3,
        guest: { name: "Lucia Bianchi", email: "lucia@example.com", phone: "+39 340 7654321" },
      }),
    );
    await api(t, "POST", `${staff}/${cancelled.body.id}/actions`, { action: "cancel" }, fx.session);

    // a phone booking last Friday (staff override lets it sit in the past) that did not show up
    const lastFriday = "2026-06-05";
    const past = await api<{ id: string }>(
      t,
      "POST",
      staff,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(lastFriday, "20:00"),
        partySize: 4,
        customer: { name: "Paolo Verdi", phone: "+39 333 0000001" },
        source: "phone",
        ignoreCapacity: true,
      },
      fx.session,
    );
    expect(past.status).toBe(201);
    await api(t, "POST", `${staff}/${past.body.id}/actions`, { action: "no_show" }, fx.session);
    // and a walk-in that was seated
    const walkIn = await api<{ id: string }>(
      t,
      "POST",
      staff,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(lastFriday, "19:30"),
        partySize: 2,
        customer: { name: "Anna Neri" },
        source: "walk_in",
        seatNow: true,
        ignoreCapacity: true,
      },
      fx.session,
    );
    expect(walkIn.status).toBe(201);

    const res = await api<Analytics>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/analytics?from=2026-06-01&to=2026-06-14`,
      undefined,
      fx.session,
    );
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({
      created: 4,
      bookings: 3,
      covers: 8,
      cancelled: 1,
      noShows: 1,
      averagePartySize: 8 / 3,
      noShowRate: 0.5,
      cancellationRate: 0.25,
    });
    // dinner 19:00–22:00 every 30 min = 7 slots × 20 covers, 14 open days
    expect(res.body.days.find((d) => d.date === FRIDAY)).toMatchObject({
      bookings: 1,
      covers: 2,
      capacity: 140,
    });
    expect(res.body.totals.capacity).toBe(140 * 14);
    expect(res.body.totals.occupancy).toBeCloseTo(8 / (140 * 14));
    expect(res.body.services[0]).toMatchObject({
      name: "Cena",
      bookings: 3,
      covers: 8,
      capacity: 1960,
    });
    expect(res.body.sources.map((s) => s.source).sort()).toEqual(["phone", "walk_in", "widget"]);
    expect(res.body.weekdays.find((w) => w.weekday === "fri")?.bookings).toBe(3);

    const closed = await api(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/schedule-exceptions`,
      { date: "2026-06-13", closed: true },
      fx.session,
    );
    expect(closed.status).toBe(201);
    const after = await api<Analytics>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/analytics?from=2026-06-13&to=2026-06-13`,
      undefined,
      fx.session,
    );
    expect(after.body.days[0]?.capacity).toBe(0);
    expect(after.body.totals.occupancy).toBeNull();

    const tooLong = await api<{ code: string }>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/analytics?from=2025-01-01&to=2026-06-01`,
      undefined,
      fx.session,
    );
    expect(tooLong.body.code).toBe("range_too_long");
  });
});
