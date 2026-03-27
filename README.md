# Sitli

Self-hostable restaurant bookings: an embeddable widget for your website, a
hosted booking page, and a staff dashboard to manage services, hours,
capacity, bookings, guests and notifications.

- **Widget** — one `<script>` tag on any site (WordPress, Wix, Squarespace, custom). Guests pick party size, date and time, and get a confirmation email. Italian and English out of the box.
- **Dashboard** — today's bookings at a glance, a week calendar, walk-ins and phone bookings, seat / no-show / cancel / edit with one click, a guest book with notes, tags, visit / no-show / cancellation counts and a merge for duplicate entries, services and weekly hours, closures and special hours, capacity rules, booking rules, team roles and invitations.
- **Notifications** — email and SMS through the provider *you* choose (SMTP, Resend, SendGrid, Postmark, Amazon SES, Twilio, Vonage), configured from the dashboard and stored encrypted. Reminders, confirmations, cancellations, staff alerts, each toggled per channel.
- **API first** — every screen talks to a documented REST API (`/api/openapi.json`); organization API keys, created from the dashboard, let you integrate a POS or a website of your own.
- **Boring to run** — one Docker image, one Postgres database. No Redis, no queues to babysit.

Source-available under the Elastic License 2.0: free to self-host for your own
restaurant(s). Offering Sitli to others as a hosted service requires a
commercial license, see `COMMERCIAL-LICENSE.md`.

## Quick start (self-host)

Requirements: Docker with Compose.

```bash
git clone https://github.com/omi0/sitli && cd sitli
cp .env.example .env
# generate the two secrets and paste them into .env
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY
docker compose up -d
```

Open http://localhost:3000 and create your account. The setup guide then
walks you through the restaurant, its opening hours, rooms and seats, booking
rules, email notifications, your team and going live (booking page link and
widget embed code); every step can be skipped and the guide reopens from
**Settings → Setup guide**. The first account becomes the owner and sign-up
closes behind it: colleagues join through invitations from **Settings → Team**
(set `SIGNUP_MODE=open` for a shared, multi-tenant instance).

Behind a reverse proxy with TLS, set `PUBLIC_URL=https://bookings.example.com`
and `TRUST_PROXY=true`. See [docs/self-hosting.md](docs/self-hosting.md).

## Development

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # postgres + mailpit
cp .env.example .env                              # defaults point at the compose services
pnpm dev                                          # api :3000, dashboard :5173, widget :5174
```

Tests: `pnpm test` (core unit tests, API integration tests against Postgres),
`pnpm --filter @sitli/e2e test:e2e` (Playwright, full booking flow),
`pnpm --filter @sitli/server load:test` (load test against a running server,
see [docs/architecture.md](docs/architecture.md#concurrency-and-load-testing)).

- [docs/architecture.md](docs/architecture.md) — how the pieces fit and how to add a module or a notification provider
- [docs/embedding.md](docs/embedding.md) — putting the widget on a website
- [docs/self-hosting.md](docs/self-hosting.md) — production deployment, backups, upgrades

## Status

Early. The foundation (availability engine, bookings, notifications, widget,
dashboard) is in place; waitlist, deposits, table management, Google Reserve
and more providers are on the roadmap. Issues and pull requests welcome.
