import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createFixture,
  createTestApp,
  type Fixture,
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
  status: string;
  manageUrl: string;
  payment: {
    kind: string;
    status: string;
    amountCents: number;
    currency: string;
    checkoutUrl: string | null;
    expiresAt: string | null;
  } | null;
}
interface StaffBooking {
  id: string;
  status: string;
  payment: { status: string; amountCents: number; error: string | null } | null;
}

const tokenOf = (b: PublicBooking) => b.manageUrl.split("/").pop() ?? "";

async function configure(fx: Fixture, mode: "deposit" | "card_hold", extra = {}) {
  const res = await api<{ connected: boolean; secretKey: { set: boolean; last4?: string } }>(
    t,
    "PUT",
    `/api/v1/restaurants/${fx.restaurantId}/payments/config`,
    {
      secretKey: "sk_test_abcdef1234",
      webhookSecret: "whsec_test",
      mode,
      amountCents: 1000,
      minPartySize: null,
      paymentWindowMinutes: 30,
      refundOnCancel: true,
      chargeNoShow: true,
      ...extra,
    },
    fx.session,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body).toMatchObject({ connected: true, secretKey: { set: true, last4: "1234" } });
  await api(
    t,
    "PUT",
    `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
    { providerId: "test-email", config: { apiKey: "secret-key-1234", from: "T <t@example.com>" } },
    fx.session,
  );
}

describe("deposits and no-show protection", () => {
  it("stores keys encrypted, masks them, and verifies the connection", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}/payments`;
    const before = await api<{ mode: string; connected: boolean; webhookUrl: string }>(
      t,
      "GET",
      `${base}/config`,
      undefined,
      fx.session,
    );
    expect(before.body).toMatchObject({ mode: "off", connected: false });
    expect(before.body.webhookUrl).toContain(
      `/api/public/v1/payments/stripe/webhook/${fx.restaurantId}`,
    );

    const noKey = await api<{ code: string }>(
      t,
      "PUT",
      `${base}/config`,
      {
        mode: "deposit",
        amountCents: 500,
        minPartySize: null,
        paymentWindowMinutes: 30,
        refundOnCancel: true,
        chargeNoShow: true,
      },
      fx.session,
    );
    expect(noKey.body.code).toBe("secret_key_required");

    await configure(fx, "deposit");
    const rows = await t.ctx.pool.query("select config from payment_config");
    expect(String(rows.rows[0].config.secretKey)).toMatch(/^enc1:/);
    const test = await api<{ ok: boolean }>(t, "POST", `${base}/test`, undefined, fx.session);
    expect(test.status).toBe(200);
    // wrong key: the gateway rejects it
    await api(
      t,
      "PUT",
      `${base}/config`,
      {
        secretKey: "sk_live_bad",
        mode: "deposit",
        amountCents: 500,
        minPartySize: null,
        paymentWindowMinutes: 30,
        refundOnCancel: true,
        chargeNoShow: true,
      },
      fx.session,
    );
    const bad = await api<{ code: string }>(t, "POST", `${base}/test`, undefined, fx.session);
    expect(bad.status).toBe(502);
  });

  it("holds an online booking until the deposit is paid, then confirms it and refunds on cancellation", async () => {
    const fx = await createFixture(t);
    await configure(fx, "deposit");
    const staff = `/api/v1/restaurants/${fx.restaurantId}/bookings`;

    const created = await api<PublicBooking>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, {
        partySize: 3,
        guest: {
          name: "Mario Rossi",
          email: "mario@example.com",
          phone: "+39 333 1234567",
          locale: "en",
        },
      }),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.status).toBe("pending");
    expect(created.body.payment).toMatchObject({
      kind: "deposit",
      status: "pending",
      amountCents: 3000,
      currency: "EUR",
    });
    expect(created.body.payment?.checkoutUrl).toMatch(/^https:\/\/checkout\.example\//);
    const sessionId = created.body.payment?.checkoutUrl?.split("/").pop() ?? "";
    expect(t.gateway.sessions.get(sessionId)?.params).toMatchObject({
      mode: "payment",
      amountCents: 3000,
      customerEmail: "mario@example.com",
    });

    // the guest gets a "pay to confirm" email with the checkout link, not the pending one
    await t.processEvents();
    const payMail = t.sentEmails.find((m) => m.to === "mario@example.com");
    expect(payMail?.subject).toBe("Complete your booking at Trattoria Test");
    expect(payMail?.text).toContain("€30.00");
    expect(payMail?.html).toContain(created.body.payment?.checkoutUrl ?? "never");

    // staff bookings never need a deposit
    const phone = await api<StaffBooking>(
      t,
      "POST",
      staff,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "21:00"),
        partySize: 4,
        customer: { name: "Anna" },
        source: "phone",
      },
      fx.session,
    );
    expect(phone.body).toMatchObject({ status: "confirmed", payment: null });

    // the guest pays: Stripe calls the webhook
    t.gateway.complete(sessionId);
    const hook = await t.app.request(`/api/public/v1/payments/stripe/webhook/${fx.restaurantId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "test" },
      body: JSON.stringify({
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: { id: sessionId } },
      }),
    });
    expect(hook.status).toBe(200);
    expect(await hook.json()).toEqual({ received: true, handled: true });
    const token = tokenOf(created.body);
    const seen = await api<PublicBooking>(t, "GET", `/api/public/v1/bookings/${token}`);
    expect(seen.body.status).toBe("confirmed");
    expect(seen.body.payment).toMatchObject({ status: "paid", checkoutUrl: null });
    await t.processEvents();
    expect(
      t.sentEmails.filter((m) => m.to === "mario@example.com").map((m) => m.subject),
    ).toContain("Booking confirmed at Trattoria Test");

    // a bad signature is refused
    const forged = await t.app.request(
      `/api/public/v1/payments/stripe/webhook/${fx.restaurantId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": "nope" },
        body: "{}",
      },
    );
    expect(forged.status).toBe(400);

    // cancelling refunds the deposit automatically
    const cancel = await api(
      t,
      "POST",
      `${staff}/${created.body.id}/actions`,
      { action: "cancel" },
      fx.session,
    );
    expect(cancel.status).toBe(200);
    await t.processEvents();
    expect(t.gateway.refunds).toEqual([`pi_${sessionId}`]);
    const after = await api<StaffBooking>(
      t,
      "GET",
      `${staff}/${created.body.id}`,
      undefined,
      fx.session,
    );
    expect(after.body.payment?.status).toBe("refunded");
  });

  it("settles a missed webhook when the guest returns, and drops the booking when the window lapses", async () => {
    const fx = await createFixture(t);
    await configure(fx, "deposit", { minPartySize: 4 });
    const publicPath = `/api/public/v1/restaurants/${fx.slug}/bookings`;

    // below the threshold: no deposit, confirmed straight away
    const small = await api<PublicBooking>(
      t,
      "POST",
      publicPath,
      guestBooking(fx, { partySize: 2 }),
    );
    expect(small.body).toMatchObject({ status: "confirmed", payment: null });

    const paid = await api<PublicBooking>(
      t,
      "POST",
      publicPath,
      guestBooking(fx, {
        partySize: 4,
        startsAt: romeInstant(FRIDAY, "21:00"),
        guest: { name: "Lucia", email: "lucia@example.com", phone: "+39 340 0000001" },
      }),
    );
    const paidSession = paid.body.payment?.checkoutUrl?.split("/").pop() ?? "";
    t.gateway.complete(paidSession);
    // no webhook arrived, but looking at the booking syncs it with the gateway
    const synced = await api<PublicBooking>(
      t,
      "GET",
      `/api/public/v1/bookings/${tokenOf(paid.body)}`,
    );
    expect(synced.body.status).toBe("confirmed");
    expect(synced.body.payment?.status).toBe("paid");

    const unpaid = await api<PublicBooking>(
      t,
      "POST",
      publicPath,
      guestBooking(fx, {
        partySize: 5,
        startsAt: romeInstant(FRIDAY, "19:30"),
        guest: {
          name: "Paolo",
          email: "paolo@example.com",
          phone: "+39 340 0000002",
          locale: "en",
        },
      }),
    );
    expect(unpaid.body.status).toBe("pending");
    // the expiry job fires after the window: the booking is cancelled and the slot freed
    expect(t.jobs.sent.some((j) => j.name === "payment.expire")).toBe(true);
    await t.jobs.flush(t.ctx);
    await t.processEvents();
    const gone = await api<PublicBooking>(
      t,
      "GET",
      `/api/public/v1/bookings/${tokenOf(unpaid.body)}`,
    );
    expect(gone.body.status).toBe("cancelled");
    expect(gone.body.payment?.status).toBe("expired");
    expect(
      t.sentEmails.find((m) => m.to === "paolo@example.com" && m.subject.includes("cancelled")),
    ).toBeTruthy();
  });

  it("saves a card for no-show protection and charges the fee on a no-show", async () => {
    const fx = await createFixture(t);
    await configure(fx, "card_hold", { amountCents: 2000 });
    const staff = `/api/v1/restaurants/${fx.restaurantId}/bookings`;
    const created = await api<PublicBooking>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, { partySize: 2, startsAt: romeInstant("2026-06-05", "20:00") }),
    );
    // a past date is not bookable online; use the staff override for a booking we can mark no-show
    expect(created.status).toBe(409);

    const online = await api<PublicBooking>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, { partySize: 2 }),
    );
    expect(online.body.status).toBe("pending");
    expect(online.body.payment).toMatchObject({ kind: "card_hold", amountCents: 4000 });
    const session = online.body.payment?.checkoutUrl?.split("/").pop() ?? "";
    expect(t.gateway.sessions.get(session)?.params.mode).toBe("setup");
    t.gateway.complete(session);
    const synced = await api<PublicBooking>(
      t,
      "GET",
      `/api/public/v1/bookings/${tokenOf(online.body)}`,
    );
    expect(synced.body.status).toBe("confirmed");
    expect(synced.body.payment?.status).toBe("card_saved");

    // the guest never shows up: the fee is charged on the saved card
    const noShow = await api(
      t,
      "POST",
      `${staff}/${online.body.id}/actions`,
      { action: "no_show" },
      fx.session,
    );
    expect(noShow.status).toBe(200);
    await t.processEvents();
    expect(t.gateway.charges).toEqual([
      { customerId: `cus_${session}`, amountCents: 4000, succeeded: true },
    ]);
    const charged = await api<StaffBooking>(
      t,
      "GET",
      `${staff}/${online.body.id}`,
      undefined,
      fx.session,
    );
    expect(charged.body.payment?.status).toBe("charged");
    const again = await api<{ code: string }>(
      t,
      "POST",
      `${staff}/${online.body.id}/payment/charge`,
      undefined,
      fx.session,
    );
    expect(again.body.code).toBe("not_chargeable");
  });
});
