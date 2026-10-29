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

  it("reseats a reopened booking on a free table and refuses when every table is taken", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    const publicPath = `/api/public/v1/restaurants/${fx.slug}`;
    for (const [name, maxCovers, sortOrder] of [
      ["T1", 2, 1],
      ["T2", 4, 2],
    ] as const) {
      const res = await api(
        t,
        "POST",
        `${base}/tables`,
        { name, maxCovers, sortOrder, x: sortOrder * 15, y: 10 },
        fx.session,
      );
      expect(res.status).toBe(201);
    }
    const book = (partySize: number, email: string) =>
      api<Booking>(
        t,
        "POST",
        `${publicPath}/bookings`,
        guestBooking(fx, {
          partySize,
          guest: { name: "Guest", email, phone: `+39 333 ${String(Math.random()).slice(2, 9)}` },
        }),
      );
    const tablesOf = async (id: string) =>
      (
        await api<Booking>(t, "GET", `${base}/bookings/${id}`, undefined, fx.session)
      ).body.tables.map((x) => x.name);
    const act = (id: string, action: string) =>
      api<Booking & { reason?: string }>(
        t,
        "POST",
        `${base}/bookings/${id}/actions`,
        { action },
        fx.session,
      );

    const anna = await book(2, "anna@example.com");
    expect(await tablesOf(anna.body.id)).toEqual(["T1"]);
    expect((await act(anna.body.id, "cancel")).status).toBe(200);
    // Bruno takes the two-top Anna had
    const bruno = await book(2, "bruno@example.com");
    expect(await tablesOf(bruno.body.id)).toEqual(["T1"]);
    // Anna comes back: she is moved to the four-top, not seated on Bruno's table
    const reopened = await act(anna.body.id, "reopen");
    expect(reopened.status).toBe(200);
    expect(await tablesOf(anna.body.id)).toEqual(["T2"]);

    expect((await act(anna.body.id, "cancel")).status).toBe(200);
    const carla = await book(4, "carla@example.com");
    expect(await tablesOf(carla.body.id)).toEqual(["T2"]);
    // no table left for Anna now
    const refused = await act(anna.body.id, "reopen");
    expect(refused.status).toBe(409);
    expect(refused.body.reason).toBe("no_table");
  });

  it("seats only one party when staff assign the same table to several bookings at once", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    const publicPath = `/api/public/v1/restaurants/${fx.slug}`;
    const ids: Record<string, string> = {};
    for (const [name, maxCovers, sortOrder] of [
      ["T1", 2, 1],
      ["T2", 2, 2],
      ["T3", 2, 3],
      ["T4", 2, 4],
      ["T6", 6, 5],
    ] as const) {
      const res = await api<{ id: string }>(
        t,
        "POST",
        `${base}/tables`,
        { name, maxCovers, sortOrder, x: sortOrder * 15, y: 10 },
        fx.session,
      );
      expect(res.status).toBe(201);
      ids[name] = res.body.id;
    }
    const parties = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        api<Booking>(
          t,
          "POST",
          `${publicPath}/bookings`,
          guestBooking(fx, {
            partySize: 2,
            guest: { name: `P${i}`, email: `p${i}@example.com`, phone: `+39 333 100000${i}` },
          }),
        ),
      ),
    );
    expect(parties.map((p) => p.status)).toEqual([201, 201, 201, 201]);
    const moves = await Promise.all(
      parties.map((p) =>
        api<{ code?: string }>(
          t,
          "PUT",
          `${base}/bookings/${p.body.id}/tables`,
          { tableIds: [ids.T6] },
          fx.session,
        ),
      ),
    );
    expect(moves.filter((m) => m.status === 200)).toHaveLength(1);
    expect(moves.filter((m) => m.status === 409 && m.body.code === "table_taken")).toHaveLength(3);
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
  it("keeps table links both ways, only within a room, and drops them with the table", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    const room = async (name: string) =>
      (await api<{ id: string }>(t, "POST", `${base}/areas`, { name }, fx.session)).body.id;
    const upstairs = await room("Sopra");
    const downstairs = await room("Sotto");
    const add = async (name: string, areaId: string, joinWith: string[] = []) => {
      const res = await api<{ id: string; joinWith: string[] }>(
        t,
        "POST",
        `${base}/tables`,
        { name, areaId, maxCovers: 2, joinWith, headSeats: 1 },
        fx.session,
      );
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body;
    };
    const one = await add("1", upstairs);
    const two = await add("2", upstairs, [one.id]);
    const three = await add("3", upstairs, [two.id]);
    const below = await add("26", downstairs);
    const links = async () => {
      const res = await api<Array<{ name: string; joinWith: string[]; headSeats: number }>>(
        t,
        "GET",
        `${base}/tables`,
        undefined,
        fx.session,
      );
      return Object.fromEntries(res.body.map((x) => [x.name, x.joinWith.length]));
    };
    expect(await links()).toEqual({ "1": 1, "2": 2, "3": 1, "26": 0 });

    const cross = await api(
      t,
      "PUT",
      `${base}/tables/${one.id}`,
      { name: "1", areaId: upstairs, maxCovers: 2, joinWith: [below.id] },
      fx.session,
    );
    expect(cross.status).toBe(400);

    // 1 no longer joins 2: 2 forgets 1 too
    const cut = await api(
      t,
      "PUT",
      `${base}/tables/${one.id}`,
      { name: "1", areaId: upstairs, maxCovers: 2, joinWith: [] },
      fx.session,
    );
    expect(cut.status).toBe(200);
    expect(await links()).toEqual({ "1": 0, "2": 1, "3": 1, "26": 0 });

    expect(
      (await api(t, "DELETE", `${base}/tables/${three.id}`, undefined, fx.session)).status,
    ).toBe(204);
    expect(await links()).toEqual({ "1": 0, "2": 0, "26": 0 });
  });
  it("seats a new booking at the tables the guest asked for, if they are free", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    const add = async (name: string, sortOrder: number) =>
      (
        await api<{ id: string }>(
          t,
          "POST",
          `${base}/tables`,
          { name, maxCovers: 2, sortOrder },
          fx.session,
        )
      ).body.id;
    await add("A", 1);
    const oven1 = await add("1", 2);
    const oven2 = await add("2", 3);
    const staffBooking = (tableIds: string[], name: string, partySize: number) =>
      api<Booking & { code?: string; tables?: unknown }>(
        t,
        "POST",
        `${base}/bookings`,
        {
          serviceId: fx.serviceId,
          startsAt: romeInstant(FRIDAY, "20:00"),
          partySize,
          customer: { name, phone: "+39 333 1234567" },
          tableIds,
          notifyGuest: false,
        },
        fx.session,
      );
    const near = await staffBooking([oven1, oven2], "Forno", 4);
    expect(near.status, JSON.stringify(near.body)).toBe(201);
    expect(near.body.tables.map((x) => x.name).sort()).toEqual(["1", "2"]);

    // table A is still free, so the slot is open, but the guest wants 2
    const again = await staffBooking([oven2], "Altro", 2);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("table_taken");
  });
  it("leaves bookings without a table, and slots open, when staff seat by hand", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    const policy = await api<{ autoAssignTables: boolean }>(
      t,
      "PUT",
      `${base}/policy`,
      { autoAssignTables: false },
      fx.session,
    );
    expect(policy.body.autoAssignTables).toBe(false);
    const only = await api<{ id: string }>(
      t,
      "POST",
      `${base}/tables`,
      { name: "1", maxCovers: 2 },
      fx.session,
    );
    const book = (name: string) =>
      api<Booking>(t, "POST", `/api/public/v1/restaurants/${fx.slug}/bookings`, {
        ...guestBooking(fx, { partySize: 2 }),
        guest: { name, email: `${name}@example.com`, phone: "+39 333 1234567" },
      });
    const tablesOf = async (id: string) =>
      (await api<Booking>(t, "GET", `${base}/bookings/${id}`, undefined, fx.session)).body.tables;
    const first = await book("uno");
    expect(first.status).toBe(201);
    expect(await tablesOf(first.body.id)).toEqual([]);

    // seated by hand; the next party still gets in (only the guest limit counts)
    const seat = await api(
      t,
      "PUT",
      `${base}/bookings/${first.body.id}/tables`,
      { tableIds: [only.body.id] },
      fx.session,
    );
    expect(seat.status).toBe(200);
    const second = await book("due");
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(await tablesOf(second.body.id)).toEqual([]);
  });
});
