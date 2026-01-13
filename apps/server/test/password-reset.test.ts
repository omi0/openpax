import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createFixture, createTestApp, PUBLIC_URL, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe("password reset", () => {
  it("emails a reset link through the owner's provider and accepts the new password", async () => {
    const fx = await createFixture(t, { email: "forgetful@example.com" });
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
      {
        providerId: "test-email",
        scope: "organization",
        config: { apiKey: "secret-key-1234", from: "Trattoria <info@example.com>" },
      },
      fx.session,
    );

    const requested = await api(t, "POST", "/api/auth/request-password-reset", {
      email: "forgetful@example.com",
      redirectTo: "/reset-password",
    });
    expect(requested.status).toBe(200);
    await t.processEvents();
    const mail = t.sentEmails.find((m) => m.to === "forgetful@example.com");
    expect(mail?.subject).toContain("Trattoria Test");
    const link = mail?.text.match(/https?:\/\/\S+\/api\/auth\/reset-password\/\S+/)?.[0];
    expect(link).toBeDefined();
    const token = new URL(link ?? "").pathname.split("/").pop() ?? "";

    const reset = await api(t, "POST", "/api/auth/reset-password", {
      newPassword: "brand-new-password-1",
      token,
    });
    expect(reset.status).toBe(200);

    const oldLogin = await t.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: PUBLIC_URL },
      body: JSON.stringify({ email: "forgetful@example.com", password: "password-1234" }),
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await t.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: PUBLIC_URL },
      body: JSON.stringify({ email: "forgetful@example.com", password: "brand-new-password-1" }),
    });
    expect(newLogin.status).toBe(200);

    // unknown addresses get the same answer and no email
    const before = t.sentEmails.length;
    const unknown = await api(t, "POST", "/api/auth/request-password-reset", {
      email: "nobody@example.com",
      redirectTo: "/reset-password",
    });
    expect(unknown.status).toBe(200);
    await t.processEvents();
    expect(t.sentEmails.length).toBe(before);
  });
});
