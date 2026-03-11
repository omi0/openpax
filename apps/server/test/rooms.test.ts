import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createFixture,
  createTestApp,
  type Fixture,
  FRIDAY,
  guestBooking,
  romeInstant,
  signUp,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Availability {
  slots: Array<{
    startLocal: string;
    available: boolean;
    reason?: string;
    remainingCovers: number | null;
  }>;
}
interface Room {
  id: string;
  name: string;
  seats: number | null;
  active: boolean;
  sortOrder: number;
}

async function addRoom(fx: Fixture, name: string, seats: number | null, active = true) {
  const res = await api<Room>(
    t,
    "POST",
    `/api/v1/restaurants/${fx.restaurantId}/areas`,
    { name, seats, active, sortOrder: 0 },
    fx.session,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function setRoom(fx: Fixture, room: Room, patch: Partial<Room>) {
  const res = await api<Room>(
    t,
    "PUT",
    `/api/v1/restaurants/${fx.restaurantId}/areas/${room.id}`,
    {
      name: room.name,
      seats: room.seats,
      active: room.active,
      sortOrder: room.sortOrder,
      ...patch,
    },
    fx.session,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

async function availability(fx: Fixture, partySize: number, areaId?: string) {
  const res = await api<Availability>(
    t,
    "GET",
    `/api/public/v1/restaurants/${fx.slug}/availability?date=${FRIDAY}&partySize=${partySize}${
      areaId ? `&areaId=${areaId}` : ""
    }`,
  );
  expect(res.status).toBe(200);
  return Object.fromEntries(res.body.slots.map((s) => [s.startLocal, s]));
}

/** The default policy caps parties at 10; the room tests seat whole groups at once. */
async function allowLargeParties(fx: Fixture) {
  const res = await api(
    t,
    "PUT",
    `/api/v1/restaurants/${fx.restaurantId}/policy`,
    { maxPartySize: 100 },
    fx.session,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function book(fx: Fixture, time: string, partySize: number) {
  const res = await api(
    t,
    "POST",
    `/api/public/v1/restaurants/${fx.slug}/bookings`,
    guestBooking(fx, {
      startsAt: romeInstant(FRIDAY, time),
      partySize,
      guest: {
        ...guestBooking(fx).guest,
        name: `Party ${time}`,
        email: `p${time.replace(":", "")}@example.com`,
        phone: `+39 333 ${time.replace(":", "")}0000`.slice(0, 16),
      },
    }),
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

describe("rooms cap the house", () => {
  it("stops bookings once the open rooms are full, and frees seats when a party leaves", async () => {
    // no pacing limit: only the rooms decide
    const fx = await createFixture(t, { maxCoversPerSlot: null });
    await allowLargeParties(fx);
    await addRoom(fx, "Sala", 30);
    await addRoom(fx, "Terrazza", 20);
    await book(fx, "19:00", 30); // until 21:00
    await book(fx, "19:30", 16); // until 21:30

    let byTime = await availability(fx, 4);
    expect(byTime["20:00"]).toMatchObject({ available: true, remainingCovers: 4 });
    byTime = await availability(fx, 5);
    expect(byTime["20:00"]).toMatchObject({ available: false, reason: "full" });
    expect(byTime["21:00"]).toMatchObject({ available: true, remainingCovers: 34 });

    const res = await api(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, { partySize: 5 }),
    );
    expect(res.status).toBe(409);
  });

  it("closing a room removes its seats and its tables; asking for it is refused", async () => {
    const fx = await createFixture(t, { maxCoversPerSlot: null });
    const sala = await addRoom(fx, "Sala", 10);
    const terrazza = await addRoom(fx, "Terrazza", 10);
    await book(fx, "20:00", 10);

    let byTime = await availability(fx, 8);
    expect(byTime["20:00"]?.available).toBe(true);

    await setRoom(fx, terrazza, { active: false });
    byTime = await availability(fx, 8);
    expect(byTime["20:00"]).toMatchObject({ available: false, reason: "full" });
    expect((await availability(fx, 2, terrazza.id))["20:00"]).toMatchObject({
      available: false,
      reason: "room_closed",
    });
    expect((await availability(fx, 2, sala.id))["22:00"]?.available).toBe(true);

    // tables: the only table that fits four sits on the closed terrace
    const table = await api(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/tables`,
      { name: "T1", areaId: terrazza.id, minCovers: 1, maxCovers: 4 },
      fx.session,
    );
    expect(table.status, JSON.stringify(table.body)).toBe(201);
    await setRoom(fx, sala, { seats: 100 });
    expect((await availability(fx, 4))["22:00"]).toMatchObject({
      available: false,
      reason: "no_table",
    });
    await setRoom(fx, terrazza, { active: true });
    expect((await availability(fx, 4))["22:00"]?.available).toBe(true);
  });

  it("does not enforce a total while an open room has no seat count", async () => {
    const fx = await createFixture(t, { maxCoversPerSlot: null });
    await allowLargeParties(fx);
    await addRoom(fx, "Sala", 10);
    await addRoom(fx, "Giardino", null);
    await book(fx, "20:00", 40);
    expect((await availability(fx, 4))["20:00"]).toMatchObject({
      available: true,
      remainingCovers: null,
    });
  });

  it("creates the first room from the seats given at sign-up", async () => {
    const session = await signUp(t, `seats-${Math.random().toString(36).slice(2)}@example.com`);
    const created = await api<{ id: string }>(
      t,
      "POST",
      "/api/v1/restaurants",
      { name: "Osteria Posti", timezone: "Europe/Rome", locale: "it", seats: 42 },
      session,
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const rooms = await api<Room[]>(
      t,
      "GET",
      `/api/v1/restaurants/${created.body.id}/areas`,
      undefined,
      session,
    );
    expect(rooms.body).toMatchObject([{ name: "Sala", seats: 42, active: true }]);
  });
});
