# Architecture

Sitli is a TypeScript monorepo (pnpm + Turborepo). One Node process serves the
API, runs background jobs and serves the built dashboard and widget.

```
apps/
  server/      Hono API · Better Auth · pg-boss jobs · outbox relay · static files
  dashboard/   React SPA (TanStack Router + Query, Tailwind)
  widget/      Preact booking flow served in an iframe + embed.js loader
packages/
  core/        Pure domain: availability engine, booking state machine, domain events
  db/          Drizzle schema + migrations + test database helper
  shared/      Zod schemas and DTO types shared by server, dashboard and widget
  emails/      React email templates (IT/EN)
```

## Request flow

1. The **widget** calls only `/api/public/*`: widget config, availability, create booking, manage/cancel by token. These endpoints are unauthenticated and CORS-open.
2. The **dashboard** calls `/api/v1/*` with the Better Auth session cookie. Every restaurant route runs `requireRestaurant(permissions)`, which resolves the restaurant, checks the caller's membership in its organization and their role (`owner`, `manager`, `staff`), or accepts an organization API key (`X-Api-Key`).
3. Routes are declared with `@hono/zod-openapi`, so `/api/openapi.json` is generated from the same Zod schemas that validate requests.

## Availability

`packages/core` computes availability from plain data: services (weekly hours,
slot interval, turn time, pacing limits), exceptions, capacity rules, the
booking policy and the existing bookings. It has no I/O and is covered by unit
tests, including DST transitions and services that cross midnight.

Booking creation re-runs the exact same check inside a transaction that holds
a Postgres advisory lock on `(restaurant, service date)`, so concurrent
requests can never overbook a slot. The integration test fires 20 parallel
bookings at a 1-party slot and asserts exactly one succeeds.

## Events, jobs and modules

Anything that changes a booking writes a **domain event** to the `outbox_event`
table in the same transaction. A relay delivers unpublished events to
in-process handlers (`FOR UPDATE SKIP LOCKED`, so several workers can run).
Handlers must be idempotent.

Work that can fail or must wait (sending an email, a reminder 24h before
arrival) goes through **pg-boss**, a Postgres-backed queue: no Redis.

Features are **modules** (`apps/server/src/modules/*`). A module declares:

```ts
defineModule({
  name: "notifications",
  routes: (app, ctx) => { ... },      // Hono routes
  jobs: [sendNotificationJob],        // pg-boss queues + handlers
  eventHandlers: [onBookingCreated],  // outbox subscribers
  providers: [smtpProvider],          // notification providers (optional)
});
```

Modules never import each other's internals. To add a feature (say, a
waitlist), add a module that subscribes to the events it needs and exposes its
own routes and jobs, then register it in `modules/index.ts`.

## Notification providers

Email and SMS are provider-agnostic. A provider is one file:

```ts
export const resendProvider = defineProvider({
  id: "resend",
  channel: "email",
  label: "Resend",
  fields: [
    { key: "apiKey", label: "API key", type: "password", required: true, secret: true },
    { key: "from", label: "From", type: "email", required: true, secret: false },
  ],
  async send(message, config) { ... },
});
```

The field list drives the settings form in the dashboard, the validation
schema and secret masking. Secret fields are encrypted with AES-256-GCM
(`APP_ENCRYPTION_KEY`) before they are stored. Configuration resolves
restaurant → organization → instance `SMTP_URL` fallback (email only).

Which messages go out is a per-restaurant matrix of event × channel ×
audience (`notification_setting`), edited under Settings → Notifications → Rules.

## Data model (main tables)

`organization`, `member`, `user`, `session`, `apikey` (Better Auth) ·
`restaurant` · `area` · `service` · `schedule_exception` · `capacity_rule` ·
`booking_policy` · `widget_config` · `customer` · `booking` ·
`notification_provider_config` · `notification_setting` · `notification_log` ·
`outbox_event` · `audit_log`.

Times are stored as `timestamptz`; every booking also carries its
`service_date` in the restaurant's timezone (an after-midnight slot belongs to
the previous day).

## Adding a migration

Edit `packages/db/src/schema/*.ts`, then `pnpm db:generate`. Migrations run
automatically when the server starts. After upgrading Better Auth, run
`pnpm auth:generate` to refresh `packages/db/src/schema/auth.ts` and generate
a migration for any change.
