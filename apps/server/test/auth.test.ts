import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createFixture, createTestApp, signUp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe("auth and restaurants", () => {
  it("signs up, creates a restaurant and an organization, and lists it as owner", async () => {
    const session = await signUp(t, "anna@example.com", "Anna");
    const me = await api<{ user: { email: string }; restaurants: unknown[] }>(
      t,
      "GET",
      "/api/v1/me",
      undefined,
      session,
    );
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("anna@example.com");
    expect(me.body.restaurants).toEqual([]);

    const created = await api<{ id: string; slug: string; organizationId: string }>(
      t,
      "POST",
      "/api/v1/restaurants",
      {
        name: "Osteria del Ponte",
        timezone: "Europe/Rome",
      },
      session,
    );
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe("osteria-del-ponte");

    const list = await api<Array<{ id: string; role: string }>>(
      t,
      "GET",
      "/api/v1/restaurants",
      undefined,
      session,
    );
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: created.body.id, role: "owner" });

    const policy = await api<{ autoConfirm: boolean }>(
      t,
      "GET",
      `/api/v1/restaurants/${created.body.id}/policy`,
      undefined,
      session,
    );
    expect(policy.status).toBe(200);
    expect(policy.body.autoConfirm).toBe(true);

    const widget = await api<{ embedSnippet: string; hostedUrl: string }>(
      t,
      "GET",
      `/api/v1/restaurants/${created.body.id}/widget-config`,
      undefined,
      session,
    );
    expect(widget.body.hostedUrl).toBe("http://localhost:3000/book/osteria-del-ponte");
    expect(widget.body.embedSnippet).toContain('data-restaurant="osteria-del-ponte"');
  });

  it("rejects anonymous and foreign access", async () => {
    const fx = await createFixture(t);
    const anon = await api(t, "GET", `/api/v1/restaurants/${fx.restaurantId}`);
    expect(anon.status).toBe(401);

    const stranger = await signUp(t, "stranger@example.com");
    const denied = await api(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}`,
      undefined,
      stranger,
    );
    expect(denied.status).toBe(403);
    const deniedList = await api(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/bookings?date=2026-06-12`,
      undefined,
      stranger,
    );
    expect(deniedList.status).toBe(403);
  });

  it("gives a second restaurant its own slug within the same organization", async () => {
    const fx = await createFixture(t);
    const body = { name: "Ristorante Unico", timezone: "Europe/Rome" };
    const first = await api<{ slug: string }>(t, "POST", "/api/v1/restaurants", body, fx.session);
    const second = await api<{ slug: string }>(t, "POST", "/api/v1/restaurants", body, fx.session);
    expect(first.body.slug).toBe("ristorante-unico");
    expect(second.status).toBe(201);
    expect(second.body.slug).toBe("ristorante-unico-2");
    const list = await api<unknown[]>(t, "GET", "/api/v1/restaurants", undefined, fx.session);
    expect(list.body).toHaveLength(3);
  });

  it("serves the OpenAPI document", async () => {
    const res = await api<{ openapi: string; paths: Record<string, unknown> }>(
      t,
      "GET",
      "/api/openapi.json",
    );
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.0");
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        "/api/public/v1/restaurants/{slug}/availability",
        "/api/v1/restaurants",
      ]),
    );
  });
});
