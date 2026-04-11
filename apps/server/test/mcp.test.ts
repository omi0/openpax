import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auditLog, booking } from "@sitli/db";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  api,
  createFixture,
  createTestApp,
  type Fixture,
  FRIDAY,
  PUBLIC_URL,
  type Session,
  type TestApp,
} from "./helpers.js";

/**
 * The assistants feature end to end: an MCP client registers itself, the owner
 * authorizes it (login → consent), the client calls the tools with the token,
 * and a disconnect from the settings page cuts it off.
 */

// loopback by IP: OAuth 2.1 treats plain "localhost" as a web host that needs https
const REDIRECT_URI = "http://127.0.0.1:6274/oauth/callback";
const RESOURCE = `${PUBLIC_URL}/mcp`;

let t: TestApp;
let fx: Fixture;

beforeAll(async () => {
  t = await createTestApp();
  fx = await createFixture(t);
});
afterAll(async () => {
  await t.close();
});

const b64url = (buf: Buffer) => buf.toString("base64url");

async function registerClient(name = "Claude") {
  const res = await t.app.request("/api/auth/oauth2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      client_uri: "https://claude.ai",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      // a native app may redirect to a loopback address over plain http
      application_type: "native",
    }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const body = (await res.json()) as { client_id: string };
  return body.client_id;
}

/** Walk the browser part of the flow (authorize → consent) and swap the code for tokens. */
async function connectAssistant(
  session: Session,
  options: { scope?: string; acceptScope?: string; clientId?: string } = {},
) {
  const clientId = options.clientId ?? (await registerClient());
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: options.scope ?? "read write",
    state: "xyz",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
  });
  const authorize = await t.app.request(`/api/auth/oauth2/authorize?${params}`, {
    headers: { cookie: session.cookie },
  });
  expect(authorize.status, await authorize.clone().text()).toBe(302);
  const consentUrl = new URL(authorize.headers.get("location") ?? "", PUBLIC_URL);
  expect(consentUrl.pathname).toBe("/connect");
  expect(consentUrl.searchParams.get("client_id")).toBe(clientId);

  const consent = await api<{ redirect?: boolean; url?: string; redirect_uri?: string }>(
    t,
    "POST",
    "/api/auth/oauth2/consent",
    {
      accept: true,
      ...(options.acceptScope ? { scope: options.acceptScope } : {}),
      oauth_query: consentUrl.search.slice(1),
    },
    session,
  );
  expect(consent.status, JSON.stringify(consent.body)).toBe(200);
  const back = new URL(consent.body.url ?? consent.body.redirect_uri ?? "");
  expect(back.origin + back.pathname).toBe(REDIRECT_URI);
  expect(back.searchParams.get("state")).toBe("xyz");
  const code = back.searchParams.get("code");
  expect(code).toBeTruthy();

  const token = await t.app.request("/api/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code ?? "",
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
      resource: RESOURCE,
    }).toString(),
  });
  expect(token.status, await token.clone().text()).toBe(200);
  const tokens = (await token.json()) as {
    access_token: string;
    refresh_token?: string;
    scope: string;
  };
  return { clientId, ...tokens };
}

