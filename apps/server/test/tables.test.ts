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

interface Booking {
  id: string;
  status: string;
  tables: Array<{ id: string; name: string }>;
}
interface Slot {
  startLocal: string;
  available: boolean;
  reason?: string;
}

describe("tables and auto-assignment", () => {
  it("seats bookings on the best free table, joins tables for large parties, and refuses when none is free", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    const publicPath = `/api/public/v1/restaurants/${fx.slug}`;

    const areaRes = await api<{ id: string }>(
      t,
      "POST",
      `${base}/areas`,
      { name: "Sala" },
      fx.session,
    );
    const areaId = areaRes.body.id;
    const ids: Record<string, string> = {};
    for (const [name, maxCovers, joinable, sortOrder] of [
      ["T1", 2, true, 1],
      ["T2", 4, true, 2],
      ["T3", 4, true, 3],
      ["T6", 6, false, 4],
    ] as const) {
      const res = await api<{ id: string }>(
        t,
        "POST",
        `${base}/tables`,
        { name, areaId, maxCovers, joinable, sortOrder, x: sortOrder * 15, y: 10 },
        fx.session,
      );
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      ids[name] = res.body.id;
    }
    const list = await api<Array<{ name: string }>>(
      t,
      "GET",
      `${base}/tables`,
      undefined,
      fx.session,
    );
    expect(list.body.map((x) => x.name)).toEqual(["T1", "T2", "T3", "T6"]);

    const book = (partySize: number, time = "20:00", email = `g${Math.random()}@example.com`) =>
      api<Booking & { reason?: string; code?: string }>(
        t,
        "POST",
        `${publicPath}/bookings`,
        guestBooking(fx, {
          partySize,
          startsAt: romeInstant(FRIDAY, time),
          guest: { name: "Guest", email, phone: `+39 333 ${String(Math.random()).slice(2, 9)}` },
        }),
      );
    const staffBooking = (id: string) =>
      api<Booking>(t, "GET", `${base}/bookings/${id}`, undefined, fx.session);

    // two guests: the two-top first, then the smallest four-top
    const first = await book(2);
    expect(first.status).toBe(201);
    expect((await staffBooking(first.body.id)).body.tables.map((x) => x.name)).toEqual(["T1"]);
    const second = await book(2);
    expect((await staffBooking(second.body.id)).body.tables.map((x) => x.name)).toEqual(["T2"]);

    // eight guests: only T3 (joinable) and T6 (not) are left, so nothing fits
    const eight = await book(8);
    expect(eight.status).toBe(409);
    expect(eight.body.reason).toBe("no_table");

    // six guests take the six-top, three the remaining four-top
    const six = await book(6);
    expect((await staffBooking(six.body.id)).body.tables.map((x) => x.name)).toEqual(["T6"]);
    const three = await book(3);
    expect((await staffBooking(three.body.id)).body.tables.map((x) => x.name)).toEqual(["T3"]);

    // every table is taken at 20:00 although the pacing limit (20 covers) would allow more
    const full = await book(2);
    expect(full.status).toBe(409);
    expect(full.body.reason).toBe("no_table");
    const avail = await api<{ slots: Slot[] }>(
      t,
      "GET",
      `${publicPath}/availability?date=${FRIDAY}&partySize=2`,
    );
    expect(avail.body.slots.find((s) => s.startLocal === "20:00")).toMatchObject({
      available: false,
      reason: "no_table",
    });
    // bookings last two hours: 22:00 is free again
    expect(avail.body.slots.find((s) => s.startLocal === "22:00")?.available).toBe(true);

    // a joined pair: T2 + T3 can seat seven once they are both free (at 22:00)
    const seven = await book(7, "22:00");
    expect(seven.status, JSON.stringify(seven.body)).toBe(201);
    expect((await staffBooking(seven.body.id)).body.tables.map((x) => x.name).sort()).toEqual([
      "T2",
      "T3",
    ]);
  });

  it("lets staff reassign by hand, refuses taken tables unless forced, and reseats on modification", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    const t2 = await api<{ id: string }>(
      t,
      "POST",
      `${base}/tables`,
      { name: "A", maxCovers: 2, sortOrder: 1 },
      fx.session,
    );
    const t4 = await api<{ id: string }>(
      t,
      "POST",
      `${base}/tables`,
      { name: "B", maxCovers: 4, sortOrder: 2 },
      fx.session,
    );
    const guest = await api<Booking>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, { partySize: 2 }),
    );
    expect(guest.status).toBe(201);
    const other = await api<Booking>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, {
        partySize: 4,
        guest: { name: "Other", email: "other@example.com", phone: "+39 333 7654321" },
      }),
    );
    expect(other.status).toBe(201);

    const taken = await api<{ code: string; tables: string[] }>(
      t,
      "PUT",
      `${base}/bookings/${guest.body.id}/tables`,
      { tableIds: [t4.body.id] },
      fx.session,
    );
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: "table_taken", tables: ["B"] });

    const forced = await api<Array<{ name: string }>>(
      t,
      "PUT",
      `${base}/bookings/${guest.body.id}/tables`,
      { tableIds: [t4.body.id], force: true },
      fx.session,
    );
    expect(forced.status).toBe(200);
    expect(forced.body.map((x) => x.name)).toEqual(["B"]);

    // moving the booking to 22:00 reseats it automatically on the free two-top
    const moved = await api<Booking>(
      t,
      "PATCH",
      `${base}/bookings/${guest.body.id}`,
      { startsAt: romeInstant(FRIDAY, "22:00") },
      fx.session,
    );
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.tables.map((x) => x.name)).toEqual(["A"]);
    expect(t2.status).toBe(201);

    // unassign
    const cleared = await api<unknown[]>(
      t,
      "PUT",
      `${base}/bookings/${guest.body.id}/tables`,
      { tableIds: [] },
      fx.session,
    );
    expect(cleared.body).toEqual([]);

    // staff override still creates the booking, just without a table
    const squeezed = await api<Booking>(
      t,
      "POST",
      `${base}/bookings`,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "20:00"),
        partySize: 4,
        customer: { name: "VIP" },
        ignoreCapacity: true,
      },
      fx.session,
    );
    expect(squeezed.status).toBe(201);
    expect(squeezed.body.tables).toEqual([]);
  });
});
