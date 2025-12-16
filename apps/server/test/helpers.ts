import type { OpenAPIHono } from "@hono/zod-openapi";
import { member, restaurant } from "@sitli/db";
import { createTestDatabase, type TestDatabase } from "@sitli/db/testing";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { buildContext } from "../src/bootstrap.js";
import type { AppContext, AppEnv } from "../src/context.js";
import { loadEnv } from "../src/env.js";
import {
  buildHandlerRegistry,
  type HandlerRegistry,
  relayOutboxOnce,
} from "../src/events/dispatch.js";
import { MemoryJobQueue } from "../src/jobs/memory-queue.js";
import { createLogger } from "../src/logger.js";
import { modules } from "../src/modules/index.js";
import {
  defineProvider,
  type EmailMessage,
  type SmsMessage,
} from "../src/notifications/provider.js";

export const PUBLIC_URL = "http://localhost:3000";
/** Wednesday 2026-06-10 12:00 in Rome. */
export const NOW = new Date("2026-06-10T10:00:00Z");
/** Friday. */
export const FRIDAY = "2026-06-12";

export interface TestApp {
  app: OpenAPIHono<AppEnv>;
  ctx: AppContext;
  jobs: MemoryJobQueue;
  registry: HandlerRegistry;
  sentEmails: EmailMessage[];
  sentSms: SmsMessage[];
  /** Deliver outbox events and run queued jobs until nothing is left. */
  processEvents: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestApp(options: { now?: Date } = {}): Promise<TestApp> {
  const testDb: TestDatabase = await createTestDatabase();
  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: testDb.connectionString,
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    PUBLIC_URL,
    LOG_LEVEL: "silent",
  });
  const logger = createLogger("silent", false);
  const jobs = new MemoryJobQueue();
  jobs.register(modules.flatMap((m) => m.jobs ?? []));
  const now = options.now ?? NOW;
  const ctx = buildContext({ env, logger, modules, jobs, now: () => now });

  const sentEmails: EmailMessage[] = [];
  const sentSms: SmsMessage[] = [];
  ctx.providers.register([
    defineProvider({
      id: "test-email",
      channel: "email",
      label: "Test email",
      fields: [
        { key: "apiKey", label: "API key", type: "password", required: true, secret: true },
        { key: "from", label: "From", type: "email", required: true, secret: false },
      ],
      async send(message, config) {
        if (config.apiKey !== "secret-key-1234") throw new Error("bad api key");
        sentEmails.push(message);
        return { providerMessageId: `test-${sentEmails.length}` };
      },
    }),
    defineProvider({
      id: "test-sms",
      channel: "sms",
      label: "Test SMS",
      fields: [{ key: "from", label: "From", type: "text", required: true, secret: false }],
      async send(message) {
        sentSms.push(message);
        return { providerMessageId: `sms-${sentSms.length}` };
      },
    }),
  ]);

  const registry = buildHandlerRegistry(modules.flatMap((m) => m.eventHandlers ?? []));
  const app = createApp(ctx, modules);

  return {
    app,
    ctx,
    jobs,
    registry,
    sentEmails,
    sentSms,
    processEvents: async () => {
      for (let i = 0; i < 5; i += 1) {
        const delivered = await relayOutboxOnce(ctx, registry);
        const ran = await jobs.flush(ctx, now);
        if (delivered === 0 && ran === 0) break;
      }
    },
    close: async () => {
      await ctx.pool.end();
      await testDb.cleanup();
    },
  };
}

export interface Session {
  cookie: string;
  userId: string;
  email: string;
}

function cookieHeaderFrom(res: Response): string {
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

export async function signUp(t: TestApp, email: string, name = "Test Owner"): Promise<Session> {
  const res = await t.app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: PUBLIC_URL },
    body: JSON.stringify({ email, password: "password-1234", name }),
  });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  return { cookie: cookieHeaderFrom(res), userId: body.user.id, email };
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

export async function api<T = unknown>(
  t: TestApp,
  method: string,
  path: string,
  body?: unknown,
  session?: Session | null,
  extraHeaders: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const res = await t.app.request(path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(session ? { cookie: session.cookie } : {}),
      origin: PUBLIC_URL,
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T };
}

export interface Fixture {
  session: Session;
  restaurantId: string;
  slug: string;
  serviceId: string;
}

export const everyDay = (start: string, end: string) => ({
  mon: [{ start, end }],
  tue: [{ start, end }],
  wed: [{ start, end }],
  thu: [{ start, end }],
  fri: [{ start, end }],
  sat: [{ start, end }],
  sun: [{ start, end }],
});

/** Owner + restaurant (Europe/Rome) + dinner service 19:00–22:00, max 20 covers per 30-minute slot. */
export async function createFixture(
  t: TestApp,
  opts: { email?: string; maxCoversPerSlot?: number | null; restaurantEmail?: string } = {},
): Promise<Fixture> {
  const session = await signUp(
    t,
    opts.email ?? `owner-${Math.random().toString(36).slice(2)}@example.com`,
  );
  const created = await api<{ id: string; slug: string }>(
    t,
    "POST",
    "/api/v1/restaurants",
    {
      name: "Trattoria Test",
      timezone: "Europe/Rome",
      locale: "it",
      email: opts.restaurantEmail ?? "restaurant@example.com",
      phone: "+39 051 1234567",
      address: "Via Roma 1, Bologna",
    },
    session,
  );
  if (created.status !== 201)
    throw new Error(`restaurant create failed: ${JSON.stringify(created.body)}`);
  const service = await api<{ id: string }>(
    t,
    "POST",
    `/api/v1/restaurants/${created.body.id}/services`,
    {
      name: "Cena",
      weeklyHours: everyDay("19:00", "22:00"),
      slotIntervalMinutes: 30,
      durationMinutes: 120,
      maxCoversPerSlot: opts.maxCoversPerSlot === undefined ? 20 : opts.maxCoversPerSlot,
    },
    session,
  );
  if (service.status !== 201)
    throw new Error(`service create failed: ${JSON.stringify(service.body)}`);
  return {
    session,
    restaurantId: created.body.id,
    slug: created.body.slug,
    serviceId: service.body.id,
  };
}

/** Sign up a new user and add them to the fixture's organization with the given role. */
export async function addMember(
  t: TestApp,
  fx: Fixture,
  role: "owner" | "manager" | "staff",
  email = `${role}-${Math.random().toString(36).slice(2)}@example.com`,
): Promise<Session> {
  const session = await signUp(t, email, `${role} user`);
  const [r] = await t.ctx.db
    .select({ organizationId: restaurant.organizationId })
    .from(restaurant)
    .where(eq(restaurant.id, fx.restaurantId))
    .limit(1);
  if (!r) throw new Error("fixture restaurant missing");
  await t.ctx.db.insert(member).values({
    organizationId: r.organizationId,
    userId: session.userId,
    role,
    createdAt: new Date(),
  });
  return session;
}

/** 20:00 Rome on the given date, as an ISO instant. */
export const romeInstant = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number);
  // June: CEST = UTC+2
  return new Date(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      (h ?? 0) - 2,
      m ?? 0,
    ),
  ).toISOString();
};

export function guestBooking(fx: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    serviceId: fx.serviceId,
    startsAt: romeInstant(FRIDAY, "20:00"),
    partySize: 2,
    guest: {
      name: "Mario Rossi",
      email: "mario@example.com",
      phone: "+39 333 1234567",
      locale: "it",
    },
    ...overrides,
  };
}
