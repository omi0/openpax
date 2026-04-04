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
slot interval, turn time, pacing limits), rooms, exceptions, capacity rules,
the booking policy and the existing bookings. It has no I/O and is covered by
unit tests, including DST transitions and services that cross midnight.

Exceptions (closures and special hours) and capacity rules cover a range of
days: `date` is the first day and `end_date` the last one (inclusive; for a
rule it is null unless a range was set). On a day covered by several
exceptions the one that starts last wins, so one day inside a summer closure
can be reopened with special hours. The server loads them with an overlap
query (`date <= day and end_date >= day`).

The booking policy (notice, horizon, party sizes) is what guests meet online.
Staff bookings, edits, reopens and accepted waitlist offers load the engine
with `staff: true`, which swaps in `STAFF_POLICY`: no notice, a two-year
horizon, any party size, and a two-hour grace so a walk-in can be recorded on
the slot that just started. Real capacity (pacing, rooms, tables, closures)
still applies; `ignoreCapacity` is the separate manager override for that.
The dashboard's booking dialogs read
`GET /api/v1/restaurants/{id}/availability`, which is the same computation
with the staff policy.

Capacity is layered. A service's *max covers per slot* is a pacing limit: it
counts guests whose booking starts within one slot interval and ignores the
turn time. *Rooms* (`area` rows with a seat count and an open/closed flag)
cap how many guests are seated at the same moment: the sum of the seats of
the open rooms is enforced against every booking that overlaps the visit, as
long as every open room has a seat count. Closing a room (rain on the
terrace) removes its seats and its tables until it is reopened, and a request
for a closed room is refused with `room_closed`. *Capacity rules* add
narrower concurrent limits (a service, a room, a weekday, a time window) and
*tables* require a free table for the whole visit. Onboarding asks for the
seats of the house and creates the first room from them.

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
rooms, closures, capacity rules), `availability`, `widget` (hosted page config),
`bookings`, `waitlist`, `tables`, `payments`, `feedback`, `customers`, `csv`, `notifications`, `team`, `api-keys`, `setup` (the setup
guide: judges each step from the other modules' public APIs, `listServices`
and `listAreas` from `restaurants`, `listTables` from `tables`,
`resolveProvider` from `notifications`, `getTeam` from `team`, and stores the
steps the owner went through plus the completion time on the restaurant row),
`analytics`
(read-only aggregates over bookings; capacity offered is computed two ways from
the service hours and closures: `capacity` = slots × max covers per slot, and
`seatCapacity` = seats of the open rooms × turns of each service, a turn being
the opening span plus the turn time over the turn time, so dinner 19:00–22:00
with a 2 h turn offers 2.5 turns. The seat figure is null until every open
room has a seat count and uses the rooms as they are today, since rooms have
no history; the dashboard prefers it for occupancy. Every report also carries
the same totals for the previous period of equal length, party-size and
lead-time distributions, and can be downloaded as CSV).

### Tables and the floor plan

`dining_table` rows (name, room, min/max guests, shape, position on a
100 × 70 plan, joinable, priority) are optional. Tables in a closed room are
ignored until the room reopens. As soon as a restaurant has
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
`force`). Staff can create or edit a booking with `notifyGuest: false`, which
keeps the guest out of the resulting messages (the restaurant alert still
goes out), and `POST /bookings/{id}/notifications/resend` queues the
guest-facing message for the booking's current status again, bypassing the
event dedupe key. Settings → Rooms & tables holds the rooms, the table CRUD and a
drag-and-drop plan; Today has a floor view for any time of the day and a
quick switch to close or reopen a room.

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

### Guest book

Every booking, from the widget, the hosted page, staff, a waitlist
acceptance or a CSV import, goes through `upsertCustomer` (`lib/customers.ts`):
the guest is looked up by id, then email, then phone, and created when nothing
matches. Bookings taken with a name only (walk-ins, phone bookings without a
number) create a new entry each time. The `customer` row carries the visit,
no-show and cancellation counters: `seat` and `no_show` increment theirs,
`cancel` increments `cancel_count`, and `reopen` takes the mark off again
(imported bookings count once according to their status).

