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

interface PublicBooking {
  id: string;
  confirmationCode: string;
  status: string;
  startsAt: string;
  serviceDate: string;
  manageUrl: string;
  canCancel: boolean;
}

const bookings = (fx: { restaurantId: string }) =>
  `/api/v1/restaurants/${fx.restaurantId}/bookings`;
const publicBookings = (fx: { slug: string }) => `/api/public/v1/restaurants/${fx.slug}/bookings`;

describe("guest bookings", () => {
  it("books a table through the public API and shows it in the staff list", async () => {
    const fx = await createFixture(t);
    const res = await api<PublicBooking>(t, "POST", publicBookings(fx), guestBooking(fx));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.confirmationCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(res.body.serviceDate).toBe(FRIDAY);
    expect(res.body.canCancel).toBe(true);

    const list = await api<{
      items: Array<{
        id: string;
        customer: { name: string; phone: string | null };
        partySize: number;
      }>;
      total: number;
    }>(t, "GET", `${bookings(fx)}?date=${FRIDAY}`, undefined, fx.session);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      id: res.body.id,
      partySize: 2,
      customer: { name: "Mario Rossi", phone: "+393331234567" },
    });

    const availability = await api<{
      slots: Array<{ startLocal: string; remainingCovers: number | null }>;
    }>(t, "GET", `/api/public/v1/restaurants/${fx.slug}/availability?date=${FRIDAY}&partySize=2`);
    expect(availability.body.slots.find((s) => s.startLocal === "20:00")?.remainingCovers).toBe(18);
  });

  it("returns the same booking for a retried idempotency key", async () => {
    const fx = await createFixture(t);
    const body = guestBooking(fx, { idempotencyKey: "retry-abc-123" });
    const a = await api<PublicBooking>(t, "POST", publicBookings(fx), body);
    const b = await api<PublicBooking>(t, "POST", publicBookings(fx), body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
  });

  it("rejects off-grid times, past dates and invalid phones", async () => {
    const fx = await createFixture(t);
    const offGrid = await api<{ code: string; reason: string }>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, { startsAt: romeInstant(FRIDAY, "20:10") }),
    );
    expect(offGrid.status).toBe(409);
    expect(offGrid.body).toMatchObject({ code: "slot_unavailable", reason: "not_a_slot" });

    const past = await api<{ reason: string }>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, { startsAt: romeInstant("2026-06-01", "20:00") }),
    );
    expect(past.status).toBe(409);
    expect(past.body.reason).toBe("in_past");

    const phone = await api<{ code: string }>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, { guest: { name: "X", email: "x@example.com", phone: "12345" } }),
    );
    expect(phone.status).toBe(400);
    expect(phone.body.code).toBe("invalid_phone");
  });

  it("never overbooks a slot under concurrent requests", async () => {
    const fx = await createFixture(t, { maxCoversPerSlot: 2 });
    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        api<PublicBooking>(
          t,
          "POST",
          publicBookings(fx),
          guestBooking(fx, {
            guest: {
              name: `Guest ${i}`,
              email: `guest${i}@example.com`,
              phone: `+39 333 00000${String(i).padStart(2, "0")}`,
            },
          }),
        ),
      ),
    );
    const statuses = attempts.map((a) => a.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    const list = await api<{ total: number }>(
      t,
      "GET",
      `${bookings(fx)}?date=${FRIDAY}`,
      undefined,
      fx.session,
    );
    expect(list.body.total).toBe(1);
  });

  it("settles concurrent retries with one idempotency key on one booking", async () => {
    const fx = await createFixture(t);
    const key = `retry-${Math.random().toString(36).slice(2)}`;
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        api<PublicBooking>(
          t,
          "POST",
          publicBookings(fx),
          guestBooking(fx, { idempotencyKey: key }),
        ),
      ),
    );
    expect(attempts.map((a) => a.status)).toEqual(Array.from({ length: 12 }, () => 201));
    expect(new Set(attempts.map((a) => a.body.id)).size).toBe(1);
    const list = await api<{ total: number }>(
      t,
      "GET",
      `${bookings(fx)}?date=${FRIDAY}`,
      undefined,
      fx.session,
    );
    expect(list.body.total).toBe(1);
  });

  it("keeps one guest-book entry when the same guest books several dates at once", async () => {
    const fx = await createFixture(t);
    const dates = ["2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15", "2026-06-16"];
    const attempts = await Promise.all(
      dates.flatMap((date) =>
        ["19:00", "21:00"].map((time) =>
          api<PublicBooking>(
            t,
            "POST",
            publicBookings(fx),
            guestBooking(fx, {
              startsAt: romeInstant(date, time),
              guest: { name: "Luca Bianchi", email: "luca@example.com", phone: "+39 333 9998887" },
            }),
          ),
        ),
      ),
    );
    expect(attempts.map((a) => a.status)).toEqual(Array.from({ length: 10 }, () => 201));
    const customers = await api<{ total: number; items: Array<{ visitCount: number }> }>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/customers?search=luca`,
      undefined,
      fx.session,
    );
    expect(customers.body.total).toBe(1);
  });

  it("lets the guest cancel through the manage link within the cutoff", async () => {
    const fx = await createFixture(t);
    const res = await api<PublicBooking>(t, "POST", publicBookings(fx), guestBooking(fx));
    const token = res.body.manageUrl.split("/").pop() ?? "";
    const lookup = await api<PublicBooking>(t, "GET", `/api/public/v1/bookings/${token}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.id).toBe(res.body.id);

    const cancelled = await api<PublicBooking>(
      t,
      "POST",
      `/api/public/v1/bookings/${token}/cancel`,
      { reason: "Change of plans" },
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.canCancel).toBe(false);

    const again = await api(t, "POST", `/api/public/v1/bookings/${token}/cancel`, {});
    expect(again.status).toBe(409);
  });

  it("requires manual approval for large parties when configured", async () => {
    const fx = await createFixture(t);
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/policy`,
      { largePartyThreshold: 6 },
      fx.session,
    );
    const res = await api<PublicBooking>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, { partySize: 6 }),
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });
});

describe("staff bookings", () => {
  it("creates phone bookings, seats, completes and blocks invalid transitions", async () => {
    const fx = await createFixture(t);
    const created = await api<{ id: string; status: string; source: string }>(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "19:30"),
        partySize: 4,
        customer: { name: "Luca Bianchi", phone: "+39 340 0000000" },
        source: "phone",
      },
      fx.session,
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "confirmed", source: "phone" });

    const base = `${bookings(fx)}/${created.body.id}`;
    const seated = await api<{ status: string; customer: { visitCount: number } }>(
      t,
      "POST",
      `${base}/actions`,
      { action: "seat" },
      fx.session,
    );
    expect(seated.body.status).toBe("seated");
    expect(seated.body.customer.visitCount).toBe(1);

    const bad = await api<{ code: string }>(
      t,
      "POST",
      `${base}/actions`,
      { action: "confirm" },
      fx.session,
    );
    expect(bad.status).toBe(409);
    expect(bad.body.code).toBe("invalid_transition");

    const done = await api<{ status: string }>(
      t,
      "POST",
      `${base}/actions`,
      { action: "complete" },
      fx.session,
    );
    expect(done.body.status).toBe("completed");
  });

  it("lets staff take bookings the online rules would refuse", async () => {
    const fx = await createFixture(t);
    // a regular calls in September for a table of 12 in mid-August: beyond the
    // 60-day horizon and above the online maximum party size
    const far = "2026-08-14";
    const online = await api<{ code: string; reason: string }>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, { startsAt: romeInstant(far, "20:00"), partySize: 12 }),
    );
    expect(online.status).toBe(409);
    expect(online.body.code).toBe("slot_unavailable");

    const staff = await api<{ status: string }>(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(far, "20:00"),
        partySize: 12,
        customer: { name: "Famiglia Verdi", phone: "+39 340 0000001" },
        source: "phone",
      },
      fx.session,
    );
    expect(staff.status).toBe(201);
    expect(staff.body.status).toBe("confirmed");

    // a day that has already passed stays off limits for staff too
    const yesterday = await api<{ reason: string }>(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant("2026-06-09", "20:00"),
        partySize: 2,
        customer: { name: "Ieri" },
        source: "walk_in",
        seatNow: true,
      },
      fx.session,
    );
    expect(yesterday.status).toBe(409);
    expect(yesterday.body.reason).toBe("in_past");
  });

  it("can override capacity and modify bookings", async () => {
    const fx = await createFixture(t, { maxCoversPerSlot: 2 });
    await api(t, "POST", publicBookings(fx), guestBooking(fx));
    const staffBody = {
      serviceId: fx.serviceId,
      startsAt: romeInstant(FRIDAY, "20:00"),
      partySize: 2,
      customer: { name: "Regular" },
    };
    const denied = await api(t, "POST", bookings(fx), staffBody, fx.session);
    expect(denied.status).toBe(409);
    const forced = await api<{ id: string }>(
      t,
      "POST",
      bookings(fx),
      { ...staffBody, ignoreCapacity: true },
      fx.session,
    );
    expect(forced.status).toBe(201);

    const moved = await api<{ startsAt: string; partySize: number; notes: string }>(
      t,
      "PATCH",
      `${bookings(fx)}/${forced.body.id}`,
      { startsAt: romeInstant(FRIDAY, "21:00"), notes: "Window table" },
      fx.session,
    );
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      startsAt: "2026-06-12T19:00:00.000Z",
      partySize: 2,
      notes: "Window table",
    });

    // the pacing limit is 2 covers per slot, so a party of 3 can never fit
    const tooBig = await api<{ code: string }>(
      t,
      "PATCH",
      `${bookings(fx)}/${forced.body.id}`,
      { partySize: 3 },
      fx.session,
    );
    expect(tooBig.status).toBe(409);
    expect(tooBig.body.code).toBe("slot_unavailable");
  });
});
