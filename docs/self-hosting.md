# Self-hosting

## Requirements

- Docker with Compose (or any host that runs the image and a Postgres 16 database)
- A domain with TLS if guests will use it (cookies are marked secure in production)

## The installer

`install.sh` at the root of the repository is the one-line path for people
who do not know Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/omi0/openpax/main/install.sh | bash
```

It downloads the files in `deploy/` (`docker-compose.yml`, `Caddyfile` and
the `openpax` helper) into `/opt/openpax` (root) or `~/openpax`, writes a
`.env` with generated secrets and starts the stack from the published image
`ghcr.io/omi0/openpax`. Two paths:

- **Domain:** `PUBLIC_URL=https://<domain>`, `COMPOSE_PROFILES=https`,
  `BIND_IP=127.0.0.1`, `TRUST_PROXY=true`. Caddy listens on 80 and 443,
  proxies to the app and manages the certificate. The installer refuses to
  continue when another program holds those ports and warns when the domain
  does not resolve to the machine's public address.
- **No domain:** `PUBLIC_URL=http://<local ip>:3000`, `BIND_IP=0.0.0.0`,
  `SECURE_COOKIES=false`. For a phone-only instance on the LAN.

Running it again on an existing folder keeps `.env`, replaces the three
files and pulls the newest image, so local changes to the compose file
belong in `docker-compose.override.yml`. The helper covers `start`, `stop`,
`restart`, `status`, `logs`, `update`, `backup`, `restore` and `uninstall`;
it uses `sudo docker` on its own when the user is not in the docker group.

Everything the installer asks can be given as environment variables
(`OPENPAX_DIR`, `OPENPAX_DOMAIN`, `OPENPAX_URL`, `OPENPAX_PORT`,
`OPENPAX_YES=1`), and forks can point it elsewhere with `OPENPAX_IMAGE`,
`OPENPAX_TAG` and `OPENPAX_RAW_URL`. `OPENPAX_PULL=0` runs a locally built
image, which is how the script is tested.

## The image

CI publishes `ghcr.io/omi0/openpax` for amd64 and arm64 on every push to
`main` (`latest`, `sha-<commit>`) and on version tags (`1.2.3`, `1.2`,
`latest`). The two architectures are built on native runners and joined into
one manifest. `deploy/docker-compose.yml` runs that image; the compose file
at the repository root builds from the checkout instead.

## Environment

| variable | required | notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 chars, signs sessions. `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | yes | 32 bytes base64, encrypts provider secrets. `openssl rand -base64 32`. Losing it means re-entering provider credentials. |
| `PUBLIC_URL` | yes | the URL guests and staff use, e.g. `https://bookings.example.com` |
| `TRUST_PROXY` | behind a proxy | honour `X-Forwarded-*` from your reverse proxy (also used to tell clients apart for rate limits) |
| `APP_ENCRYPTION_KEY_PREVIOUS` | during a rotation | comma-separated older keys; see *Rotating the encryption key* |
| `RATE_LIMIT` | no | `on` (default) throttles anonymous endpoints and test sends per client address; `off` only for load tests |
| `SMTP_URL`, `SMTP_FROM` | no | instance-wide email fallback, e.g. `smtp://user:pass@smtp.example.com:587`. Restaurants can still configure their own provider in the dashboard. Password reset and invitation emails use the restaurant's provider when there is one, otherwise this fallback, so set it on any instance with more than one user. |
| `SIGNUP_MODE` | no | `first_user` (default): the first account created becomes the owner and sign-up closes; new staff join through invitations from Settings → Team. `invite_only` closes it from the start; `open` lets anyone sign up (hosted, multi-tenant instances). |
| `PORT`, `HOST`, `LOG_LEVEL` | no | defaults `3000`, `0.0.0.0`, `info` |
| `ROLE` | no | `all` (default), `api` (HTTP only) or `worker` (jobs only) to run several containers |
| `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB` | compose only | credentials of the bundled Postgres; user and database default to `openpax` |
| `BIND_IP`, `PORT` | compose only | interface and host port to publish, default `0.0.0.0:3000`. Set `BIND_IP` to a Tailscale or LAN address to keep the instance private, `127.0.0.1` behind Caddy or another proxy. |
| `OPENPAX_IMAGE`, `OPENPAX_TAG` | deploy compose only | image to run, default `ghcr.io/omi0/openpax` and `latest` |
| `COMPOSE_PROFILES`, `OPENPAX_DOMAIN`, `HTTP_PORT`, `HTTPS_PORT` | deploy compose only | `COMPOSE_PROFILES=https` starts Caddy for `OPENPAX_DOMAIN` on ports 80 and 443 (`HTTP_PORT`, `HTTPS_PORT` to change them) |

