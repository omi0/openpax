<h1 align="center">OpenPax</h1>

<p align="center">
  Restaurant bookings you host yourself.<br>
  A booking widget for your website, a hosted booking page, and a dashboard your staff will actually use.
</p>

<p align="center">
  <a href="https://github.com/omi0/openpax/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/omi0/openpax/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg"></a>
  <img alt="Node 24" src="https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg">
  <img alt="Postgres 16" src="https://img.shields.io/badge/postgres-16-336791.svg">
</p>

---

OpenPax is a complete reservation system for one restaurant or a group of them.
It was built by a restaurant owner who was tired of paying per cover for
software that did less. One Docker image, one Postgres database, no per-booking
fees, no lock-in: your guests, your data, your server.

- **For guests:** a booking widget that drops into any website with one `<script>` tag, a hosted booking page to link from Instagram or Google, confirmation and reminder emails or SMS, a manage/cancel link, a waitlist when a date is full, and a feedback request after the visit. Italian and English out of the box.
- **For staff:** a *Today* screen designed for a phone behind the bar, with one tap to seat, mark a no-show, cancel or edit. A week calendar, a floor plan, walk-ins and phone bookings free of the online rules, and a guest book with notes, tags and history.
- **For the owner:** services with weekly hours and pacing, rooms and tables, closures and special hours over a period, capacity rules, booking policy, deposits or card holds through Stripe for no-show protection, analytics with covers, occupancy and no-show rates, CSV import and export, a team with roles, and an audit log of who did what.
- **For developers:** a documented REST API with OpenAPI, organization API keys, a modular server where features talk through domain events, and an MCP server so Claude, ChatGPT or any assistant can work the bookings with the owner's own login.

<p align="center">
  <img src="docs/screenshots/today.png" alt="Today: the evening's bookings, one action per row" width="100%">
</p>
<p align="center">
  <img src="docs/screenshots/widget.png" alt="The booking widget on a phone" width="300">
</p>

## Table of contents

