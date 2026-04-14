import { booking } from "@openpax/db";
import { eq } from "drizzle-orm";
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

interface FeedbackPage {
  canAnswer: boolean;
  feedback: { rating: number; comment: string | null } | null;
  booking: { guestName: string; partySize: number };
}

describe("post-visit feedback", () => {
  it("asks after the visit, records the answer, notifies the restaurant and feeds the summary", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    await api(
      t,
      "PUT",
      `${base}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "T <t@example.com>" },
      },
      fx.session,
    );

    // last Friday: the visit already happened
    const past = await api<{ id: string }>(
      t,
      "POST",
      `${base}/bookings`,
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant("2026-06-05", "20:00"),
        partySize: 2,
        customer: { name: "Mario Rossi", email: "mario@example.com", locale: "en" },
        source: "phone",
        ignoreCapacity: true,
      },
      fx.session,
    );
    expect(past.status, JSON.stringify(past.body)).toBe(201);
    await t.processEvents();
    // the request job was scheduled two hours after the end of the visit
    const job = t.jobs.sent.find((j) => j.name === "feedback.request");
    expect(job?.options.startAfter?.toISOString()).toBe(romeInstant("2026-06-06", "00:00"));
    await t.jobs.flush(t.ctx);
    await t.processEvents();
    const ask = t.sentEmails.find(
      (m) => m.to === "mario@example.com" && m.subject === "How was your visit at Trattoria Test?",
    );
    expect(ask).toBeTruthy();
    const [row] = await t.ctx.db
      .select({ token: booking.manageToken })
      .from(booking)
      .where(eq(booking.id, past.body.id));
    const url = `http://localhost:3000/book/${fx.slug}/feedback/${row?.token}`;
    expect(ask?.html).toContain(url);

    // asking twice does nothing
    const before = t.sentEmails.length;
    await t.jobs.send("feedback.request", {
      bookingId: past.body.id,
      startsAt: romeInstant("2026-06-05", "20:00"),
    });
    await t.jobs.flush(t.ctx);
    await t.processEvents();
    expect(t.sentEmails.length).toBe(before);

    const page = await api<FeedbackPage>(t, "GET", `/api/public/v1/feedback/${row?.token}`);
    expect(page.body).toMatchObject({ canAnswer: true, feedback: null, booking: { partySize: 2 } });
    const answered = await api<FeedbackPage>(t, "POST", `/api/public/v1/feedback/${row?.token}`, {
      rating: 5,
      comment: "Ottima cena, torneremo!",
    });
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    expect(answered.body.feedback).toEqual({ rating: 5, comment: "Ottima cena, torneremo!" });
    await t.processEvents();
    const staffMail = t.sentEmails.find(
      (m) => m.to === "restaurant@example.com" && m.subject.startsWith("Feedback"),
    );
    expect(staffMail?.subject).toBe("Feedback 5/5 da Mario Rossi");
    expect(staffMail?.text).toContain("Ottima cena");

    // the guest changes their mind: same row, no second event
    const changed = await api<FeedbackPage>(t, "POST", `/api/public/v1/feedback/${row?.token}`, {
      rating: 4,
    });
    expect(changed.body.feedback).toEqual({ rating: 4, comment: null });
    const events = await t.ctx.pool.query(
      "select count(*)::int as n from outbox_event where type = 'feedback.received'",
    );
    expect(events.rows[0].n).toBe(1);

    const list = await api<{ items: Array<{ rating: number; customer: { name: string } }> }>(
      t,
      "GET",
      `${base}/feedback`,
      undefined,
      fx.session,
    );
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ rating: 4, customer: { name: "Mario Rossi" } });
    const summary = await api<{ responses: number; averageRating: number; distribution: number[] }>(
      t,
      "GET",
      `${base}/feedback/summary`,
      undefined,
      fx.session,
    );
    expect(summary.body).toEqual({ responses: 1, averageRating: 4, distribution: [0, 0, 0, 1, 0] });
    const analytics = await api<{ feedback: { responses: number; averageRating: number } }>(
      t,
      "GET",
      `${base}/analytics?from=2026-06-01&to=2026-06-14`,
      undefined,
      fx.session,
    );
    expect(analytics.body.feedback).toMatchObject({ responses: 1, averageRating: 4 });
  });

  it("refuses feedback before the visit or for bookings that did not happen", async () => {
    const fx = await createFixture(t);
    const future = await api<{ manageUrl: string; id: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx),
    );
    const token = future.body.manageUrl.split("/").pop();
    const early = await api<{ code: string }>(t, "POST", `/api/public/v1/feedback/${token}`, {
      rating: 5,
    });
    expect(early.body.code).toBe("too_early");

    await api(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/bookings/${future.body.id}/actions`,
      { action: "cancel" },
      fx.session,
    );
    const page = await api<FeedbackPage>(t, "GET", `/api/public/v1/feedback/${token}`);
    expect(page.body.canAnswer).toBe(false);
    const refused = await api<{ code: string }>(t, "POST", `/api/public/v1/feedback/${token}`, {
      rating: 1,
    });
    expect(refused.body.code).toBe("not_visited");
    // and no request job runs for a cancelled booking
    expect(FRIDAY).toBeTruthy();
  });
});
