import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  api,
  createFixture,
  createTestApp,
  type Fixture,
  FRIDAY,
  guestBooking,
  romeInstant,
  type Session,
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

describe("guest contact rules", () => {
  const widgetConfig = (fx: { restaurantId: string }) =>
    `/api/v1/restaurants/${fx.restaurantId}/widget-config`;
  /** Change a few widget switches, keeping the rest as it is (the PUT replaces the whole config). */
  async function setWidget(
    fx: { restaurantId: string; session: Session },
    patch: Record<string, unknown>,
  ) {
    const current = await api<Record<string, unknown>>(
      t,
      "GET",
      widgetConfig(fx),
      undefined,
      fx.session,
    );
    const { restaurantId: _r, embedSnippet: _e, hostedUrl: _h, ...input } = current.body;
    const res = await api(t, "PUT", widgetConfig(fx), { ...input, ...patch }, fx.session);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }

  it("wants an email by default and takes a phone-only guest once the switch is off", async () => {
    const fx = await createFixture(t);
    const phoneOnly = guestBooking(fx, {
      guest: { name: "Mario Rossi", phone: "+39 333 1234567" },
    });
    const denied = await api<{ code: string }>(t, "POST", publicBookings(fx), phoneOnly);
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe("email_required");

    await setWidget(fx, { requireEmail: false });
    const ok = await api<PublicBooking>(t, "POST", publicBookings(fx), phoneOnly);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const list = await api<{
      items: Array<{ customer: { email: string | null; phone: string | null } }>;
    }>(t, "GET", `${bookings(fx)}?date=${FRIDAY}`, undefined, fx.session);
    expect(list.body.items[0]?.customer).toMatchObject({ email: null, phone: "+393331234567" });

    const cfg = await api<{ widget: { requireEmail: boolean; requirePhone: boolean } }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/widget-config`,
    );
    expect(cfg.body.widget).toMatchObject({ requireEmail: false, requirePhone: true });
  });

  it("still needs one way to reach the guest when email and phone are both optional", async () => {
    const fx = await createFixture(t);
    await setWidget(fx, { requireEmail: false, requirePhone: false });
    const nobody = await api<{ code: string }>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, { guest: { name: "Anonimo" } }),
    );
    expect(nobody.status).toBe(400);
    expect(nobody.body.code).toBe("contact_required");
    const withEmail = await api<PublicBooking>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, { guest: { name: "Anna Verdi", email: "anna@example.com" } }),
    );
    expect(withEmail.status, JSON.stringify(withEmail.body)).toBe(201);
  });

  it("enforces the privacy checkbox when the widget asks for it", async () => {
    const fx = await createFixture(t);
    await setWidget(fx, { requirePrivacyConsent: true });
    const unticked = await api<{ code: string }>(t, "POST", publicBookings(fx), guestBooking(fx));
    expect(unticked.status).toBe(400);
    expect(unticked.body.code).toBe("privacy_required");
    const ticked = await api<PublicBooking>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, { privacyAccepted: true }),
    );
    expect(ticked.status, JSON.stringify(ticked.body)).toBe(201);
    const cfg = await api<{ widget: { requirePrivacyConsent: boolean } }>(
      t,
      "GET",
      `/api/public/v1/restaurants/${fx.slug}/widget-config`,
    );
    expect(cfg.body.widget.requirePrivacyConsent).toBe(true);
  });
});

describe("blocked times", () => {
  it("a zero-cover rule closes those slots online but managers can still book them by hand", async () => {
    const fx = await createFixture(t);
    const rule = await api<{ id: string }>(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/capacity-rules`,
      {
        name: "Blocked from Today",
        serviceId: fx.serviceId,
        date: FRIDAY,
        startTime: "20:00",
        endTime: "21:00",
        maxCovers: 0,
      },
      fx.session,
    );
    expect(rule.status, JSON.stringify(rule.body)).toBe(201);

    const availability = await api<{
      slots: Array<{ startLocal: string; available: boolean; reason?: string }>;
    }>(t, "GET", `/api/public/v1/restaurants/${fx.slug}/availability?date=${FRIDAY}&partySize=2`);
    const at = (time: string) => availability.body.slots.find((s) => s.startLocal === time);
    expect(at("19:30")?.available).toBe(true);
    expect(at("20:00")).toMatchObject({ available: false, reason: "full" });
    expect(at("20:30")).toMatchObject({ available: false, reason: "full" });
    expect(at("21:00")?.available).toBe(true);

    const online = await api<{ code: string }>(t, "POST", publicBookings(fx), guestBooking(fx));
    expect(online.status).toBe(409);
    expect(online.body.code).toBe("slot_unavailable");

    const byHand = await api<{ status: string }>(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "20:00"),
        partySize: 4,
        customer: { name: "Tavolo del titolare", phone: "+39 333 9876543" },
        source: "phone",
        ignoreCapacity: true,
      },
      fx.session,
    );
    expect(byHand.status, JSON.stringify(byHand.body)).toBe(201);
    expect(byHand.body.status).toBe("confirmed");
  });
});