async function mcpClient(accessToken: string) {
  const client = new Client({ name: "test", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(RESOURCE), {
    fetch: async (url, init) => t.app.request(url, init),
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
  });
  await client.connect(transport);
  return client;
}

/** Tool results are JSON text; errors are plain sentences for the model. */
const parse = <T = Record<string, unknown>>(result: Awaited<ReturnType<Client["callTool"]>>) => {
  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content.find((c) => c.type === "text")?.text ?? "";
  const isError = result.isError === true;
  return { text, data: (isError ? {} : JSON.parse(text)) as T, isError };
};

describe("discovery", () => {
  it("publishes the protected resource and authorization server metadata at the root", async () => {
    const prm = await t.app.request("/.well-known/oauth-protected-resource/mcp");
    expect(prm.status).toBe(200);
    const resource = (await prm.json()) as Record<string, unknown>;
    expect(resource.resource).toBe(RESOURCE);
    expect(resource.authorization_servers).toEqual([`${PUBLIC_URL}/api/auth`]);
    expect(resource.scopes_supported).toEqual(["read", "write"]);

    const as = await t.app.request("/.well-known/oauth-authorization-server/api/auth");
    expect(as.status).toBe(200);
    const server = (await as.json()) as Record<string, unknown>;
    expect(server.issuer).toBe(`${PUBLIC_URL}/api/auth`);
    expect(server.registration_endpoint).toBe(`${PUBLIC_URL}/api/auth/oauth2/register`);
    expect(server.token_endpoint).toBe(`${PUBLIC_URL}/api/auth/oauth2/token`);
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);

    // clients that only try the bare root paths get the same documents
    const root = await t.app.request("/.well-known/oauth-authorization-server");
    expect(root.status).toBe(200);
    expect(((await root.json()) as { issuer: string }).issuer).toBe(`${PUBLIC_URL}/api/auth`);
    const oidc = await t.app.request("/.well-known/openid-configuration");
    expect(oidc.status).toBe(200);
  });

  it("rejects a dashboard session JWT: only tokens issued for the MCP resource pass", async () => {
    const issued = await t.app.request("/api/auth/token", {
      headers: { cookie: fx.session.cookie },
    });
    expect(issued.status).toBe(200);
    const { token } = (await issued.json()) as { token: string };
    expect(token).toBeTruthy();
    const res = await t.app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("challenges anonymous MCP requests with a pointer to the metadata", async () => {
    const res = await t.app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      `resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`,
    );
    expect(res.headers.get("www-authenticate")).toContain('scope="offline_access read write"');
  });
});

describe("authorization", () => {
  it("issues a refresh token even when the client did not ask for offline_access", async () => {
    const tokens = await connectAssistant(fx.session, { scope: "read write" });
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope.split(" ")).toEqual(
      expect.arrayContaining(["read", "write", "offline_access"]),
    );
  });

  it("continues to the consent page after a login started by an assistant", async () => {
    const clientId = await registerClient("ChatGPT");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "read write",
      state: "s1",
      code_challenge: b64url(
        createHash("sha256").update("verifier-verifier-verifier-verifier").digest(),
      ),
      code_challenge_method: "S256",
      resource: RESOURCE,
    });
    // no session: the authorization server sends the browser to the login page with a signed query
    const anonymous = await t.app.request(`/api/auth/oauth2/authorize?${params}`);
    expect(anonymous.status).toBe(302);
    const login = new URL(anonymous.headers.get("location") ?? "", PUBLIC_URL);
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("sig")).toBeTruthy();

    // the login page passes that query along with the credentials (the client plugin does it)
    const signIn = await t.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: PUBLIC_URL },
      body: JSON.stringify({
        email: fx.session.email,
        password: "password-1234",
        oauth_query: login.search.slice(1),
      }),
    });
    expect(signIn.status, await signIn.clone().text()).toBe(200);
    const body = (await signIn.json()) as { redirect?: boolean; url?: string };
    expect(body.redirect).toBe(true);
    expect(new URL(body.url ?? "", PUBLIC_URL).pathname).toBe("/connect");
  });
});

