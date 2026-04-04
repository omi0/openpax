import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createFixture,
  createTestApp,
  type Fixture,
  FRIDAY,
  guestBooking,
  NOW,
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

interface PublicEntry {
  id: string;
  status: string;
  offer: { serviceName: string; startsAt: string; expiresAt: string } | null;
  canAccept: boolean;
  manageUrl: string;
  bookingManageUrl: string | null;
}
interface Entry {
  id: string;
  status: string;
  partySize: number;
  serviceDate: string;
  offer: { serviceId: string; startsAt: string; expiresAt: string } | null;
  bookingId: string | null;
  customer: { name: string; email: string | null };
}

const tokenOf = (e: PublicEntry) => e.manageUrl.split("/").pop() ?? "";

async function enableWaitlist(fx: Fixture, extra: Record<string, unknown> = {}) {
  const res = await api(
    t,
    "PUT",
    `/api/v1/restaurants/${fx.restaurantId}/policy`,
    { waitlistEnabled: true, ...extra },
    fx.session,
  );
  expect(res.status).toBe(200);
  await api(
    t,
    "PUT",
    `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
    {
      providerId: "test-email",
      config: { apiKey: "secret-key-1234", from: "Test <t@example.com>" },
    },
    fx.session,
  );
}

function joinBody(overrides: Record<string, unknown> = {}) {
  return {
    serviceDate: FRIDAY,
    partySize: 4,
    preferredTime: "20:00",
    guest: {
      name: "Giulia Russo",
      email: "giulia@example.com",
      phone: "+39 340 1112223",
      locale: "en",
    },
    ...overrides,
  };
}

describe("waitlist", () => {
  it("is off until the restaurant enables it", async () => {
    const fx = await createFixture(t);
    const res = await api<{ code: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/waitlist`,
      joinBody(),
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("waitlist_disabled");
    const cfg = await api<{ policy: { waitlistEnabled: boolean } }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/widget-config`,
    );
    expect(cfg.body.policy.waitlistEnabled).toBe(false);
  });

  it("lets a guest join, staff offer a slot, and the guest accept it into a confirmed booking", async () => {
    const fx = await createFixture(t);
    await enableWaitlist(fx);
    const publicPath = `/api/public/v1/restaurants/${fx.slug}/waitlist`;
    const staffPath = `/api/v1/restaurants/${fx.restaurantId}/waitlist`;

    const before = t.sentEmails.length;
    const joined = await api<PublicEntry>(t, "POST", publicPath, joinBody());
    expect(joined.status, JSON.stringify(joined.body)).toBe(201);
    expect(joined.body).toMatchObject({ status: "waiting", offer: null, canAccept: false });
    expect(joined.body.manageUrl).toContain(`/book/${fx.slug}/waitlist/`);

    await t.processEvents();
    const joinedMails = t.sentEmails.slice(before);
    expect(joinedMails.map((m) => m.to).sort()).toEqual([
      "giulia@example.com",
      "restaurant@example.com",
    ]);
    const guestMail = joinedMails.find((m) => m.to === "giulia@example.com");
    expect(guestMail?.subject).toBe("You're on the waitlist at Trattoria Test");
    expect(guestMail?.text).toContain(joined.body.manageUrl);
    expect(guestMail?.text).toContain("Friday 12 June 2026, 20:00");
    expect(joinedMails.find((m) => m.to === "restaurant@example.com")?.subject).toContain(
      "Lista d'attesa",
    );

    const list = await api<{ items: Entry[]; total: number }>(
      t,
      "GET",
      `${staffPath}?date=${FRIDAY}`,
      undefined,
      fx.session,
    );
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      status: "waiting",
      partySize: 4,
      customer: { name: "Giulia Russo" },
    });
    const entryId = list.body.items[0]?.id ?? "";

    const offered = await api<Entry>(
      t,
      "POST",
      `${staffPath}/${entryId}/offer`,
      { serviceId: fx.serviceId, startsAt: romeInstant(FRIDAY, "20:30") },
      fx.session,
    );
    expect(offered.status, JSON.stringify(offered.body)).toBe(200);
    expect(offered.body.status).toBe("offered");
    // default validity: two hours from the frozen clock
    expect(offered.body.offer?.expiresAt).toBe(
      new Date(NOW.getTime() + 120 * 60_000).toISOString(),
    );
    await t.processEvents();
    const offerMail = t.sentEmails.find((m) => m.subject === "A table is free at Trattoria Test");
    expect(offerMail?.to).toBe("giulia@example.com");
    expect(offerMail?.text).toContain("20:30");
    expect(offerMail?.text).not.toContain("Booking code");

    const token = tokenOf(joined.body);
    const seen = await api<PublicEntry>(t, "GET", `/api/public/v1/waitlist/${token}`);
    expect(seen.body).toMatchObject({ status: "offered", canAccept: true });
    expect(seen.body.offer?.serviceName).toBe("Cena");

    const accepted = await api<{ status: string; partySize: number; confirmationCode: string }>(
      t,
      "POST",
      `/api/public/v1/waitlist/${token}/accept`,
    );
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
    expect(accepted.body).toMatchObject({ status: "confirmed", partySize: 4 });

    const after = await api<PublicEntry>(t, "GET", `/api/public/v1/waitlist/${token}`);
    expect(after.body.status).toBe("booked");
    expect(after.body.bookingManageUrl).toContain("/manage/");
    // tapping "confirm" again answers with the same booking instead of an error
    const again = await api<{ confirmationCode: string }>(
      t,
      "POST",
      `/api/public/v1/waitlist/${token}/accept`,
    );
    expect(again.status).toBe(201);
    expect(again.body.confirmationCode).toBe(accepted.body.confirmationCode);

    // the booking exists as a widget booking for the same guest
    const bookings = await api<{ items: Array<{ source: string; customer: { name: string } }> }>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/bookings?date=${FRIDAY}`,
      undefined,
      fx.session,
    );
    expect(bookings.body.items).toHaveLength(1);
    expect(bookings.body.items[0]).toMatchObject({
      source: "widget",
      customer: { name: "Giulia Russo" },
    });
  });

  it("offers a freed table to the next guest automatically and moves on when the offer lapses", async () => {
    // one table of two per slot, so the date fills up
    const fx = await createFixture(t, { maxCoversPerSlot: 2 });
    await enableWaitlist(fx);
    const staff = `/api/v1/restaurants/${fx.restaurantId}/bookings`;
    const created = await api<{ id: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx),
    );
    expect(created.status).toBe(201);
    // 20:00 is now full for a party of two
    const avail = await api<{ slots: Array<{ startLocal: string; available: boolean }> }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/availability?date=${FRIDAY}&partySize=2`,
    );
    expect(avail.body.slots.find((s) => s.startLocal === "20:00")?.available).toBe(false);

    const first = await api<PublicEntry>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/waitlist`,
      joinBody({
        partySize: 2,
        preferredTime: "20:00",
        guest: { name: "Anna Neri", email: "anna@example.com" },
      }),
    );
    const second = await api<PublicEntry>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/waitlist`,
      joinBody({
        partySize: 2,
        preferredTime: "20:00",
        guest: { name: "Paolo Verdi", email: "paolo@example.com" },
      }),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    await t.processEvents();

    // the 20:00 guest cancels: Anna, first in line, gets the freed slot
    await api(t, "POST", `${staff}/${created.body.id}/actions`, { action: "cancel" }, fx.session);
    await t.processEvents();
    const anna = await api<PublicEntry>(t, "GET", `/api/public/v1/waitlist/${tokenOf(first.body)}`);
    expect(anna.body.status).toBe("offered");
    expect(anna.body.offer?.startsAt).toBe(romeInstant(FRIDAY, "20:00"));
    const paolo = await api<PublicEntry>(
      t,
      "GET",
      `/api/public/v1/waitlist/${tokenOf(second.body)}`,
    );
    expect(paolo.body.status).toBe("waiting");

    // Anna never answers: the expiry job runs, her offer lapses and Paolo gets his turn
    expect(t.jobs.sent.some((j) => j.name === "waitlist.expire")).toBe(true);
    await t.jobs.flush(t.ctx);
    await t.processEvents();
    const annaAfter = await api<PublicEntry>(
      t,
      "GET",
      `/api/public/v1/waitlist/${tokenOf(first.body)}`,
    );
    expect(annaAfter.body.status).toBe("expired");
    const paoloAfter = await api<PublicEntry>(
      t,
      "GET",
      `/api/public/v1/waitlist/${tokenOf(second.body)}`,
    );
    expect(paoloAfter.body.status).toBe("offered");

    // Paolo declines from his link
    const left = await api<PublicEntry>(
      t,
      "POST",
      `/api/public/v1/waitlist/${tokenOf(second.body)}/leave`,
    );
    expect(left.body.status).toBe("cancelled");
  });

  it("books once when the guest accepts the same offer several times at once", async () => {
    const fx = await createFixture(t, { maxCoversPerSlot: 2 });
    await enableWaitlist(fx);
    const staff = `/api/v1/restaurants/${fx.restaurantId}`;
    const joined = await api<PublicEntry>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/waitlist`,
      joinBody({ partySize: 2, guest: { name: "Anna Neri", email: "anna2@example.com" } }),
    );
    expect(joined.status).toBe(201);
    const offered = await api(
      t,
      "POST",
      `${staff}/waitlist/${joined.body.id}/offer`,
      { serviceId: fx.serviceId, startsAt: romeInstant(FRIDAY, "20:00") },
      fx.session,
    );
    expect(offered.status).toBe(200);
    const accepts = await Promise.all(
      Array.from({ length: 6 }, () =>
        api<{ id: string }>(t, "POST", `/api/public/v1/waitlist/${tokenOf(joined.body)}/accept`),
      ),
    );
    expect(accepts.map((a) => a.status)).toEqual(Array.from({ length: 6 }, () => 201));
    expect(new Set(accepts.map((a) => a.body.id)).size).toBe(1);
    const list = await api<{ total: number }>(
      t,
      "GET",
      `${staff}/bookings?date=${FRIDAY}`,
      undefined,
      fx.session,
    );
    expect(list.body.total).toBe(1);
    const entry = await api<PublicEntry>(
      t,
      "GET",
      `/api/public/v1/waitlist/${tokenOf(joined.body)}`,
    );
    expect(entry.body.status).toBe("booked");
    expect(entry.body.bookingManageUrl).not.toBeNull();
  });

  it("offers the next guest in line as soon as an offer is accepted", async () => {
    const fx = await createFixture(t, { maxCoversPerSlot: 2 });
    await enableWaitlist(fx);
    const staff = `/api/v1/restaurants/${fx.restaurantId}`;
    // every dinner slot taken by a party of two
    const taken: Record<string, string> = {};
    for (const time of ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"]) {
      const res = await api<{ id: string }>(
        t,
        "POST",
        `/api/public/v1/restaurants/${fx.slug}/bookings`,
        guestBooking(fx, {
          startsAt: romeInstant(FRIDAY, time),
          guest: {
            name: "Full",
            email: `full-${time.replace(":", "")}@example.com`,
            phone: `+39 333 2${time.replace(":", "")}00`,
          },
        }),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      taken[time] = res.body.id;
    }
    const anna = await api<PublicEntry>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/waitlist`,
      joinBody({ partySize: 2, guest: { name: "Anna", email: "anna3@example.com" } }),
    );
    const paolo = await api<PublicEntry>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/waitlist`,
      joinBody({ partySize: 2, guest: { name: "Paolo", email: "paolo3@example.com" } }),
    );
    await t.processEvents();
    // two tables free up while Anna's offer is open: Paolo has to wait for his turn
    await api(
      t,
      "POST",
      `${staff}/bookings/${taken["20:00"]}/actions`,
      { action: "cancel" },
      fx.session,
    );
    await api(
      t,
      "POST",
      `${staff}/bookings/${taken["21:00"]}/actions`,
      { action: "cancel" },
      fx.session,
    );
    await t.processEvents();
    const status = async (e: PublicEntry) =>
      (await api<PublicEntry>(t, "GET", `/api/public/v1/waitlist/${tokenOf(e)}`)).body.status;
    expect(await status(anna.body)).toBe("offered");
    expect(await status(paolo.body)).toBe("waiting");
    // Anna accepts: Paolo gets the other free table without anyone else cancelling
    const accepted = await api(t, "POST", `/api/public/v1/waitlist/${tokenOf(anna.body)}/accept`);
    expect(accepted.status).toBe(201);
    await t.processEvents();
    expect(await status(anna.body)).toBe("booked");
    expect(await status(paolo.body)).toBe("offered");
  });

  it("lets staff add a caller and book them straight in", async () => {
    const fx = await createFixture(t);
    const staffPath = `/api/v1/restaurants/${fx.restaurantId}/waitlist`;
    // staff can use the list even when guests cannot
    const added = await api<Entry>(
      t,
      "POST",
      staffPath,
      {
        serviceDate: FRIDAY,
        partySize: 6,
        customer: { name: "Famiglia Conti", phone: "+39 333 9998887" },
        source: "phone",
        notes: "Compleanno",
      },
      fx.session,
    );
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.status).toBe("waiting");

    const booked = await api<{ status: string; partySize: number; source: string; notes: string }>(
      t,
      "POST",
      `${staffPath}/${added.body.id}/book`,
      { serviceId: fx.serviceId, startsAt: romeInstant(FRIDAY, "19:30") },
      fx.session,
    );
    expect(booked.status, JSON.stringify(booked.body)).toBe(201);
    expect(booked.body).toMatchObject({
      status: "confirmed",
      partySize: 6,
      source: "manual",
      notes: "Compleanno",
    });
    const list = await api<{ items: Entry[] }>(
      t,
      "GET",
      `${staffPath}?status=booked`,
      undefined,
      fx.session,
    );
    expect(list.body.items[0]?.bookingId).toBeTruthy();

    const cancelBooked = await api<{ code: string }>(
      t,
      "POST",
      `${staffPath}/${added.body.id}/cancel`,
      undefined,
      fx.session,
    );
    expect(cancelBooked.status).toBe(409);
  });
});
