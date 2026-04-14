import { booking } from "@openpax/db";
import { eq, sql } from "drizzle-orm";
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
    seatCapacity: number | null;
    seatOccupancy: number | null;
  };
  seats: number | null;
  days: Array<{
    date: string;
    bookings: number;
    covers: number;
    capacity: number | null;
    seatCapacity: number | null;
  }>;
  services: Array<{
    name: string;
    bookings: number;
    covers: number;
    capacity: number | null;
    seatCapacity: number | null;
  }>;
  sources: Array<{ source: string; bookings: number }>;
  weekdays: Array<{ weekday: string; bookings: number }>;
  previous: { from: string; to: string; totals: Analytics["totals"] };
  partySizes: Array<{ partySize: number; bookings: number; covers: number }>;
  leadTime: {
    buckets: Array<{ bucket: string; bookings: number }>;
    medianHours: number | null;
    averageHours: number | null;
  };
}

describe("analytics", () => {
  it("aggregates bookings, covers, no-shows and offered capacity over a range", async () => {
    const fx = await createFixture(t);
    const staff = `/api/v1/restaurants/${fx.restaurantId}/bookings`;
    const publicPath = `/api/public/v1/restaurants/${fx.slug}/bookings`;

    // two online bookings on Friday, one of them cancelled
    const first = await api<{ id: string }>(t, "POST", publicPath, guestBooking(fx));
    // the database clock stamps created_at, not the frozen test clock: back-date it 2 days
    await t.ctx.db
      .update(booking)
      .set({ createdAt: sql`${booking.startsAt} - interval '48 hours'` })
      .where(eq(booking.id, first.body.id));
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
    // and a table of five in the previous period
    const earlier = await api<{ id: string }>(
      t,
      "POST",
      staff,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant("2026-05-25", "20:00"),
        partySize: 5,
        customer: { name: "Giulia Russo" },
        source: "phone",
        ignoreCapacity: true,
      },
      fx.session,
    );
    expect(earlier.status).toBe(201);

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

    // previous period of the same length, ending the day before `from`
    expect(res.body.previous).toMatchObject({ from: "2026-05-18", to: "2026-05-31" });
    expect(res.body.previous.totals).toMatchObject({ created: 1, bookings: 1, covers: 5 });

    // distributions ignore the cancelled booking
    expect(res.body.partySizes).toEqual([
      { partySize: 2, bookings: 2, covers: 4 },
      { partySize: 4, bookings: 1, covers: 4 },
    ]);
    const buckets = Object.fromEntries(
      res.body.leadTime.buckets.map((b) => [b.bucket, b.bookings]),
    );
    expect(buckets).toMatchObject({ "1h": 2, "3d": 1, "6h": 0, "30d+": 0 });
    expect(res.body.leadTime.medianHours).toBe(0);
    expect(res.body.leadTime.averageHours).toBeCloseTo(16);

    const csv = await t.app.request(
      `/api/v1/restaurants/${fx.restaurantId}/analytics/export?from=2026-06-01&to=2026-06-14`,
      { headers: { cookie: fx.session.cookie, origin: "http://localhost:3000" } },
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain(".csv");
    const lines = (await csv.text()).trim().split("\r\n");
    expect(lines[0]).toBe(
      "date,weekday,bookings,covers,cancelled,no_shows,capacity,occupancy,seat_capacity,seat_occupancy",
    );
    expect(lines).toHaveLength(16);
    // no rooms yet: the seat columns stay empty
    expect(lines.find((l) => l.startsWith("2026-06-12"))).toBe(
      "2026-06-12,fri,1,2,1,0,140,0.0143,,",
    );
    expect(lines[15]).toBe("total,,3,8,1,1,1960,0.0041,,");
    expect(res.body.seats).toBeNull();
    expect(res.body.totals.seatCapacity).toBeNull();

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

  it("measures occupancy against the seats of the open rooms when they are known", async () => {
    const fx = await createFixture(t);
    const areas = `/api/v1/restaurants/${fx.restaurantId}/areas`;
    const report = `/api/v1/restaurants/${fx.restaurantId}/analytics?from=${FRIDAY}&to=2026-06-13`;
    const room = async (name: string, seats: number | null) => {
      const res = await api<{ id: string }>(
        t,
        "POST",
        areas,
        { name, seats, active: true, sortOrder: 0 },
        fx.session,
      );
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body.id;
    };
    const setOpen = async (id: string, name: string, seats: number | null, active: boolean) => {
      const res = await api(
        t,
        "PUT",
        `${areas}/${id}`,
        { name, seats, active, sortOrder: 0 },
        fx.session,
      );
      expect(res.status).toBe(200);
    };
    const sala = await room("Sala", 40);
    const booked = await api<{ id: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, { partySize: 4 }),
    );
    expect(booked.status).toBe(201);

    // dinner arrivals 19:00–22:00 with a 2 h turn = 2.5 turns × 40 seats = 100 covers a day
    const res = await api<Analytics>(t, "GET", report, undefined, fx.session);
    expect(res.status).toBe(200);
    expect(res.body.seats).toBe(40);
    expect(res.body.days.map((d) => d.seatCapacity)).toEqual([100, 100]);
    expect(res.body.days[0]).toMatchObject({ covers: 4, capacity: 140 });
    expect(res.body.services[0]).toMatchObject({ seatCapacity: 200, capacity: 280 });
    expect(res.body.totals).toMatchObject({ seatCapacity: 200, seatOccupancy: 0.02 });
    expect(res.body.totals.occupancy).toBeCloseTo(4 / 280);
    expect(res.body.previous.totals.seatCapacity).toBe(200);
    const csv = await t.app.request(
      `/api/v1/restaurants/${fx.restaurantId}/analytics/export?from=${FRIDAY}&to=2026-06-13`,
      { headers: { cookie: fx.session.cookie, origin: "http://localhost:3000" } },
    );
    const lines = (await csv.text()).trim().split("\r\n");
    expect(lines[1]).toBe(`${FRIDAY},fri,1,4,0,0,140,0.0286,100,0.0400`);
    expect(lines[3]).toBe("total,,1,4,0,0,280,0.0143,200,0.0200");

    // an open room without a seat count makes the total unknown
    const terrace = await room("Dehors", null);
    const unknown = await api<Analytics>(t, "GET", report, undefined, fx.session);
    expect(unknown.body.seats).toBeNull();
    expect(unknown.body.totals).toMatchObject({ seatCapacity: null, seatOccupancy: null });
    expect(unknown.body.days[0]?.seatCapacity).toBeNull();

    // closing it restores the house count; closing every room leaves no seats at all
    await setOpen(terrace, "Dehors", null, false);
    const again = await api<Analytics>(t, "GET", report, undefined, fx.session);
    expect(again.body.seats).toBe(40);
    expect(again.body.totals.seatCapacity).toBe(200);
    await setOpen(sala, "Sala", 40, false);
    const closed = await api<Analytics>(t, "GET", report, undefined, fx.session);
    expect(closed.body.seats).toBe(0);
    expect(closed.body.totals).toMatchObject({ seatCapacity: 0, seatOccupancy: null });
  });
});
