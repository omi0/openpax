import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createTestApp, signUp, type TestApp, trySignUp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ env: { SIGNUP_MODE: "first_user" } });
});
afterAll(async () => {
  await t.close();
});

describe("signup mode first_user", () => {
  it("lets the first account in, then only invited emails", async () => {
    const before = await api<{ signupOpen: boolean; signupMode: string }>(
      t,
      "GET",
      "/api/v1/auth-config",
    );
    expect(before.body).toEqual({ signupMode: "first_user", signupOpen: true });

    const owner = await signUp(t, "owner@example.com", "Owner");
    const after = await api<{ signupOpen: boolean }>(t, "GET", "/api/v1/auth-config");
    expect(after.body.signupOpen).toBe(false);

    const stranger = await trySignUp(t, "stranger@example.com");
    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toMatchObject({ code: "SIGNUP_CLOSED" });

    const created = await api<{ id: string }>(
      t,
      "POST",
      "/api/v1/restaurants",
      { name: "Casa Mia", timezone: "Europe/Rome" },
      owner,
    );
    const invited = await api(
      t,
      "POST",
      `/api/v1/restaurants/${created.body.id}/team/invitations`,
      { email: "Cook@example.com", role: "staff" },
      owner,
    );
    expect(invited.status).toBe(201);
    const cook = await trySignUp(t, "cook@example.com", "Cook");
    expect(cook.status).toBe(200);
  });
});