The system cannot decide by itself that an entry with an email and another
with a phone are one person, so merging is a staff action. The profile page
lists look-alikes (`GET .../customers/:id/duplicates`: same email, same phone,
or same name, deleted guests excluded) and any other guest by search;
`POST .../customers/:id/merge` (managers and owners) moves the source's
bookings, waitlist entries and feedback onto the target, adds the counters,
unions the tags, joins the notes, fills missing contact details from the
source, keeps the earliest `created_at` and deletes the source. When both
entries have a different email or phone the target keeps its own and the
source's are appended to the notes. The merge locks both guests' identities
first, like booking creation does, so a booking arriving meanwhile lands on
the surviving entry.

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

## Hardening

Public routes (`/api/public/*`), the auth endpoints and the "send test"
actions go through `rateLimit()` (`apps/server/src/lib/rate-limit.ts`): fixed
windows per client address (or per restaurant for test sends) kept in process
memory, `429` + `Retry-After` when exceeded, off with `RATE_LIMIT=off`.
Secrets at rest use `SecretBox` (AES-256-GCM); with
`APP_ENCRYPTION_KEY_PREVIOUS` set, decryption falls back to the old keys and
`rotateStoredSecrets()` re-encrypts every provider and payment secret at boot.

## Concurrency and load testing

Everything that can overbook runs inside one transaction under advisory
locks (`apps/server/src/lib/locks.ts`), always taken in the same order:

- `lockServiceDates(restaurant, dates)` serialises creating, moving,
  reopening and hand-seating bookings of one service date (the previous day
  is locked too, for after-midnight slots). Retries that carry an
  `idempotencyKey` are looked up again under this lock, so a burst of
  identical requests yields one booking.
- `lockGuestIdentities(restaurant, email/phone)` inside `upsertCustomer`, so
  the same guest booking two dates at once still gets one guest-book entry.
- `createBooking` offers two hooks that run inside its transaction:
  `onLocked` (after the date locks, before the capacity check) and
  `onCreated` (after the row exists). The waitlist uses them to lock the
  entry `FOR UPDATE` and flip it to `booked` atomically, so a double-click on
  "accept" produces one booking and answers with it both times.

Reopening a cancelled or no-show booking re-runs the availability check and
refuses when the covers, the table or the room are gone (`full`, `no_table`,
`room_closed`); it is then seated again on whatever table is free.

pg-boss workers fetch jobs in batches of ten and keep fetching while the
queue is deep (`burstWhenBatchFull`), settling each job on its own
(`perJobResults`); one job per second, the previous setting, left a rush of
confirmations waiting for minutes.

`pnpm --filter @sitli/server load:test` is the load test. Point it at a
server started with `RATE_LIMIT=off` and `SIGNUP_MODE=open`
(`LOAD_BASE_URL`, `LOAD_DATABASE_URL`); it seeds three restaurants through
the API (tables + rooms, pacing only, and one where staff override) and runs
the scenarios `rush` (everyone wants the same slot), `idem` (identical
retries), `same-guest`, `reopen`, `tables` (hand-seating race), `waitlist`
(cancellations and offers at the same time) and `mixed` (guests browsing and
booking while staff confirm, seat, move and cancel). After each one it
checks the database: pacing and seat limits, no table double-booked, one
guest-book entry per email/phone, visit, no-show and cancellation counters
equal to the audit trail (reopens taken off), waitlist entries consistent, no failed events or jobs, and
prints latency percentiles and how long the queues took to drain. Any 5xx
or violation is a bug.

## Adding a migration

Edit `packages/db/src/schema/*.ts`, then `pnpm db:generate`. Migrations run
automatically when the server starts. After upgrading Better Auth, run
`pnpm auth:generate` to refresh `packages/db/src/schema/auth.ts` and generate
a migration for any change.
