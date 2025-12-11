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
| `TRUST_PROXY` | behind a proxy | honour `X-Forwarded-*` from your reverse proxy |
| `SMTP_URL`, `SMTP_FROM` | no | instance-wide email fallback, e.g. `smtp://user:pass@smtp.example.com:587`. Restaurants can still configure their own provider in the dashboard. |
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