describe("bookings created after an instant", () => {
  it("filters the list with createdAfter so the dashboard can poll for new bookings", async () => {
    const fx = await createFixture(t);
    const a = await api<PublicBooking>(t, "POST", publicBookings(fx), guestBooking(fx));
    const b = await api<PublicBooking>(
      t,
      "POST",
      publicBookings(fx),
      guestBooking(fx, {
        startsAt: romeInstant(FRIDAY, "21:00"),
        guest: { name: "Lucia Bianchi", email: "lucia@example.com", phone: "+39 340 7654321" },
      }),
    );
    expect(a.status).toBe(201);
    expect(b.status, JSON.stringify(b.body)).toBe(201);

    const all = await api<{ total: number }>(
      t,
      "GET",
      `${bookings(fx)}?createdAfter=2000-01-01T00:00:00Z`,
      undefined,
      fx.session,
    );
    expect(all.body.total).toBe(2);
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const none = await api<{ total: number }>(
      t,
      "GET",
      `${bookings(fx)}?createdAfter=${encodeURIComponent(later)}`,
      undefined,
      fx.session,
    );
    expect(none.body.total).toBe(0);

    // history: the latest taken first, whatever the time of the visit
    const names = async (query: string) =>
      (
        await api<{ items: Array<{ customer: { name: string } }> }>(
          t,
          "GET",
          `${bookings(fx)}${query}`,
          undefined,
          fx.session,
        )
      ).body.items.map((x) => x.customer.name);
    expect(await names("")).toEqual(["Mario Rossi", "Lucia Bianchi"]);
    expect(await names("?sort=created")).toEqual(["Lucia Bianchi", "Mario Rossi"]);
  });

  it("reports new online bookings and guest cancellations, not the staff's own", async () => {
    const fx = await createFixture(t);
    const since = new Date(Date.now() - 1000).toISOString();
    const activity = async (from = since) =>
      (
        await api<{
          items: Array<{
            kind: string;
            reason: string | null;
            booking: { customer: { name: string } };
          }>;
        }>(
          t,
          "GET",
          `${bookings(fx)}/online-activity?since=${encodeURIComponent(from)}`,
          undefined,
          fx.session,
        )
      ).body.items.map(
        (x) => `${x.kind}:${x.booking.customer.name}${x.reason ? `:${x.reason}` : ""}`,
      );

    const online = await api<PublicBooking>(t, "POST", publicBookings(fx), guestBooking(fx));
    expect(online.status).toBe(201);
    const phone = await api<{ id: string }>(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "21:00"),
        partySize: 2,
        customer: { name: "Anna Verdi", phone: "+39 340 1111111" },
        source: "phone",
        notifyGuest: false,
      },
      fx.session,
    );
    expect(phone.status).toBe(201);
    const token = online.body.manageUrl.split("/").pop() ?? "";
    expect(
      (await api(t, "POST", `/api/public/v1/bookings/${token}/cancel`, { reason: "Influenza" }))
        .status,
    ).toBe(200);
    const byStaff = await api(
      t,
      "POST",
      `${bookings(fx)}/${phone.body.id}/actions`,
      { action: "cancel" },
      fx.session,
    );
    expect(byStaff.status).toBe(200);

    expect(await activity()).toEqual(["created:Mario Rossi", "cancelled:Mario Rossi:Influenza"]);
    expect(await activity(new Date(Date.now() + 60_000).toISOString())).toEqual([]);
  });
});

