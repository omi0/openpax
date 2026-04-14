import { auditLog } from "@openpax/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  api,
  createFixture,
  createTestApp,
  type Fixture,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Status {
  steps: Array<{ step: string; done: boolean; reviewed: boolean }>;
  done: number;
  total: number;
  completedAt: string | null;
  facts: {
    services: number;
    rooms: number;
    roomsMissingSeats: number;
    emailProvider: string;
    members: number;
    pendingInvitations: number;
    restaurantEmail: boolean;
  };
}

const setupPath = (fx: Fixture) => `/api/v1/restaurants/${fx.restaurantId}/setup`;

async function status(fx: Fixture) {
  const res = await api<Status>(t, "GET", setupPath(fx), undefined, fx.session);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return {
    ...res.body,
    is: Object.fromEntries(res.body.steps.map((s) => [s.step, s.done])) as Record<string, boolean>,
  };
}

describe("setup guide", () => {
  it("judges the steps from the configuration", async () => {
    const fx = await createFixture(t);
    let s = await status(fx);
    expect(s.total).toBe(7);
    expect(s.completedAt).toBeNull();
    expect(s.is).toEqual({
      restaurant: true,
      services: true, // the fixture creates a dinner service with hours
      rooms: false, // no room yet
      policy: false,
      notifications: false, // no provider and no SMTP_URL in tests
      team: false, // the owner alone
      widget: false,
    });
    expect(s.done).toBe(2);
    expect(s.facts).toMatchObject({
      services: 1,
      rooms: 0,
      emailProvider: "none",
      members: 1,
      pendingInvitations: 0,
      restaurantEmail: true,
    });

    // a room with seats completes the rooms step; one without seats reopens it
    const room = await api<{ id: string }>(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/areas`,
      { name: "Sala", seats: 40, active: true, sortOrder: 0 },
      fx.session,
    );
    expect(room.status).toBe(201);
    s = await status(fx);
    expect(s.is.rooms).toBe(true);
    const terrace = await api<{ id: string }>(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/areas`,
      { name: "Terrazza", seats: null, active: true, sortOrder: 1 },
      fx.session,
    );
    expect(terrace.status).toBe(201);
    s = await status(fx);
    expect(s.is.rooms).toBe(false);
    expect(s.facts.roomsMissingSeats).toBe(1);

    // an email provider completes notifications
    const provider = await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "Trattoria <info@example.com>" },
      },
      fx.session,
    );
    expect(provider.status).toBe(200);
    s = await status(fx);
    expect(s.is.notifications).toBe(true);
    expect(s.facts.emailProvider).toBe("restaurant");

    // a pending invitation completes the team step
    const invite = await api(
      t,
      "POST",
      `/api/v1/restaurants/${fx.restaurantId}/team/invitations`,
      { email: "waiter@example.com", role: "staff" },
      fx.session,
    );
    expect(invite.status, JSON.stringify(invite.body)).toBe(201);
    s = await status(fx);
    expect(s.is.team).toBe(true);
    expect(s.facts.pendingInvitations).toBe(1);

    // a service without hours does not count
    const svc = await api<{ id: string }>(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/services`,
      undefined,
      fx.session,
    );
    const [dinner] = svc.body as unknown as Array<{ id: string; weeklyHours: unknown }>;
    const noHours = await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/services/${dinner?.id}`,
      {
        name: "Cena",
        weeklyHours: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        slotIntervalMinutes: 30,
        durationMinutes: 120,
      },
      fx.session,
    );
    expect(noHours.status, JSON.stringify(noHours.body)).toBe(200);
    s = await status(fx);
    expect(s.is.services).toBe(false);
    expect(s.facts.services).toBe(0);
  });

  it("records reviewed steps, finishes and reopens the guide", async () => {
    const fx = await createFixture(t);
    let res = await api<Status>(
      t,
      "PATCH",
      setupPath(fx),
      { reviewed: ["policy", "widget", "team"] },
      fx.session,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    let is = Object.fromEntries(res.body.steps.map((s) => [s.step, s.done]));
    expect(is.policy).toBe(true);
    expect(is.widget).toBe(true);
    expect(is.team).toBe(true);
    expect(res.body.steps.find((s) => s.step === "rooms")?.reviewed).toBe(false);
    expect(res.body.completedAt).toBeNull();

    res = await api<Status>(t, "PATCH", setupPath(fx), { completed: true }, fx.session);
    expect(res.status).toBe(200);
    expect(res.body.completedAt).not.toBeNull();
    const finishedAt = res.body.completedAt;

    // finishing again keeps the first timestamp; reviewed steps survive
    res = await api<Status>(
      t,
      "PATCH",
      setupPath(fx),
      { completed: true, reviewed: ["rooms"] },
      fx.session,
    );
    expect(res.body.completedAt).toBe(finishedAt);
    is = Object.fromEntries(res.body.steps.map((s) => [s.step, s.done]));
    expect(is.rooms).toBe(true); // no rooms but reviewed: pacing-only capacity is a choice
    expect(is.policy).toBe(true);

    res = await api<Status>(t, "PATCH", setupPath(fx), { completed: false }, fx.session);
    expect(res.body.completedAt).toBeNull();

    const audit = await t.ctx.db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.restaurantId, fx.restaurantId));
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["setup.completed", "setup.reopened"]),
    );
  });

  it("lets staff read the status but not change it", async () => {
    const fx = await createFixture(t);
    const staff = await addMember(t, fx, "staff");
    const read = await api<Status>(t, "GET", setupPath(fx), undefined, staff);
    expect(read.status).toBe(200);
    const write = await api(t, "PATCH", setupPath(fx), { completed: true }, staff);
    expect(write.status).toBe(403);
    const anon = await api(t, "GET", setupPath(fx));
    expect(anon.status).toBe(401);
  });
});

describe("setup guide with the instance SMTP fallback", () => {
  let smtpApp: TestApp;
  beforeAll(async () => {
    smtpApp = await createTestApp({
      env: {
        SMTP_URL: "smtp://user:pass@mail.example.com:587",
        SMTP_FROM: "OpenPax <no@example.com>",
      },
    });
  });
  afterAll(async () => {
    await smtpApp.close();
  });

  it("counts the server-wide mail settings as a working email channel", async () => {
    const fx = await createFixture(smtpApp);
    const res = await api<Status>(smtpApp, "GET", setupPath(fx), undefined, fx.session);
    expect(res.status).toBe(200);
    expect(res.body.steps.find((s) => s.step === "notifications")?.done).toBe(true);
    expect(res.body.facts.emailProvider).toBe("instance");
  });
});