- [Features](#features)
- [Self-hosting](#self-hosting)
  - [Requirements](#requirements)
  - [Quick start: one line](#quick-start-one-line)
  - [Docker Compose by hand](#docker-compose-by-hand)
  - [Configuration](#configuration)
  - [HTTPS and reverse proxy](#https-and-reverse-proxy)
  - [First run](#first-run)
  - [Sending email](#sending-email)
  - [Backups](#backups)
  - [Upgrading](#upgrading)
  - [Running several containers](#running-several-containers)
  - [Private instance on a LAN or Tailscale](#private-instance-on-a-lan-or-tailscale)
  - [Rotating the encryption key](#rotating-the-encryption-key)
- [Embedding the widget](#embedding-the-widget)
- [Assistants](#assistants)
- [API](#api)
- [Development](#development)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

## Features

**Bookings**

- Availability engine with three capacity layers: pacing per slot for each service, seats of the open rooms, and tables with automatic assignment and joinable pairs.
- Booking policy for online guests: notice, horizon, party sizes, automatic confirmation or manual approval, larger groups told to call.
- Staff bookings and edits ignore the online-only rules, with a separate manager override for real capacity. A booking can carry the room the party asked for.
- "Block times" on Today stops online bookings at chosen times of one day (a Saturday evening already full from the phone) with one tap per slot; managers can still book them by hand.
- New online bookings are announced on every dashboard screen as they arrive, so the person at the desk does not have to refresh.
- Status flow: pending, confirmed, seated, completed, no-show, cancelled with a reason, reopen. Every change is written to the audit log.
- Idempotent creation and advisory locks per restaurant and date, so a busy Saturday cannot be double-booked from two phones at once.
- Waitlist: guests join when a date is full, get an offer with an expiry when a table frees up, and accept or decline from a link. Staff offer, book or remove entries from Today.

**Guests**

- The guest form asks for name, phone and email; the owner decides which are mandatory (phone-only guests get their confirmation by SMS) and whether a privacy checkbox must be ticked.
- Guest book with search, profile, notes, tags, visit, no-show and cancellation counters, and the booking history.
- Duplicate detection and a merge that moves bookings, waitlist entries and feedback.
- GDPR delete that anonymises a guest and keeps the figures.
- CSV import of guests and past bookings with a preview, CSV export of both.

**Restaurant setup**

- Services (lunch, dinner, brunch) with weekly hours, slot interval, turn time and covers per slot.
- Rooms with seats and an open/closed switch, tables with a drag-and-drop floor plan.
- Closures, special hours and capacity rules over a single day or a whole period, with a warning about the bookings already taken on those days.
- A setup guide after sign-up that walks through hours, rooms, rules, notifications, team and go-live, judging each step from real data.

**Notifications**

- Email through SMTP, Resend, SendGrid, Postmark or Amazon SES. SMS through Twilio, Vonage or SMS Gateway API. Configured from the dashboard, credentials encrypted at rest, one-click test sends.
- Confirmations, changes, cancellations, reminders before the visit, waitlist offers, feedback requests and staff alerts, each toggled per channel and per audience in a rules matrix.
- Per-restaurant message templates in Italian and English with a live preview, and a log of every message sent.

**Payments**

- Deposits or card holds through Stripe Checkout for no-show protection. Automatic refund on cancellation, automatic charge on no-show, manual refund and charge buttons for staff. Stripe is called over plain REST, no SDK.

**Analytics**

- Covers per day against the offered capacity, occupancy by seats, no-show and cancellation rates, breakdown by service, source and weekday, party size and lead time distributions, deltas against the previous period, post-visit ratings, CSV export.

**Team and access**

- Organizations with several restaurants, roles owner, manager and staff, invitations by email, password reset, and organization API keys managed from the dashboard.
- Sign-up modes: first user becomes the owner and sign-up closes, invite-only, or open for a shared instance.

**Operations**

- One image, one database. Jobs run on Postgres through pg-boss, domain events go through a transactional outbox, migrations run at boot.
- Per-IP rate limits on public endpoints, per-restaurant limits on test sends, encryption key rotation without downtime, health endpoint for your monitoring.

## Self-hosting

### Requirements

- A Linux server (Ubuntu, Debian, Fedora, a Raspberry Pi) or a Mac. The
  installer sets up Docker on Linux; on a Mac install Docker Desktop first.
- A domain name pointing at the machine if guests will book online. The
  installer obtains and renews the HTTPS certificate. Session cookies are
  marked secure in production, and the assistants feature needs HTTPS.
- 1 GB of RAM is plenty. A 2 vCPU VM serves around a hundred booking
  requests per second.

### Quick start: one line

```bash
curl -fsSL https://raw.githubusercontent.com/omi0/openpax/main/install.sh | bash
```

The installer asks two questions, where to put the files and which domain
OpenPax answers on, and does the rest:

- checks Docker and offers to install it (Linux);
- with a domain that points at the machine, adds Caddy in front, which gets
  the certificate from Let's Encrypt and renews it. Without a domain OpenPax
  runs on `http://<this machine>:3000`, right for a phone-only instance on
  the restaurant's network;
- generates the secrets, writes `.env`, `docker-compose.yml` and the
  `openpax` helper to `/opt/openpax` (or `~/openpax` when not root), pulls
  the image and starts everything;
- changes nothing before you confirm, and prints the address to open at the
  end. Run the same line again later to update: the configuration is kept.

Open the address and create your account. The first account becomes the
owner and sign-up closes behind it. Colleagues join through invitations from
**Settings → Team**.

The helper in that folder does the housekeeping:

| Command | What it does |
|---|---|
| `openpax update` | pull the newest image and restart |
| `openpax backup` | dump the database into `backups/` |
| `openpax restore <file>` | put a backup back |
| `openpax logs` | follow the log |
| `openpax status`, `start`, `stop` | what it says |
| `openpax uninstall` | remove the containers and the data |

For scripted installs every question can be answered up front:
`OPENPAX_DIR`, `OPENPAX_DOMAIN`, `OPENPAX_PORT`, `OPENPAX_URL` and
`OPENPAX_YES=1` to take the defaults without asking. The header of
[install.sh](install.sh) lists them all.

### Docker Compose by hand

The image is published as `ghcr.io/omi0/openpax` for amd64 and arm64.
Download [deploy/docker-compose.yml](deploy/docker-compose.yml) and, for
automatic HTTPS, [deploy/Caddyfile](deploy/Caddyfile) next to it, write a
`.env` with the variables below, then:

```bash
docker compose up -d
```

Compose starts Postgres, runs the migrations and serves the API, the
dashboard and the widget on port 3000. Set `COMPOSE_PROFILES=https`,
`OPENPAX_DOMAIN` and `BIND_IP=127.0.0.1` in `.env` to put Caddy in front, or
leave the profile off and use your own reverse proxy.

To build from source instead, the compose file at the root of the repository
builds the image from the checkout:

```bash
git clone https://github.com/omi0/openpax.git
cd openpax
cp .env.example .env     # set the secrets and PUBLIC_URL
docker compose up -d
```

To try it out locally without a mail server, add the Mailpit override and
every email lands in a web inbox on http://localhost:8025:

```bash
docker compose -f docker-compose.yml -f docker-compose.mailpit.yml up -d
```

### Configuration

Everything is configured through environment variables. Compose reads them
from `.env`.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Compose sets it from `POSTGRES_PASSWORD`. |
| `BETTER_AUTH_SECRET` | yes | At least 32 characters. Signs sessions. Generate with `openssl rand -base64 32`. |
| `APP_ENCRYPTION_KEY` | yes | 32 bytes, base64. Encrypts provider credentials and Stripe secrets at rest. Generate with `openssl rand -base64 32`. Back it up: losing it means re-entering every credential. |
| `PUBLIC_URL` | yes | The origin guests and staff use, for example `https://bookings.example.com`. Used in emails, the embed code and auth callbacks. |
| `TRUST_PROXY` | behind a proxy | Set to `true` when a reverse proxy sits in front. Honours `X-Forwarded-*` and tells clients apart for rate limits. |
| `SMTP_URL`, `SMTP_FROM` | recommended | Instance-wide email fallback, for example `smtp://user:pass@smtp.example.com:587`. Used for password resets and invitations when a restaurant has not configured its own provider. |
| `SIGNUP_MODE` | no | `first_user` (default), `invite_only` or `open`. |
| `SECURE_COOKIES` | no | Set to `false` only on plain HTTP (LAN, testing). |
| `RATE_LIMIT` | no | `on` (default) or `off`. Keep it on. |
| `ROLE` | no | `all` (default), `api` or `worker`. See [Running several containers](#running-several-containers). |
| `APP_ENCRYPTION_KEY_PREVIOUS` | during a rotation | Comma-separated older keys. See [Rotating the encryption key](#rotating-the-encryption-key). |
| `PORT`, `HOST`, `LOG_LEVEL` | no | Defaults `3000`, `0.0.0.0`, `info`. |
| `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB` | compose only | Credentials of the bundled Postgres. User and database default to `openpax`. Set the password before the first start. |
| `BIND_IP` | compose only | Interface to publish on, default `0.0.0.0`. Set a LAN or Tailscale address to keep the instance private, `127.0.0.1` behind Caddy or your own proxy. |
| `OPENPAX_IMAGE`, `OPENPAX_TAG` | deploy compose only | Image to run, default `ghcr.io/omi0/openpax` and `latest`. Pin a version with the tag. |
| `COMPOSE_PROFILES`, `OPENPAX_DOMAIN`, `HTTP_PORT`, `HTTPS_PORT` | deploy compose only | `COMPOSE_PROFILES=https` starts Caddy for `OPENPAX_DOMAIN` on ports 80 and 443. |
| `MAILPIT_PORT` | compose only | Port of the Mailpit inbox with the override, default `8025`. |

### HTTPS and reverse proxy

Point Caddy, Nginx or Traefik at port 3000, set `PUBLIC_URL` to the public
origin and `TRUST_PROXY=true`. With Caddy the whole configuration is:

```
bookings.example.com {
  reverse_proxy localhost:3000
}
```

Caddy obtains and renews the certificate on its own. With Nginx, proxy to
`http://127.0.0.1:3000` and pass `Host`, `X-Forwarded-For` and
`X-Forwarded-Proto`.

### First run

After the first sign-in the setup guide takes over. Every step can be skipped
and reopened later from **Settings → Setup guide**:

1. **Restaurant:** name, seats of the house, timezone, language, contacts.
2. **Hours:** the first service, dinner is prefilled, then lunch or more.
3. **Rooms and tables:** the seats from step 1 became the first room. Split them into rooms that can be closed, add tables for automatic assignment.
4. **Booking rules:** notice, horizon, party sizes, automatic confirmation, waitlist.
5. **Notifications:** how emails are sent. With `SMTP_URL` set this works out of the box. Otherwise pick a provider and send yourself a test.
6. **Team:** invite colleagues by email.
7. **Go live:** the hosted booking page link and the widget embed code.

Progress is judged from the actual configuration, so the reminder on Today
goes away as things get done.

### Sending email

Two levels. `SMTP_URL` is the instance fallback: it covers password resets,
invitations and any restaurant that has not set up its own provider. Each
restaurant can then configure its own sender from **Settings → Notifications**
with SMTP, Resend, SendGrid, Postmark or Amazon SES, and SMS through Twilio,
Vonage or SMS Gateway API. Credentials are encrypted with `APP_ENCRYPTION_KEY` before they touch
the database, and the page has a test-send button for each channel.

Use a domain you control as the sender, with SPF and DKIM set up at your
provider, or confirmations end up in spam.

### Backups

Everything lives in Postgres. With the installer, `openpax backup` writes a
compressed dump into `backups/` and `openpax restore <file>` puts it back.
By hand:

```bash
docker compose exec db pg_dump -U openpax openpax | gzip > openpax-$(date +%F).sql.gz
```

Back up `.env` as well, above all `APP_ENCRYPTION_KEY`. A database restored
without its key still works, but every provider credential and Stripe secret
has to be entered again.

Restore into a fresh stack:

```bash
docker compose up -d db
gunzip -c openpax-2026-09-15.sql.gz | docker compose exec -T db psql -U openpax openpax
docker compose up -d
```

### Upgrading

With the installer, `openpax update` (or the install line again). With the
image compose file, `docker compose pull && docker compose up -d`. From
source:

```bash
git pull
docker compose build
docker compose up -d
```

Migrations run automatically when the container starts. Read the release
notes before a major version.

### Running several containers

The image serves HTTP and runs the background jobs in one process by default.
For more capacity, run one or more containers with `ROLE=api` behind your
proxy and exactly one with `ROLE=worker`. All of them share the database.
Rate-limit counters are kept per process, so each `api` container keeps its
own budget.

### Private instance on a LAN or Tailscale

For a restaurant that takes bookings by phone only, the instance does not need
to be on the internet. Set `BIND_IP` to the machine's LAN or Tailscale address
and `PUBLIC_URL` to the address staff will type, for example
`http://openpax.tailnet.ts.net`. On Tailscale,
`tailscale serve --bg --http=80 http://<tailscale-ip>:3000` publishes it to
everyone on the tailnet, and enabling HTTPS certificates in the admin console
gives you TLS without exposing anything.

On plain HTTP set `SECURE_COOKIES=false` so browsers accept the session cookie.
The assistants feature stays off on HTTP.

### Rotating the encryption key

1. Generate a new key with `openssl rand -base64 32`.
2. Set `APP_ENCRYPTION_KEY` to the new key and `APP_ENCRYPTION_KEY_PREVIOUS` to the old one.
3. Restart. The server re-encrypts every stored secret at boot and logs when it is done.
4. Remove `APP_ENCRYPTION_KEY_PREVIOUS` and restart again.

Both keys can read the data until step 4, so a rolling restart is safe.

## Embedding the widget

Copy the snippet from **Settings → Widget**. It looks like this:

```html
<div id="openpax-booking"></div>
<script src="https://bookings.example.com/embed.js"
        data-restaurant="trattoria-roma"
        data-target="#openpax-booking" async></script>
```

The loader renders the booking flow in an iframe and resizes it as the guest
moves through the steps, so your site's CSS cannot break it and it cannot read
anything on your page. Options: `data-lang` forces `it` or `en`, and
`data-min-height` sets the initial height in pixels.

Every restaurant also has a hosted page at `/book/<slug>` to link from
Instagram, Google Business Profile or a QR code on the menu. It works on
WordPress, Wix and Squarespace through an HTML block. If a platform strips
scripts on your plan, link the hosted page instead.

Colours, font and radius come from CSS variables, and the primary colour is
set from the dashboard. See [docs/embedding.md](docs/embedding.md).

## Assistants

OpenPax is an MCP server with its own OAuth 2.1 authorization server. The
owner connects Claude, ChatGPT or any MCP client with the OpenPax login, no
API key involved, and can ask what tonight looks like, book a table for a
caller, add a note to a guest, or close a few days. A consent page offers a
read-only option, every connection can be revoked from
**Settings → Assistants**, and every change made through an assistant is
recorded in the audit log under the owner's name.

Seventeen tools cover the day's list, bookings, availability, guests, the
waitlist, the schedule, analytics and feedback. The feature is on whenever
`PUBLIC_URL` is HTTPS, because the assistant's servers call your instance.

## API

Every screen of the dashboard talks to the same REST API. The OpenAPI document
is served at `/api/openapi.json`, and `/api/health` answers `{"ok":true}` for
your monitoring.

Create an API key from **Settings → API keys** and send it as `x-api-key`:

```bash
curl -H "x-api-key: $OPENPAX_KEY" \
  "https://bookings.example.com/api/v1/restaurants/$RESTAURANT_ID/bookings?date=2026-09-20"
```

Public endpoints for availability, bookings, waitlist and feedback are
rate-limited per client address.

## Development

Requirements: Node 24 and pnpm 12 (`corepack enable` picks the pinned version).

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # postgres + mailpit
cp .env.example .env                              # defaults point at the compose services
pnpm dev                                          # api :3000, dashboard :5173, widget :5174
```

Checks, the same ones CI runs:

```bash
pnpm turbo build typecheck test   # build, tsc, unit and integration tests
pnpm biome check .                # lint and format
```

Integration tests need `TEST_DATABASE_URL` pointing at a Postgres role that
can create databases. Each run creates and drops throwaway databases.

End-to-end tests run Playwright against the built dashboard and widget:

```bash
pnpm --filter @openpax/dashboard build && pnpm --filter @openpax/widget build
pnpm --filter @openpax/e2e test:e2e
```

There is also a load test that hammers a running server and checks the
database invariants after every scenario. See
[docs/architecture.md](docs/architecture.md) for how the pieces fit, how to
add a feature module or a notification provider, and how to run it.

## Project layout

```
apps/
  server/      Hono API, Better Auth, feature modules, jobs, notification providers, MCP
  dashboard/   staff dashboard (React, TanStack Router, Tailwind)
  widget/      booking widget, hosted booking page and the embed loader
packages/
  core/        pure domain: availability engine, booking state machine, events
  db/          Drizzle schema and migrations
  shared/      Zod DTOs shared by server, dashboard and widget
  emails/      email templates (IT + EN)
e2e/           Playwright specs
docs/          architecture, embedding, self-hosting
```

## Contributing

Issues and pull requests are welcome. For anything larger than a fix, open an
issue first so we can agree on the approach. Run the checks above before
pushing, and keep the Italian and English strings in step: every user-facing
text exists in both.

## License

OpenPax is free software under the
[GNU Affero General Public License v3.0](LICENSE). Use it, change it and
self-host it for your restaurant or group. If you modify it and offer it to
others over a network, the AGPL asks you to publish your changes under the
same license.
