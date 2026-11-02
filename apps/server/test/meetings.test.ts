import { booking, customer } from "@openpax/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refreshMeetingOfBooking } from "../src/modules/meetings/service.js";
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

describe("host meetings, edge cases", () => {
  it("refuses a meeting after the event", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const res = await api<{ id: string }>(
      t,
      "POST",
      `${base(fx)}/bookings`,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "20:00"),
        partySize: 25,
        customer: { name: "Evento Stesso Giorno", phone: "+39 340 4444444" },
        source: "phone",
        ignoreCapacity: true,
        notifyGuest: false,
      },
      fx.session,
    );
    const ok = await schedule(fx, res.body.id, "17:00");
    expect(ok.status).toBe(200);

    const late = await api<{ id: string }>(
      t,
      "POST",
      `${base(fx)}/bookings`,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant("2026-06-11", "20:00"),
        partySize: 25,
        customer: { name: "Evento Prima", phone: "+39 340 5555555" },
        source: "phone",
        ignoreCapacity: true,
        notifyGuest: false,
      },
      fx.session,
    );
    const after = await schedule(fx, late.body.id, "15:00");
    expect(after.status).toBe(400);
    expect(after.body.code).toBe("meeting_after_event");
  });

  it("sends the host an updated invite when the event changes", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const bookingId = await groupBooking(fx);
    await schedule(fx, bookingId, "15:00");
    await t.processEvents();
    const before = hostEmails().length;
    const moved = await api(
      t,
      "PATCH",
      `${base(fx)}/bookings/${bookingId}`,
      { partySize: 30, ignoreCapacity: true, notifyGuest: false },
      fx.session,
    );
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    await t.processEvents();
    const update = hostEmails().slice(before);
    expect(update).toHaveLength(1);
    expect(update[0]?.calendar?.ics).toContain("SEQUENCE:1");
    expect(update[0]?.subject).toContain("30");
  });

  it("cancels the meeting when the group shrinks below the size or the event moves before it", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const meetingOf = async (id: string) =>
      (
        await api<Meeting | null>(
          t,
          "GET",
          `${base(fx)}/bookings/${id}/meeting`,
          undefined,
          fx.session,
        )
      ).body;
    const change = async (id: string, body: Record<string, unknown>) => {
      const res = await api(
        t,
        "PATCH",
        `${base(fx)}/bookings/${id}`,
        { ...body, ignoreCapacity: true, notifyGuest: false },
        fx.session,
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      await t.processEvents();
    };

    const smaller = await groupBooking(fx);
    await schedule(fx, smaller, "15:00");
    await t.processEvents();
    await change(smaller, { partySize: 8 });
    expect(await meetingOf(smaller)).toBeNull();
    expect(hostEmails().at(-1)?.calendar?.method).toBe("CANCEL");

    const earlier = await groupBooking(fx, 25, "20:00");
    await schedule(fx, earlier, "16:00");
    await t.processEvents();
    await change(earlier, { startsAt: romeInstant(FRIDAY, "12:00") });
    expect(await meetingOf(earlier)).toBeNull();
    expect(hostEmails().at(-1)?.calendar?.method).toBe("CANCEL");
  });

  it("keeps a booked meeting when the minimum is raised or cleared later", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const id = await groupBooking(fx);
    await schedule(fx, id, "15:00");
    await t.processEvents();
    for (const meetingMinPartySize of [30, null]) {
      await api(t, "PUT", `${base(fx)}/policy`, { meetingMinPartySize }, fx.session);
      const res = await api(
        t,
        "PATCH",
        `${base(fx)}/bookings/${id}`,
        { notes: `Min ${meetingMinPartySize}`, notifyGuest: false },
        fx.session,
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      await t.processEvents();
      const meeting = await api(
        t,
        "GET",
        `${base(fx)}/bookings/${id}/meeting`,
        undefined,
        fx.session,
      );
      expect(meeting.body).not.toBeNull();
    }
    expect(hostEmails().at(-1)?.calendar?.method).toBe("REQUEST");
  });

  it("sends one invite when the same booking change is delivered twice", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const id = await groupBooking(fx);
    await schedule(fx, id, "15:00");
    await t.processEvents();
    const before = hostEmails().length;
    const event = { eventId: crypto.randomUUID() };
    await refreshMeetingOfBooking(t.ctx, fx.restaurantId, id, event);
    await refreshMeetingOfBooking(t.ctx, fx.restaurantId, id, event);
    await t.processEvents();
    expect(hostEmails()).toHaveLength(before + 1);
  });

  it("does not count slots past the start of the event in the calendar", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const before = romeInstant(FRIDAY, "16:00");
    const res = await api<{ days: Array<{ free: number }> }>(
      t,
      "GET",
      `${base(fx)}/meetings/days?from=${FRIDAY}&to=${FRIDAY}&before=${encodeURIComponent(before)}`,
      undefined,
      fx.session,
    );
    expect(res.body.days[0]?.free).toBe(2); // 15:00 and 15:30 are over by 16:00
  });

  it("blocks slots that overlap a booked meeting when windows overlap", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    await api(
      t,
      "PUT",
      `${base(fx)}/policy`,
      {
        meetingHours: {
          fri: [
            { start: "15:00", end: "16:00" },
            { start: "15:15", end: "16:00" },
            { start: "15:00", end: "16:00" },
          ],
        },
      },
      fx.session,
    );
    const day = await slotsOn(fx, FRIDAY);
    expect(day.body.slots.map((s) => s.startLocal)).toEqual(["15:00", "15:15", "15:30"]);
    const bookingId = await groupBooking(fx);
    expect((await schedule(fx, bookingId, "15:00")).status).toBe(200);
    const after = await slotsOn(fx, FRIDAY);
    expect(after.body.slots.map((s) => [s.startLocal, s.available])).toEqual([
      ["15:00", false],
      ["15:15", false],
      ["15:30", true],
    ]);
  });

  it("books a slot after midnight from the previous day's window", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    await api(
      t,
      "PUT",
      `${base(fx)}/policy`,
      { meetingHours: { thu: [{ start: "23:30", end: "00:30" }] } },
      fx.session,
    );
    const thu = await slotsOn(fx, "2026-06-11");
    expect(thu.body.slots.map((s) => s.startLocal)).toEqual(["23:30", "00:00"]);
    const bookingId = await groupBooking(fx);
    const res = await schedule(fx, bookingId, "00:00");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe("host meeting calendar", () => {
  it("counts free slots per day: zero on days off, closures and full days", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    await api(
      t,
      "POST",
      `${base(fx)}/schedule-exceptions`,
      { date: "2026-06-19", closed: true, reason: "Holiday" },
      fx.session,
    );
    const bookingId = await groupBooking(fx);
    await schedule(fx, bookingId, "15:00");
    const res = await api<{ days: Array<{ date: string; closed: boolean; free: number }> }>(
      t,
      "GET",
      `${base(fx)}/meetings/days?from=2026-06-11&to=2026-06-19`,
      undefined,
      fx.session,
    );
    expect(res.status).toBe(200);
    const byDate = Object.fromEntries(res.body.days.map((d) => [d.date, d]));
    expect(res.body.days).toHaveLength(9);
    expect(byDate["2026-06-11"]?.free).toBe(0); // Thursday: no hours
    expect(byDate[FRIDAY]?.free).toBe(4); // five slots, one taken
    expect(byDate["2026-06-19"]).toMatchObject({ closed: true, free: 0 });
  });
});

