import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  api,
  createFixture,
  createTestApp,
  FRIDAY,
  signUp,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Member {
  id: string;
  email: string;
  role: string;
}
interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
}
interface Team {
  organizationName: string;
  members: Member[];
  invitations: Invitation[];
}

const team = (fx: { restaurantId: string }) => `/api/v1/restaurants/${fx.restaurantId}/team`;
const keys = (fx: { restaurantId: string }) => `/api/v1/restaurants/${fx.restaurantId}/api-keys`;

describe("team", () => {
  it("invites by email, emails the link through the organization's provider, and onboards the invitee", async () => {
    const fx = await createFixture(t);
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

    const invited = await api<Invitation>(
      t,
      "POST",
      `${team(fx)}/invitations`,
      { email: "Giulia@example.com", role: "staff" },
      fx.session,
    );
    expect(invited.status).toBe(201);
    expect(invited.body).toMatchObject({
      email: "giulia@example.com",
      role: "staff",
      status: "pending",
    });

    await t.processEvents();
    const mail = t.sentEmails.find((m) => m.to === "giulia@example.com");
    expect(mail?.subject).toContain("Trattoria Test");
    expect(mail?.text).toContain(`/invitations/${invited.body.id}`);

    const preview = await api<{ email: string; organizationName: string; status: string }>(
      t,
      "GET",
      `/api/v1/invitations/${invited.body.id}`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      email: "giulia@example.com",
      organizationName: "Trattoria Test",
      status: "pending",
    });

    const before = await api<Team>(t, "GET", team(fx), undefined, fx.session);
    expect(before.body.members).toHaveLength(1);
    expect(before.body.invitations.map((i) => i.email)).toEqual(["giulia@example.com"]);

    const giulia = await signUp(t, "giulia@example.com", "Giulia");
    const accepted = await api<{ organizationId: string }>(
      t,
      "POST",
      `/api/v1/invitations/${invited.body.id}/accept`,
      undefined,
      giulia,
    );
    expect(accepted.status).toBe(200);
    const me = await api<{ restaurants: Array<{ id: string; role: string }> }>(
      t,
      "GET",
      "/api/v1/me",
      undefined,
      giulia,
    );
    expect(me.body.restaurants).toEqual([
      expect.objectContaining({ id: fx.restaurantId, role: "staff" }),
    ]);

    const denied = await api(
      t,
      "POST",
      `${team(fx)}/invitations`,
      { email: "cook@example.com" },
      giulia,
    );
    expect(denied.status).toBe(403);

    const after = await api<Team>(t, "GET", team(fx), undefined, fx.session);
    expect(after.body.invitations).toHaveLength(0);
    const member = after.body.members.find((m) => m.email === "giulia@example.com");
    if (!member) throw new Error("member missing");
    expect(member.role).toBe("staff");

    const promoted = await api<Member>(
      t,
      "PATCH",
      `${team(fx)}/members/${member.id}`,
      { role: "manager" },
      fx.session,
    );
    expect(promoted.status).toBe(200);
    expect(promoted.body.role).toBe("manager");
    const nowAllowed = await api(
      t,
      "POST",
      `${team(fx)}/invitations`,
      { email: "cook@example.com" },
      giulia,
    );
    expect(nowAllowed.status).toBe(201);

    const self = await api(t, "DELETE", `${team(fx)}/members/${member.id}`, undefined, giulia);
    expect(self.status).toBe(403);
    const removed = await api(
      t,
      "DELETE",
      `${team(fx)}/members/${member.id}`,
      undefined,
      fx.session,
    );
    expect(removed.status).toBe(204);
    const gone = await api(t, "GET", `/api/v1/restaurants/${fx.restaurantId}`, undefined, giulia);
    expect(gone.status).toBe(403);
  });

  it("keeps the invitation and logs a skip when no email provider is configured", async () => {
    const fx = await createFixture(t);
    const invited = await api<Invitation>(
      t,
      "POST",
      `${team(fx)}/invitations`,
      { email: "nobody@example.com" },
      fx.session,
    );
    expect(invited.status).toBe(201);
    await t.processEvents();
    const rows = await t.ctx.pool.query(
      "select status, error from notification_log where event = 'team.invitation' and recipient = $1",
      ["nobody@example.com"],
    );
    expect(rows.rows[0]).toMatchObject({
      status: "skipped",
      error: "no email provider configured",
    });
    const cancelled = await api(
      t,
      "DELETE",
      `${team(fx)}/invitations/${invited.body.id}`,
      undefined,
      fx.session,
    );
    expect(cancelled.status).toBe(204);
    const preview = await api<{ status: string }>(
      t,
      "GET",
      `/api/v1/invitations/${invited.body.id}`,
    );
    expect(preview.body.status).not.toBe("pending");
  });
});

describe("api keys", () => {
  it("creates organization keys that authenticate the staff API, hides secrets, and revokes them", async () => {
    const fx = await createFixture(t);
    const created = await api<{ id: string; key: string; name: string }>(
      t,
      "POST",
      keys(fx),
      { name: "POS integration" },
      fx.session,
    );
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^sitli_/);

    const list = await api<Array<Record<string, unknown>>>(
      t,
      "GET",
      keys(fx),
      undefined,
      fx.session,
    );
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: created.body.id, name: "POS integration" });
    expect(list.body[0]).not.toHaveProperty("key");

    const viaKey = await api(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/bookings?date=${FRIDAY}`,
      undefined,
      null,
      { "x-api-key": created.body.key },
    );
    expect(viaKey.status).toBe(200);
    const keyCannotMint = await api(t, "POST", keys(fx), { name: "nope" }, null, {
      "x-api-key": created.body.key,
    });
    expect(keyCannotMint.status).toBe(403);

    const staff = await addMember(t, fx, "staff");
    const staffDenied = await api(t, "GET", keys(fx), undefined, staff);
    expect(staffDenied.status).toBe(403);

    const removed = await api(t, "DELETE", `${keys(fx)}/${created.body.id}`, undefined, fx.session);
    expect(removed.status).toBe(204);
    const rejected = await api(
      t,
      "GET",
      `/api/v1/restaurants/${fx.restaurantId}/bookings?date=${FRIDAY}`,
      undefined,
      null,
      { "x-api-key": created.body.key },
    );
    expect(rejected.status).toBe(401);
  });
});