describe("booking operators", () => {
  const ops = (fx: { restaurantId: string }) => `/api/v1/restaurants/${fx.restaurantId}/operators`;
  const phoneBooking = (fx: { serviceId: string }, extra: Record<string, unknown> = {}) => ({
    serviceId: fx.serviceId,
    startsAt: romeInstant(FRIDAY, "20:00"),
    partySize: 2,
    customer: { name: "Anna Verdi", phone: "+39 340 1111111" },
    source: "phone",
    ...extra,
  });
  const addOperator = async (fx: Fixture, name: string, pin: string) => {
    const res = await api<{ id: string; name: string }>(
      t,
      "POST",
      ops(fx),
      { name, pin },
      fx.session,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body;
  };

  it("does not ask for an operator while there are none", async () => {
    const fx = await createFixture(t);
    const res = await api<{ operatorName: string | null }>(
      t,
      "POST",
      bookings(fx),
      phoneBooking(fx),
      fx.session,
    );
    expect(res.status).toBe(201);
    expect(res.body.operatorName).toBeNull();
  });

  it("makes dashboard users give their name and code to take, change and cancel", async () => {
    const fx = await createFixture(t);
    const marco = await addOperator(fx, "Marco", "123456");
    const giulia = await addOperator(fx, "Giulia", "654321");

    const list = await api<Array<{ id: string; name: string; pin?: string }>>(
      t,
      "GET",
      ops(fx),
      undefined,
      fx.session,
    );
    expect(list.body.map((o) => o.name).sort()).toEqual(["Giulia", "Marco"]);
    expect(list.body.every((o) => o.pin === undefined)).toBe(true);

    const missing = await api<{ code: string }>(
      t,
      "POST",
      bookings(fx),
      phoneBooking(fx),
      fx.session,
    );
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("operator_required");

    const wrong = await api<{ code: string }>(
      t,
      "POST",
      bookings(fx),
      phoneBooking(fx, { operator: { id: marco.id, pin: "000000" } }),
      fx.session,
    );
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("wrong_pin");

    const staff = await addMember(t, fx, "staff");
    const created = await api<{ id: string; operatorName: string | null }>(
      t,
      "POST",
      bookings(fx),
      phoneBooking(fx, { operator: { id: marco.id, pin: "123456" } }),
      staff,
    );
    expect(created.status).toBe(201);
    expect(created.body.operatorName).toBe("Marco");
    const one = `${bookings(fx)}/${created.body.id}`;

    const noOp = await api<{ code: string }>(t, "PATCH", one, { partySize: 3 }, staff);
    expect(noOp.body.code).toBe("operator_required");
    const changed = await api<{ partySize: number; modifiedByOperatorName: string | null }>(
      t,
      "PATCH",
      one,
      { partySize: 3, operator: { id: giulia.id, pin: "654321" } },
      staff,
    );
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ partySize: 3, modifiedByOperatorName: "Giulia" });

    const staffFix = await api(
      t,
      "PATCH",
      one,
      { operatorName: "Giulia", operator: { id: giulia.id, pin: "654321" } },
      staff,
    );
    expect(staffFix.status).toBe(403);
    const managerFix = await api<{ operatorName: string | null }>(
      t,
      "PATCH",
      one,
      { operatorName: "Giulia", operator: { id: marco.id, pin: "123456" } },
      fx.session,
    );
    expect(managerFix.status).toBe(200);
    expect(managerFix.body.operatorName).toBe("Giulia");

    const cancelNoOp = await api<{ code: string }>(
      t,
      "POST",
      `${one}/actions`,
      { action: "cancel" },
      staff,
    );
    expect(cancelNoOp.body.code).toBe("operator_required");
    const cancelled = await api<{ status: string; cancelledByOperatorName: string | null }>(
      t,
      "POST",
      `${one}/actions`,
      { action: "cancel", operator: { id: marco.id, pin: "123456" } },
      staff,
    );
    expect(cancelled.body).toMatchObject({ status: "cancelled", cancelledByOperatorName: "Marco" });
  });

  it("locks an operator after five wrong codes and lets only managers edit the list", async () => {
    const fx = await createFixture(t);
    const marco = await addOperator(fx, "Marco", "123456");
    const verify = (pin: string) =>
      api<{ code: string }>(t, "POST", `${ops(fx)}/${marco.id}/verify`, { pin }, fx.session);
    expect((await verify("123456")).status).toBe(204);
    for (let i = 0; i < 5; i += 1) expect((await verify("111111")).status).toBe(400);
    const locked = await verify("123456");
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("operator_locked");

    const reset = await api(t, "PATCH", `${ops(fx)}/${marco.id}`, { pin: "222222" }, fx.session);
    expect(reset.status).toBe(200);
    expect((await verify("222222")).status).toBe(204);

    const staff = await addMember(t, fx, "staff");
    const denied = await api(t, "POST", ops(fx), { name: "Luca", pin: "333333" }, staff);
    expect(denied.status).toBe(403);
    const dup = await api(t, "POST", ops(fx), { name: "marco", pin: "333333" }, fx.session);
    expect(dup.status).toBe(409);
    const shortPin = await api(t, "POST", ops(fx), { name: "Luca", pin: "123" }, fx.session);
    expect(shortPin.status).toBe(400);
  });

  it("counts wrong codes sent all at once", async () => {
    const fx = await createFixture(t);
    const marco = await addOperator(fx, "Marco", "123456");
    const tries = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        api<{ code: string }>(
          t,
          "POST",
          `${ops(fx)}/${marco.id}/verify`,
          { pin: String(900000 + i) },
          fx.session,
        ),
      ),
    );
    expect(tries.filter((x) => x.body.code === "wrong_pin").length).toBeLessThanOrEqual(5);
    const after = await api<{ code: string }>(
      t,
      "POST",
      `${ops(fx)}/${marco.id}/verify`,
      { pin: "123456" },
      fx.session,
    );
    expect(after.body.code).toBe("operator_locked");
  });

  it("never asks guests booking online", async () => {
    const fx = await createFixture(t);
    await addOperator(fx, "Marco", "123456");
    const res = await api<PublicBooking>(t, "POST", publicBookings(fx), guestBooking(fx));
    expect(res.status).toBe(201);
  });
});