describe("host calendar subscription", () => {
  const feedPath = (url: string) => new URL(url).pathname;
  const getFeed = (url: string) => api<string>(t, "GET", feedPath(url));
  // a changed or disabled link answers with an empty calendar, so calendar apps drop the copy
  const isEmpty = (res: { status: number; body: string }) =>
    res.status === 200 && !res.body.includes("BEGIN:VEVENT");
  const setFeed = (fx: Fixture, method: "POST" | "DELETE", session = fx.session) =>
    api<{ url: string | null }>(t, method, `${base(fx)}/meetings/feed`, undefined, session);

  const rotateFeed = (fx: Fixture, session = fx.session) =>
    api<{ url: string | null }>(t, "POST", `${base(fx)}/meetings/feed/rotate`, undefined, session);

  it("serves the live meetings behind a secret link that can be changed and turned off", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const off = await api<{ url: string | null }>(
      t,
      "GET",
      `${base(fx)}/meetings/feed`,
      undefined,
      fx.session,
    );
    expect(off.body.url).toBeNull();

    const on = await setFeed(fx, "POST");
    expect(on.status).toBe(200);
    const url = on.body.url ?? "";
    expect(url).toMatch(/\/api\/public\/v1\/meetings\/feed\/[\w-]+\.ics$/);

    const bookingId = await groupBooking(fx);
    const meeting = await schedule(fx, bookingId, "15:30");
    const other = await groupBooking(fx, 30, "21:00");
    await schedule(fx, other, "16:00");
    await api(t, "DELETE", `${base(fx)}/bookings/${other}/meeting`, undefined, fx.session);

    const res = await t.app.request(feedPath(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const ics = await res.text();
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain(`UID:${meeting.body.id}@openpax`);
    expect(ics).toContain("DTSTART:20260612T133000Z");
    expect(ics).toContain("SUMMARY:Appuntamento con Laura Neri");
    expect(ics).not.toContain("ATTENDEE");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1); // the cancelled one is gone

    expect(isEmpty(await getFeed(url.replace(/[\w-]+\.ics$/, `${"x".repeat(32)}.ics`)))).toBe(true);
    expect((await getFeed(url.replace(/[\w-]+\.ics$/, "short.ics"))).status).toBe(400);

    // creating again hands back the same link, so a stale page cannot cut it off
    expect((await setFeed(fx, "POST")).body.url).toBe(url);

    const rotated = await rotateFeed(fx);
    expect(rotated.body.url).not.toBe(url);
    expect(isEmpty(await getFeed(url))).toBe(true);
    expect((await getFeed(rotated.body.url ?? "")).body).toContain("BEGIN:VEVENT");

    // the booking is cancelled: its meeting leaves the feed before the outbox cancels it
    await api(
      t,
      "POST",
      `${base(fx)}/bookings/${bookingId}/actions`,
      { action: "cancel" },
      fx.session,
    );
    expect(isEmpty(await getFeed(rotated.body.url ?? ""))).toBe(true);

    const disabled = await setFeed(fx, "DELETE");
    expect(disabled.body.url).toBeNull();
    expect(isEmpty(await getFeed(rotated.body.url ?? ""))).toBe(true);
  });

  it("is a valid calendar even with no meetings", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const url = (await setFeed(fx, "POST")).body.url ?? "";
    const { body } = await getFeed(url);
    expect(body).not.toContain("BEGIN:VEVENT");
    expect(body).toContain("BEGIN:VTIMEZONE"); // RFC 5545 wants one component
  });

  it("cannot rotate a link that does not exist", async () => {
    const fx = await createFixture(t);
    expect((await rotateFeed(fx)).status).toBe(404);
  });

  it("keeps booking notes out and guest input cannot add lines", async () => {
    const fx = await createFixture(t);
    await setUp(fx);
    const url = (await setFeed(fx, "POST")).body.url ?? "";
    const bookingId = await groupBooking(fx);
    await schedule(fx, bookingId, "15:30");
    const hostile = "Laura\rEND:VEVENT\rBEGIN:VEVENT\rSUMMARY:fake";
    await t.ctx.db.update(customer).set({ name: hostile });
    await t.ctx.db
      .update(booking)
      .set({ notes: "allergia alle noci" })
      .where(eq(booking.id, bookingId));
    const { body } = await getFeed(url);
    expect(body).not.toContain("noci");
    expect(body.replace(/\r\n/g, "")).not.toContain("\r");
    expect(body.match(/^BEGIN:VEVENT/gm)).toHaveLength(1);
  });

  it("is only for those who manage the settings", async () => {
    const fx = await createFixture(t);
    const staff = await addMember(t, fx, "staff");
    expect((await setFeed(fx, "POST", staff)).status).toBe(403);
    expect((await rotateFeed(fx, staff)).status).toBe(403);
    expect((await setFeed(fx, "DELETE", staff)).status).toBe(403);
  });
});