## Reverse proxy

Point Caddy, Nginx or Traefik at port 3000 and set `PUBLIC_URL` to the public
origin and `TRUST_PROXY=true`. Caddy example:

```
bookings.example.com {
  reverse_proxy app:3000
}
```

## First run

Open `PUBLIC_URL` and create the first account: it becomes the owner and,
with the default `SIGNUP_MODE`, sign-up closes behind it. The **setup guide**
then takes over and walks through seven steps, each one skippable and
revisitable:

1. **Restaurant**: name, seats of the house, timezone, language, contacts.
2. **Hours**: the first service (dinner is prefilled), then lunch or more.
3. **Rooms & tables**: the seats given in step 1 became the first room; split
   them into rooms that can be closed, add tables if you want automatic table
   assignment.
4. **Booking rules**: notice, horizon, party sizes, automatic confirmation,
   waitlist.
5. **Notifications**: how emails are sent. With `SMTP_URL` set the step shows
   "Server default" and works out of the box; otherwise configure a provider
   (SMTP, Resend, SendGrid, Postmark, SES) and send yourself a test.
6. **Team**: invite colleagues by email.
7. **Go live**: the hosted booking page link and the widget embed code.

Progress is judged from the actual configuration (a service with hours, rooms
with seats, a working email channel, team members), so the reminder on
**Today** goes away as things get done and the guide can be reopened from
**Settings → Setup guide** at any time, also for a second restaurant.

## Assistants (Claude, ChatGPT)

Nothing to configure: with `PUBLIC_URL` on HTTPS, Settings → Assistants shows
the address to paste into Claude or ChatGPT (`PUBLIC_URL/mcp`), and the
assistant logs in through your own login page. The instance must be reachable
from the internet, because the assistant's servers call it, not your phone.
On plain HTTP the page explains that assistants are off (MCP requires HTTPS).
Every connection can be revoked from the same page.

## Backups

Everything lives in Postgres. `openpax backup` (installer) or `pg_dump` the
database on a schedule; also back up `.env`, above all `APP_ENCRYPTION_KEY`.
`openpax restore <file>` drops and recreates the database from a dump.

## Rotating the encryption key

Provider passwords, API keys and Stripe secrets are encrypted at rest with
`APP_ENCRYPTION_KEY`. To move to a new key without re-entering anything:

1. Generate a new key: `openssl rand -base64 32`.
2. Set `APP_ENCRYPTION_KEY` to the new key and `APP_ENCRYPTION_KEY_PREVIOUS`
   to the old one (several old keys can be listed, comma-separated).
3. Restart. At boot the server re-encrypts every stored secret with the new
   key and logs `stored secrets re-encrypted ... you can now remove
   APP_ENCRYPTION_KEY_PREVIOUS`.
4. Remove `APP_ENCRYPTION_KEY_PREVIOUS` and restart again.

Until step 4 both keys can read the data, so a rolling restart of several
containers is safe. A secret that opens with none of the keys is reported in
the log and left as is; re-enter it from the dashboard.

## Rate limits

Anonymous endpoints are throttled per client address: 300 reads and 30 writes
(bookings, waitlist, feedback) per minute, sign-in/sign-up 60 per minute, and
"send test" 5 per minute per restaurant. Requests over the budget get `429`
with a `Retry-After` header. Counters live in the process, so with several
`api` containers each one keeps its own budget. Behind a reverse proxy set
`TRUST_PROXY=true`, otherwise every guest looks like the proxy's address.

## Upgrades

With the installer: `openpax update`. With the image compose file:
`docker compose pull && docker compose up -d`. From source:

```bash
git pull
docker compose build
docker compose up -d
```

Migrations run automatically when the container starts.

## Catching emails without a mail server

Add the Mailpit override and every email lands in a web inbox on port 8025:

```bash
docker compose -f docker-compose.yml -f docker-compose.mailpit.yml up -d
```

## Private instance over Tailscale

Set `BIND_IP` to the machine's Tailscale IP and `PUBLIC_URL` to its MagicDNS
name, then `tailscale serve --bg --http=80 http://<tailscale-ip>:3000` gives
`http://<machine>.<tailnet>.ts.net` to everyone on the tailnet. Enable HTTPS
certificates in the Tailscale admin console to serve over TLS instead.

## Running on plain HTTP (LAN, testing)

Set `PUBLIC_URL=http://<host>:3000` and `SECURE_COOKIES=false` so the browser
accepts the session cookie without TLS.
