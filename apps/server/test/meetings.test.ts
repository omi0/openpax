import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  api,
  createFixture,
  createTestApp,
  type Fixture,
  FRIDAY,
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

interface Slots {
  closed: boolean;
  slots: Array<{ startsAt: string; startLocal: string; available: boolean }>;
}
interface Meeting {
  id: string;
  bookingId: string;
  startsAt: string;
  endsAt: string;
}

const HOST = "host@example.com";
const base = (fx: Fixture) => `/api/v1/restaurants/${fx.restaurantId}`;

/** Meetings for groups of 21+, Fridays 15:00–17:30, the host invited by email. */
async function setUp(fx: Fixture, hostEmail: string | null = HOST) {
  await api(
    t,
    "PUT",
    `${base(fx)}/notification-providers/email`,
    { providerId: "test-email", config: { apiKey: "secret-key-1234", from: "T <t@example.com>" } },
    fx.session,
  );
  const policy = await api(
    t,
    "PUT",
    `${base(fx)}/policy`,
    {
      meetingMinPartySize: 21,
      meetingHours: { fri: [{ start: "15:00", end: "17:30" }] },
      meetingHostName: "Host",
      meetingHostEmail: hostEmail,
    },
    fx.session,
  );
  expect(policy.status, JSON.stringify(policy.body)).toBe(200);
}

async function groupBooking(fx: Fixture, partySize = 25, time = "20:00") {
  const res = await api<{ id: string }>(
    t,
    "POST",
    `${base(fx)}/bookings`,
    {
      serviceId: fx.serviceId,
      startsAt: romeInstant("2026-06-19", time),
      partySize,
      customer: { name: "Laura Neri", phone: "+39 340 2222222" },
      source: "phone",
      ignoreCapacity: true,
      notifyGuest: false,
    },
    fx.session,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id;
}

const slotsOn = (fx: Fixture, date: string) =>
  api<Slots>(t, "GET", `${base(fx)}/meetings/slots?date=${date}`, undefined, fx.session);

const schedule = (fx: Fixture, bookingId: string, time: string, session = fx.session) =>
  api<Meeting & { code?: string }>(
    t,
    "PUT",
    `${base(fx)}/bookings/${bookingId}/meeting`,
    { startsAt: romeInstant(FRIDAY, time) },
    session,
  );

const hostEmails = () => t.sentEmails.filter((e) => e.to === HOST);

describe("host meetings", () => {
  it("offers 30-minute slots inside the hours, and none on other days or closures", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const fri = await slotsOn(fx, FRIDAY);
    expect(fri.status).toBe(200);
    expect(fri.body.slots.map((s) => s.startLocal)).toEqual([
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
    ]);
    expect(fri.body.slots.every((s) => s.available)).toBe(true);

    const sat = await slotsOn(fx, "2026-06-13");
    expect(sat.body.slots).toEqual([]);

    await api(
      t,
      "POST",
      `${base(fx)}/schedule-exceptions`,
      { date: FRIDAY, closed: true, reason: "Holiday" },
      fx.session,
    );
    const closed = await slotsOn(fx, FRIDAY);
    expect(closed.body).toMatchObject({ closed: true, slots: [] });
  });

  it("books a slot for a large group, invites the host and hides the slot", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const bookingId = await groupBooking(fx);
    await t.processEvents();
    const before = hostEmails().length;

    const res = await schedule(fx, bookingId, "15:30");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.startsAt).toBe(new Date(romeInstant(FRIDAY, "15:30")).toISOString());
    expect(new Date(res.body.endsAt).getTime() - new Date(res.body.startsAt).getTime()).toBe(
      30 * 60_000,
    );

    await t.processEvents();
    const invites = hostEmails().slice(before);
    expect(invites).toHaveLength(1);
    expect(invites[0]?.subject).toContain("Laura Neri");
    expect(invites[0]?.calendar?.method).toBe("REQUEST");
    expect(invites[0]?.calendar?.ics).toContain("DTSTART:20260612T133000Z");
    expect(invites[0]?.calendar?.ics).toContain(`ATTENDEE;CN="Host"`);

    const fri = await slotsOn(fx, FRIDAY);
    expect(fri.body.slots.find((s) => s.startLocal === "15:30")?.available).toBe(false);

    const other = await groupBooking(fx, 30, "21:00");
    const taken = await schedule(fx, other, "15:30");
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("meeting_slot_taken");

    const got = await api<Meeting | null>(
      t,
      "GET",
      `${base(fx)}/bookings/${bookingId}/meeting`,
      undefined,
      fx.session,
    );
    expect(got.body?.id).toBe(res.body.id);

    const list = await api<Array<Meeting & { customerName: string; partySize: number }>>(
      t,
      "GET",
      `${base(fx)}/meetings?from=${FRIDAY}&to=${FRIDAY}`,
      undefined,
      fx.session,
    );
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ customerName: "Laura Neri", partySize: 25 });
  });

  it("refuses small groups, times outside the hours, and works for staff", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const small = await groupBooking(fx, 20);
    const refused = await schedule(fx, small, "15:00");
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("meeting_not_allowed");

    const big = await groupBooking(fx, 22, "21:00");
    const outside = await schedule(fx, big, "18:00");
    expect(outside.status).toBe(400);
    expect(outside.body.code).toBe("meeting_not_a_slot");

    const staff = await addMember(t, fx, "staff");
    const ok = await schedule(fx, big, "17:00", staff);
    expect(ok.status).toBe(200);
  });

  it("moves the meeting with an updated invite and cancels it with the booking", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const bookingId = await groupBooking(fx);
    const first = await schedule(fx, bookingId, "15:00");
    await t.processEvents();
    const moved = await schedule(fx, bookingId, "16:00");
    expect(moved.status).toBe(200);
    expect(moved.body.id).toBe(first.body.id);
    await t.processEvents();
    const last = hostEmails().at(-1);
    expect(last?.calendar?.ics).toContain("SEQUENCE:1");
    expect(last?.calendar?.ics).toContain("DTSTART:20260612T140000Z");

    const free = await slotsOn(fx, FRIDAY);
    expect(free.body.slots.find((s) => s.startLocal === "15:00")?.available).toBe(true);

    const cancelled = await api(
      t,
      "POST",
      `${base(fx)}/bookings/${bookingId}/actions`,
      { action: "cancel" },
      fx.session,
    );
    expect(cancelled.status).toBe(200);
    await t.processEvents();
    expect(hostEmails().at(-1)?.calendar?.method).toBe("CANCEL");
    const after = await api<Meeting | null>(
      t,
      "GET",
      `${base(fx)}/bookings/${bookingId}/meeting`,
      undefined,
      fx.session,
    );
    expect(after.body).toBeNull();
    const again = await slotsOn(fx, FRIDAY);
    expect(again.body.slots.find((s) => s.startLocal === "16:00")?.available).toBe(true);
  });

  it("books the meeting without an invite while the host has no email", async () => {
    const fx = await createFixture(t);
    await setUp(fx, null);
    const bookingId = await groupBooking(fx);
    const before = t.sentEmails.length;
    const res = await schedule(fx, bookingId, "15:00");
    expect(res.status).toBe(200);
    await t.processEvents();
    expect(t.sentEmails.slice(before).some((e) => e.calendar)).toBe(false);
  });
});
