# Self-hosting

## Requirements

- Docker with Compose (or any host that runs the image and a Postgres 16 database)
- A domain with TLS if guests will use it (cookies are marked secure in production)

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
| `BIND_IP`, `PORT` | compose only | interface and host port to publish, default `0.0.0.0:3000`. Set `BIND_IP` to a Tailscale or LAN address to keep the instance private. |

## Reverse proxy

Point Caddy, Nginx or Traefik at port 3000 and set `PUBLIC_URL` to the public
origin and `TRUST_PROXY=true`. Caddy example:

```
bookings.example.com {
  reverse_proxy app:3000
}
```

## Backups

Everything lives in Postgres. `pg_dump` the database on a schedule; also back
up `APP_ENCRYPTION_KEY`.

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