describe("tools", () => {
  it("lets the owner read the day and take a booking that is marked as the assistant's", async () => {
    const tokens = await connectAssistant(fx.session);
    const client = await mcpClient(tokens.access_token);
    const tools = await client.listTools();
    const names = tools.tools.map((x) => x.name);
    expect(names).toEqual(
      expect.arrayContaining(["get_day", "check_availability", "create_booking", "close_days"]),
    );
    expect(tools.tools.find((x) => x.name === "get_day")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.tools.find((x) => x.name === "booking_action")?.annotations?.destructiveHint).toBe(
      true,
    );

    const restaurants = parse<{ restaurants: Array<{ id: string; role: string; today: string }> }>(
      await client.callTool({ name: "list_restaurants", arguments: {} }),
    );
    expect(restaurants.data.restaurants).toEqual([
      expect.objectContaining({ id: fx.restaurantId, role: "owner", today: "2026-06-10" }),
    ]);

    const free = parse<{ free: Array<{ time: string }> }>(
      await client.callTool({
        name: "check_availability",
        arguments: { date: FRIDAY, partySize: 4 },
      }),
    );
    expect(free.data.free.map((s) => s.time)).toContain("20:00");

    const created = parse<{ booking: { id: string; time: string; guest: { name: string } } }>(
      await client.callTool({
        name: "create_booking",
        arguments: {
          date: FRIDAY,
          time: "20:00",
          partySize: 4,
          guest: { name: "Lucia Bianchi", phone: "+39 333 7654321" },
          notes: "compleanno",
        },
      }),
    );
    expect(created.isError, created.text).toBe(false);
    expect(created.data.booking).toMatchObject({
      time: "20:00",
      guest: { name: "Lucia Bianchi" },
    });

    const [row] = await t.ctx.db
      .select({ source: booking.source, status: booking.status })
      .from(booking)
      .where(eq(booking.id, created.data.booking.id));
    expect(row).toEqual({ source: "assistant", status: "confirmed" });
    const [audit] = await t.ctx.db
      .select({ action: auditLog.action, actorId: auditLog.actorId, data: auditLog.data })
      .from(auditLog)
      .where(eq(auditLog.entityId, created.data.booking.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    expect(audit).toMatchObject({
      action: "booking.created",
      actorId: fx.session.userId,
      data: expect.objectContaining({ via: "assistant" }),
    });

    // the same request again (a retry after a timeout) returns the booking already made
    const again = parse<{ booking: { id: string } }>(
      await client.callTool({
        name: "create_booking",
        arguments: {
          date: FRIDAY,
          time: "20:00",
          partySize: 4,
          guest: { name: "Lucia Bianchi", phone: "+39 333 7654321" },
          notes: "compleanno",
        },
      }),
    );
    expect(again.data.booking.id).toBe(created.data.booking.id);

    // a time that is not a slot gets the nearby bookable times, not a bare reason code
    const odd = parse(
      await client.callTool({
        name: "create_booking",
        arguments: { date: FRIDAY, time: "20:10", partySize: 2, guest: { name: "Anna" } },
      }),
    );
    expect(odd.isError).toBe(true);
    expect(odd.text).toMatch(/No booking starts at 20:10/);
    expect(odd.text).toMatch(/20:30/);

    const day = parse<{ totals: { bookings: number; covers: number }; bookings: unknown[] }>(
      await client.callTool({ name: "get_day", arguments: { date: FRIDAY } }),
    );
    expect(day.data.totals).toMatchObject({ bookings: 1, covers: 4 });

    // the closure asks for confirmation first because a booking sits on that day
    const preview = parse<{ needsConfirmation?: boolean; affectedBookings: unknown[] }>(
      await client.callTool({
        name: "close_days",
        arguments: { from: FRIDAY, reason: "private event" },
      }),
    );
    expect(preview.data.needsConfirmation).toBe(true);
    expect(preview.data.affectedBookings).toHaveLength(1);
    const closed = parse<{ closed: boolean }>(
      await client.callTool({
        name: "close_days",
        arguments: { from: FRIDAY, reason: "private event", confirm: true },
      }),
    );
    expect(closed.data.closed).toBe(true);

    const cancelled = parse<{ booking: { status: string } }>(
      await client.callTool({
        name: "booking_action",
        arguments: { bookingId: created.data.booking.id, action: "cancel", reason: "closed" },
      }),
    );
    expect(cancelled.data.booking.status).toBe("cancelled");

    const missing = parse(
      await client.callTool({
        name: "create_booking",
        arguments: { date: FRIDAY, time: "20:00", partySize: 2, guest: { name: "Nessuno" } },
      }),
    );
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/closed/);
    await client.close();
  });

  it("hides the write tools from a read-only connection and from what the role cannot do", async () => {
    const readOnly = await connectAssistant(fx.session, {
      acceptScope: "read offline_access",
      clientId: await registerClient("Read-only"),
    });
    expect(readOnly.scope.split(" ")).not.toContain("write");
    const client = await mcpClient(readOnly.access_token);
    const names = (await client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("get_day");
    expect(names).not.toContain("create_booking");
    await client.close();

    const staff = await addMember(t, fx, "staff");
    const staffTokens = await connectAssistant(staff, { clientId: await registerClient("Staff") });
    const staffClient = await mcpClient(staffTokens.access_token);
    const staffTools = (await staffClient.listTools()).tools.map((x) => x.name);
    expect(staffTools).toContain("create_booking");
    expect(staffTools).not.toContain("close_days");
    await staffClient.close();
  });
});

describe("settings", () => {
  it("lists the user's connections and disconnecting one stops its token at once", async () => {
    const owner = await createFixture(t);
    const tokens = await connectAssistant(owner.session, {
      clientId: await registerClient("Claude"),
    });
    const client = await mcpClient(tokens.access_token);
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);

    const status = await api<{
      enabled: boolean;
      url: string | null;
      connections: Array<{ id: string; clientName: string | null; canWrite: boolean }>;
    }>(t, "GET", "/api/v1/assistants", undefined, owner.session);
    expect(status.status).toBe(200);
    expect(status.body.enabled).toBe(true);
    expect(status.body.url).toBe(RESOURCE);
    expect(status.body.connections).toEqual([
      expect.objectContaining({ clientName: "Claude", canWrite: true }),
    ]);

    const connectionId = status.body.connections[0]?.id ?? "";
    const revoked = await api(
      t,
      "DELETE",
      `/api/v1/assistants/connections/${connectionId}`,
      undefined,
      owner.session,
    );
    expect(revoked.status).toBe(204);
    await expect(client.listTools()).rejects.toThrow();
    const raw = await t.app.request("/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(raw.status, await raw.clone().text()).toBe(401);
    expect(raw.headers.get("www-authenticate")).toContain('error="invalid_token"');
    // the refresh token was revoked too: the assistant cannot quietly come back
    const refresh = await t.app.request("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token ?? "",
        client_id: tokens.clientId,
      }).toString(),
    });
    expect(refresh.status).toBeGreaterThanOrEqual(400);
    const after = await api<{ connections: unknown[] }>(
      t,
      "GET",
      "/api/v1/assistants",
      undefined,
      owner.session,
    );
    expect(after.body.connections).toEqual([]);
  });
});
