# Sitli

Self-hostable restaurant booking platform: an embeddable booking widget for your
website plus a staff dashboard to manage services, opening hours, capacity,
bookings, and guests.

Source-available under the Elastic License 2.0: free to self-host for your own
restaurant(s); a commercial license is required to offer Sitli as a hosted
service to others (see `COMMERCIAL-LICENSE.md`).

## Quick start (self-host)

```bash
cp .env.example .env   # set BETTER_AUTH_SECRET and APP_ENCRYPTION_KEY
docker compose up -d
```

Open http://localhost:3000, create your account, and follow the onboarding.

## Development

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # postgres + mailpit
cp .env.example .env
pnpm dev
```

See `docs/` for the architecture and contribution guide.