describe("undoing a completion", () => {
  it("reopens a table closed by mistake as confirmed, without telling the guest", async () => {
    const fx = await createFixture(t);
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "T <t@example.com>" },
      },
      fx.session,
    );
    const created = await api<{ id: string }>(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "19:30"),
        partySize: 2,
        customer: { name: "Sara Gialli", email: "sara@example.com" },
        source: "phone",
      },
      fx.session,
    );
    const action = (a: string) =>
      api<{ status: string; customer: { visitCount: number } }>(
        t,
        "POST",
        `${bookings(fx)}/${created.body.id}/actions`,
        { action: a },
        fx.session,
      );
    await action("seat");
    await action("complete");
    await t.processEvents();
    const before = t.sentEmails.filter((e) => e.to === "sara@example.com").length;

    const reopened = await action("reopen");
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("confirmed");
    expect(reopened.body.customer.visitCount).toBe(0);
    await t.processEvents();
    expect(t.sentEmails.filter((e) => e.to === "sara@example.com")).toHaveLength(before);

    const seatedAgain = await action("seat");
    expect(seatedAgain.body.customer.visitCount).toBe(1);
  });
});

describe("undoing a completion when the room filled up", () => {
  it("refuses to reopen a completed booking whose covers were given away", async () => {
    const fx = await createFixture(t, { maxCoversPerSlot: 4 });
    const take = (name: string) =>
      api<{ id: string; code?: string }>(
        t,
        "POST",
        bookings(fx),
        {
          serviceId: fx.serviceId,
          startsAt: romeInstant(FRIDAY, "19:30"),
          partySize: 4,
          customer: { name, phone: "+39 340 3333333" },
          source: "walk_in",
        },
        fx.session,
      );
    const first = await take("Primo Tavolo");
    const act = (id: string, action: string) =>
      api<{ code?: string }>(t, "POST", `${bookings(fx)}/${id}/actions`, { action }, fx.session);
    await act(first.body.id, "seat");
    await act(first.body.id, "complete");
    const second = await take("Secondo Tavolo");
    expect(second.status).toBe(201);
    const reopened = await act(first.body.id, "reopen");
    expect(reopened.status).toBe(409);
    expect(reopened.body.code).toBe("slot_unavailable");
  });
});
