import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createFixture, createTestApp, guestBooking, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ env: { RATE_LIMIT: "on" } });
});
afterAll(async () => {
  await t.close();
});

describe("rate limiting", () => {
  it("throttles anonymous writes per client address and answers 429 with Retry-After", async () => {
    const fx = await createFixture(t);
    const path = `/api/public/v1/restaurants/${fx.slug}/bookings`;
    // every test request comes from the same (unknown) address; the 31st write in a minute is refused
    let last: Response | null = null;
    for (let i = 0; i < 31; i += 1) {
      last = await t.app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify(guestBooking(fx, { partySize: 0 })), // invalid on purpose: fast 400s
      });
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await last?.json()).toMatchObject({ code: "rate_limited" });
    // reads have their own, larger budget
    const read = await api(t, "GET", `/api/public/v1/restaurants/${fx.slug}/widget-config`);
    expect(read.status).toBe(200);
    // and the X-Forwarded-For header is ignored without TRUST_PROXY, so it is the same bucket
    const other = await t.app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" },
      body: JSON.stringify(guestBooking(fx, { partySize: 0 })),
    });
    expect(other.status).toBe(429);
  });

  it("allows five test sends per restaurant per minute", async () => {
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
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await api(
        t,
        "POST",
        `${base}/notification-providers/email/test`,
        { to: "owner@example.com" },
        fx.session,
      );
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    // another restaurant has its own budget
    const other = await createFixture(t);
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${other.restaurantId}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "T <t@example.com>" },
      },
      other.session,
    );
    const ok = await api(
      t,
      "POST",
      `/api/v1/restaurants/${other.restaurantId}/notification-providers/email/test`,
      { to: "owner@example.com" },
      other.session,
    );
    expect(ok.status).toBe(200);
  });
});
