import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createFixture, createTestApp, guestBooking, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Template {
  event: string;
  channel: string;
  audience: string;
  locale: string;
  subject: string | null;
  heading: string | null;
  body: string;
  custom: boolean;
}

const path = (fx: { restaurantId: string }) =>
  `/api/v1/restaurants/${fx.restaurantId}/notification-templates`;

describe("notification templates", () => {
  it("lists defaults, saves custom wording that the emails use, previews and resets", async () => {
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

    const defaults = await api<Template[]>(
      t,
      "GET",
      `${path(fx)}?locale=it`,
      undefined,
      fx.session,
    );
    expect(defaults.status).toBe(200);
    // guest: 5 booking events + payment_required + feedback_request + waitlist joined/offered = 9;
    // restaurant: 4 booking events + feedback_received + waitlist joined = 6; × 2 channels
    expect(defaults.body).toHaveLength(30);
    expect(defaults.body.every((x) => !x.custom)).toBe(true);
    const guestConfirmed = defaults.body.find(
      (x) => x.event === "booking.confirmed" && x.channel === "email" && x.audience === "guest",
    );
    expect(guestConfirmed?.subject).toBe("Prenotazione confermata da {{restaurantName}}");

    const saved = await api<Template>(
      t,
      "PUT",
      path(fx),
      {
        event: "booking.confirmed",
        channel: "email",
        audience: "guest",
        locale: "it",
        subject: "Ci vediamo da {{restaurantName}}, {{guestName}}!",
        heading: "Tavolo prenotato",
        body: "Ciao {{guestName}},\n\nti aspettiamo in {{partySize}} per {{serviceName}}.\n\nA presto!",
      },
      fx.session,
    );
    expect(saved.status).toBe(200);
    expect(saved.body.custom).toBe(true);

    await api(t, "POST", `/api/public/v1/restaurants/${fx.slug}/bookings`, guestBooking(fx));
    await t.processEvents();
    const mail = t.sentEmails.find((m) => m.to === "mario@example.com");
    expect(mail?.subject).toBe("Ci vediamo da Trattoria Test, Mario Rossi!");
    expect(mail?.text).toContain("ti aspettiamo in 2 per Cena.");
    expect(mail?.html).toContain("Tavolo prenotato");
    expect(mail?.html).toContain("/manage/");

    const bad = await api<{ code: string }>(
      t,
      "PUT",
      path(fx),
      {
        event: "booking.confirmed",
        channel: "sms",
        audience: "guest",
        locale: "it",
        body: "Ciao {{guestName}}, tavolo {{tableNumber}}",
      },
      fx.session,
    );
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("unknown_placeholder");

    const preview = await api<{ subject: string; html: string; text: string }>(
      t,
      "POST",
      `${path(fx)}/preview`,
      {
        event: "booking.reminder",
        channel: "email",
        audience: "guest",
        locale: "en",
        subject: "See you soon, {{guestName}}",
        heading: "Reminder",
        body: "Table for {{partySize}} at {{when}}.",
      },
      fx.session,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.subject).toBe("See you soon, Mario Rossi");
    expect(preview.body.html).toContain("Table for 4 at ");

    const smsPreview = await api<{ text: string; html: string | null }>(
      t,
      "POST",
      `${path(fx)}/preview`,
      {
        event: "booking.confirmed",
        channel: "sms",
        audience: "guest",
        locale: "it",
        body: "{{restaurantName}}: {{partySize}} il {{when}}",
      },
      fx.session,
    );
    expect(smsPreview.body.html).toBeNull();
    expect(smsPreview.body.text).toMatch(/^Trattoria Test: 4 il /);

    const reset = await api<Template>(
      t,
      "DELETE",
      `${path(fx)}/booking.confirmed/email/guest/it`,
      undefined,
      fx.session,
    );
    expect(reset.status).toBe(200);
    expect(reset.body.custom).toBe(false);
    expect(reset.body.subject).toBe("Prenotazione confermata da {{restaurantName}}");
  });
});
