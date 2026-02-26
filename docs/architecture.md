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

Modules never import each other's internals. A module may export a small
public API from its `index.ts` for synchronous flows that another feature has
to drive (the `bookings` module exports `createBooking` and
`applyBookingAction`, used by the waitlist to turn an accepted offer into a
booking); everything else in a module directory is private. To add a
feature, add a module that subscribes to the events it needs and exposes its
own routes and jobs, then register it in `modules/index.ts`.

Current modules: `restaurants` (restaurants, services, policy, widget config,
areas, closures, capacity rules), `availability`, `widget` (hosted page config),
`bookings`, `waitlist`, `tables`, `payments`, `feedback`, `customers`, `csv`, `notifications`, `team`, `api-keys`, `analytics`
(read-only aggregates over bookings; capacity offered = slots × max covers per
slot from the service hours and closures; every report also carries the same
totals for the previous period of equal length, party-size and lead-time
distributions, and can be downloaded as CSV).

### Tables and the floor plan

`dining_table` rows (name, area, min/max guests, shape, position on a
100 × 70 plan, joinable, priority) are optional. As soon as a restaurant has
an active table, the availability engine also requires a free table for the
whole visit: `packages/core/src/tables/tables.ts` picks the single free
table that wastes the fewest seats, else the pair of joinable tables in the
same area that does (`findTableAssignment`), and a slot with no fit is
reported as `no_table`. Booking creation runs the same function inside the
booking transaction and stores the choice in `booking_table`; modifying the
time or party size reseats the booking, cancelling frees the tables (only
active statuses count as load). Staff override (`ignoreCapacity`) creates
the booking unassigned; the Today page flags it and offers manual
assignment (`PUT /bookings/{id}/tables`, which refuses a taken table unless
`force`). Settings → Tables holds the CRUD and a drag-and-drop plan; Today
has a floor view for any time of the day.

### Deposits and no-show protection

Settings → Payments stores the restaurant's Stripe secret key and webhook
signing secret (encrypted in `payment_config`) and the policy: `deposit`
(pay per guest up front), `card_hold` (save a card, charge the fee on
no-show) or `off`, with an amount per guest, an optional minimum party size,
the payment window and the auto refund / auto charge switches. Only online
bookings are affected. `createBooking` asks the payments module for a
requirement, creates the booking as `pending` and, once committed, opens a
Stripe Checkout session (`booking_payment`); the guest sees the pay button in
the widget confirmation and gets a "pay to confirm" email instead of the
pending one. Completion arrives through the per-restaurant webhook
(`/api/public/v1/payments/stripe/webhook/{restaurantId}`) or is settled when
the guest opens their booking link, and a `payment.expire` job cancels
unpaid bookings when the window closes. A cancelled booking refunds a paid
deposit; a no-show charges the saved card off-session. Stripe is called over
its REST API (`apps/server/src/payments/stripe.ts`) behind a small
`PaymentGateway` interface so tests use an in-memory fake.

### Post-visit feedback

Every booking that ends up confirmed schedules a `feedback.request` job for
the end of the visit plus the delay set in Settings → Notifications (the
"hours after" field of the *Feedback request* rule; default two hours,
switching every channel off disables requests). The job checks the booking
still looks like a visit (confirmed, seated or completed) and emits
`feedback.requested`; the notifications module turns it into the email/SMS
with the link `/book/{slug}/feedback/{manageToken}`. The guest rates 1–5 with
an optional comment (`booking_feedback`, one row per booking, editable);
the first answer emits `feedback.received`, which notifies the restaurant.
The Feedback page lists answers with the average and the star distribution,
and the analytics report carries the same summary for its period.

### CSV import and export

The `csv` module exports bookings (with the list filters) and the guest book
as UTF-8 CSV with a BOM, and imports both from CSV posted as `text/csv`
(`?dryRun=1` validates and counts without writing). Headers are matched
loosely (English, Italian and the export's own names; `;` and tab
delimiters are detected). Guests are matched by email, then phone, and
updated (tags merged, notes appended); bookings are created with
`imported: { status }`, which skips capacity, lands straight in the given
status (past rows default to `completed`, future ones to `confirmed`),
counts the visit or no-show on the guest, and flags the `booking.created`
event so no message or feedback request goes out. Rows that duplicate an
existing booking (same instant and guest) are skipped. The parser lives in
`apps/server/src/lib/csv.ts`.

### Waitlist

When the booking policy enables it, the widget offers "join the waitlist" on
a date with no bookable time. An entry (`waitlist_entry`) stores the guest,
date, party size and an optional preferred time and service; it does **not**
hold capacity. Staff see the day's queue on the Today page and can offer a
slot, book the guest straight in, or remove them. An offer sets
`offered_starts_at` / `offer_expires_at` (validity from the policy, default
two hours), emails/texts the guest a link (`/book/{slug}/waitlist/{token}`)
and schedules a `waitlist.expire` job. Accepting creates a normal booking
through the bookings module (capacity is re-checked, so a table taken in the
meantime gives a 409 and the guest stays queued). With auto-offer on, every
`booking.cancelled`, `waitlist.expired` and declined offer re-runs
`autoOffer` for that date: the first waiting guest who fits an available slot
(preferred service and closest time win) gets the offer; only one offer is
open per date at a time.

Most events belong to a restaurant. Organization-level events carry
`restaurantId: null`: `team.invitation_created` is written by the Better Auth
`sendInvitationEmail` hook and picked up by the notifications module, which
emails the link through the provider of the organization's first restaurant.

### Message templates

Default wording lives in `packages/shared/src/templates` as `{{placeholder}}`
text per locale, audience and event; the emails package builds its copy from
it and the SMS renderer fills it directly. A restaurant can override any
message from Settings → Notifications → Templates: rows in
`notification_template` (restaurant × event × channel × audience × locale)
replace subject, heading and body, while the details table, button and footer
stay. Unknown placeholders are rejected on save; the preview endpoint renders
with sample data.

## Team and API keys

Users belong to an **organization** (Better Auth organization plugin) that owns
one or more restaurants. Roles, defined in `apps/server/src/auth/access.ts`:

| Role | Can |
| --- | --- |
| `owner` | everything, including inviting other owners and deleting restaurants |
| `manager` | run the restaurant: settings, services, bookings with capacity override, customers, invite managers and staff, read API keys |
| `staff` | bookings and customer notes; read-only settings |

The `team` module wraps the organization API (`ctx.auth.api.*`) so the
dashboard talks to one REST surface: invite → `POST /team/invitations`, accept
→ `POST /api/v1/invitations/{id}/accept`. Invitation links point at
`/invitations/{id}`; the page previews the invitation without a session and
sends the visitor to sign up or log in with the invited address. When no email
provider is configured the invitation still exists and the link is shown in
the pending list.

**API keys** are organization-scoped (`references: "organization"` in the
api-key plugin), act with manager permissions, and are hashed at rest. They are
created from Settings → API keys; the secret is returned once. Send it in the
`X-Api-Key` header; `requireRestaurant` resolves the key to the organization
and refuses keys from another one.

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
`booking_policy` · `widget_config` · `customer` · `booking` · `waitlist_entry` · `dining_table` · `booking_table` · `payment_config` · `booking_payment` · `booking_feedback` ·
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
