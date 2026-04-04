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

interface ProviderConfig {
  providerId: string | null;
  scope: string;
  config: Record<string, unknown>;
}

describe("notifications", () => {
  it("lists providers with their fields", async () => {
    const fx = await createFixture(t);
    const res = await api<
      Array<{ id: string; channel: string; fields: Array<{ key: string; secret: boolean }> }>
    >(t, "GET", "/api/v1/notification-providers", undefined, fx.session);
    expect(res.status).toBe(200);
    const ids = res.body.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "smtp",
        "resend",
        "twilio",
        "console-email",
        "console-sms",
        "test-email",
      ]),
    );
    expect(
      res.body.find((p) => p.id === "smtp")?.fields.find((f) => f.key === "password")?.secret,
    ).toBe(true);
  });

  it("stores provider secrets encrypted, masks them, and keeps them on partial updates", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`;
    const before = await api<ProviderConfig>(t, "GET", base, undefined, fx.session);
    expect(before.body).toMatchObject({ providerId: null, scope: "none" });

    const saved = await api<ProviderConfig>(
      t,
      "PUT",
      base,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "Trattoria <info@example.com>" },
      },
      fx.session,
    );
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      providerId: "test-email",
      scope: "restaurant",
      config: { apiKey: { set: true, last4: "1234" }, from: "Trattoria <info@example.com>" },
    });

    const rows = await t.ctx.pool.query("select config from notification_provider_config");
    expect(String(rows.rows[0].config.apiKey)).toMatch(/^enc1:/);
    expect(String(rows.rows[0].config.apiKey)).not.toContain("secret-key");

    const partial = await api<ProviderConfig>(
      t,
      "PUT",
      base,
      { providerId: "test-email", config: { from: "New <new@example.com>" } },
      fx.session,
    );
    expect(partial.body.config).toMatchObject({
      apiKey: { set: true, last4: "1234" },
      from: "New <new@example.com>",
    });

    const invalid = await api<{ code: string }>(
      t,
      "PUT",
      base,
      { providerId: "test-email", config: {} },
      fx.session,
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("invalid_provider_config");

    const wrongChannel = await api<{ code: string }>(
      t,
      "PUT",
      base,
      { providerId: "twilio", config: {} },
      fx.session,
    );
    expect(wrongChannel.status).toBe(400);
  });

  it("sends a confirmation email to the guest and an alert to the restaurant, and no SMS by default", async () => {
    const fx = await createFixture(t, { restaurantEmail: "staff@example.com" });
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "Trattoria <info@example.com>" },
      },
      fx.session,
    );
    const emailsBefore = t.sentEmails.length;

    const booked = await api<{ id: string; confirmationCode: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx),
    );
    expect(booked.status).toBe(201);
    await t.processEvents();

    const sent = t.sentEmails.slice(emailsBefore);
    expect(sent).toHaveLength(2);
    const guest = sent.find((m) => m.to === "mario@example.com");
    const staff = sent.find((m) => m.to === "staff@example.com");
    expect(guest?.subject).toBe("Prenotazione confermata da Trattoria Test");
    expect(guest?.text).toContain(booked.body.confirmationCode);
    expect(guest?.text).toContain("venerdì 12 giugno 2026, 20:00");
    expect(guest?.html).toContain("/book/");
    expect(staff?.subject).toContain("Nuova prenotazione: Mario Rossi, 2 persone");
    expect(t.sentSms).toHaveLength(0);

    const log = await api<
      Array<{ channel: string; audience: string; status: string; providerId: string }>
    >(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/bookings/${booked.body.id}/notifications`,
      undefined,
      fx.session,
    );
    expect(log.body).toHaveLength(2);
    expect(log.body.every((l) => l.status === "sent" && l.providerId === "test-email")).toBe(true);

    // a reminder was scheduled 24h before the booking
    const reminder = t.jobs.sent.find((j) => j.name === "notify.reminder");
    expect(reminder?.options.startAfter?.toISOString()).toBe("2026-06-11T18:00:00.000Z");

    // re-delivering the same event does not send again
    await t.processEvents();
    expect(t.sentEmails.slice(emailsBefore)).toHaveLength(2);
  });

  it("keeps the guest out when staff ask, and can send the message later", async () => {
    const fx = await createFixture(t, { restaurantEmail: "staff@example.com" });
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "Trattoria <info@example.com>" },
      },
      fx.session,
    );
    const before = t.sentEmails.length;
    const created = await api<{ id: string; confirmationCode: string }>(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/bookings`,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "20:00"),
        partySize: 3,
        customer: { name: "Cugino Gigi", email: "gigi@example.com" },
        source: "phone",
        notifyGuest: false,
      },
      fx.session,
    );
    expect(created.status).toBe(201);
    await t.processEvents();
    const sent = t.sentEmails.slice(before);
    expect(sent.map((m) => m.to)).toEqual(["staff@example.com"]);

    // "he asked for the email after all": resend queues the confirmation for the guest only
    const resent = await api<{ queued: number; event: string }>(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/bookings/${created.body.id}/notifications/resend`,
      undefined,
      fx.session,
    );
    expect(resent.status).toBe(200);
    expect(resent.body).toEqual({ queued: 1, event: "booking.confirmed" });
    await t.processEvents();
    const again = t.sentEmails.slice(before);
    expect(again.map((m) => m.to)).toEqual(["staff@example.com", "gigi@example.com"]);
    expect(again[1]?.text).toContain(created.body.confirmationCode);
  });

  it("sends SMS once a provider is configured and the rule is enabled", async () => {
    const fx = await createFixture(t);
    const smsBefore = t.sentSms.length;
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-providers/sms`,
      { providerId: "test-sms", config: { from: "Trattoria" } },
      fx.session,
    );
    const updated = await api<
      Array<{ event: string; channel: string; audience: string; enabled: boolean }>
    >(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-settings`,
      {
        settings: [
          {
            event: "booking.confirmed",
            channel: "sms",
            audience: "guest",
            enabled: true,
            offsetMinutes: null,
          },
        ],
      },
      fx.session,
    );
    expect(updated.status).toBe(200);
    expect(
      updated.body.find(
        (s) => s.event === "booking.confirmed" && s.channel === "sms" && s.audience === "guest",
      )?.enabled,
    ).toBe(true);

    await api(t, "POST", `/api/public/v1/restaurants/${fx.slug}/bookings`, guestBooking(fx));
    await t.processEvents();
    const sms = t.sentSms.slice(smsBefore);
    expect(sms).toHaveLength(1);
    expect(sms[0]?.to).toBe("+393331234567");
    expect(sms[0]?.body).toContain("prenotazione confermata per 2");
  });

  it("records a skipped notification when no provider is configured", async () => {
    const fx = await createFixture(t);
    const booked = await api<{ id: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx),
    );
    await t.processEvents();
    const log = await api<Array<{ status: string; error: string | null }>>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/bookings/${booked.body.id}/notifications`,
      undefined,
      fx.session,
    );
    expect(log.body.length).toBeGreaterThan(0);
    expect(
      log.body.every((l) => l.status === "skipped" && l.error?.includes("no email provider")),
    ).toBe(true);
  });

  it("sends a cancellation email when the guest cancels", async () => {
    const fx = await createFixture(t);
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "Trattoria <info@example.com>" },
      },
      fx.session,
    );
    const booked = await api<{ manageUrl: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, {
        guest: {
          name: "Giulia",
          email: "giulia@example.com",
          phone: "+39 333 7654321",
          locale: "en",
        },
      }),
    );
    await t.processEvents();
    const before = t.sentEmails.length;
    const token = booked.body.manageUrl.split("/").pop() ?? "";
    await api(t, "POST", `/api/public/v1/bookings/${token}/cancel`, {});
    await t.processEvents();
    const sent = t.sentEmails.slice(before);
    expect(sent.map((m) => m.subject)).toEqual(
      expect.arrayContaining(["Your booking at Trattoria Test was cancelled"]),
    );
  });
});
