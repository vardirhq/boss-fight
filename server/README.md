# Boss Kamp API

Backend API for Boss Kamp household sync.

## Runtime

- Node.js 22
- Fastify
- PostgreSQL 17
- Docker Compose

## Production URL

```text
https://boss-kamp.vardir.no
```

## Local Commands

```bash
npm install
npm run build
npm run migrate
npm start
```

## Tests

The normal test suite runs without external services. PostgreSQL lifecycle
integration coverage is enabled when `TEST_DATABASE_URL` is set:

```bash
TEST_DATABASE_URL=postgresql://boss_kamp_test:boss_kamp_test@127.0.0.1:5432/postgres npm test
```

The integration suite creates and drops an isolated database, applies the
bootstrap schema and every ordered migration, and exercises the child,
household, and adult-account erasure routes. CI provides PostgreSQL and runs
this coverage on every change.

## Required Environment

Create `.env.production` on the server:

```text
PORT=3002
DATABASE_URL=postgresql://boss_kamp_app:<password>@127.0.0.1:5432/boss_kamp
CORS_ORIGIN=*
LOG_LEVEL=info
SESSION_DAYS=90
RETENTION_INVITES_DAYS=30
RETENTION_PAIRINGS_DAYS=7
RETENTION_SESSIONS_DAYS=30
RETENTION_REVOKED_DEVICES_DAYS=30
RETENTION_DELETED_AVATARS_DAYS=30
CHILD_AUTH_RATE_LIMIT_MAX=20
CHILD_AUTH_RATE_LIMIT_WINDOW=10 minutes
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM="Boss Kamp <chris@vardir.no>"
SMTP_REPLY_TO=chris@vardir.no
```

Never commit environment files.

The child authentication limit applies per client IP independently to direct
child login and pairing-code login. Database-backed credential lockout still
starts after eight invalid PIN attempts and lasts ten minutes.

SMTP is required for adult and parent invitations. The API only reports an
invitation as created after the mail server accepts the message. For local
development, Mailpit or another SMTP catcher can be used.

Operational retention runs at API startup and every 24 hours. Defaults remove
expired/accepted invitation metadata after 30 days, pairing metadata after 7
days, expired/revoked sessions after 30 days, revoked devices after 30 days, and
avatars for fighters deleted for 30 days. Startup fails if the initial cleanup
cannot complete; scheduled failures are logged and retried on the next interval.

## Deploy

Deploys are automated by GitHub Actions after quality checks pass on `main`.
CI builds and scans the Docker image, and production pulls that exact digest;
the host does not rebuild source. The production checkout lives at
`/opt/boss-fight`. See `docs/deployment.md` for promotion and rollback details.

Manual deploy on the server:

```bash
cd /opt/boss-fight
bash scripts/deploy-production.sh \
  ghcr.io/vardirhq/boss-fight-api@sha256:<digest>
```

The deploy helper backs up and migrates through the production Postgres
container by default, then starts the API with the limited app credentials from
`.env.production`.

The Caddy route is configured outside this repo in `/srv/friskr/Caddyfile`.
See [`../docs/deployment.md`](../docs/deployment.md) for the full deployment
setup.

## Auth

Adult users authenticate with:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
```

Protected user routes use:

```text
Authorization: Bearer <session.token>
```

Household devices use:

```text
x-boss-kamp-device-token: <deviceToken>
```

for sync routes only.

## API Reference

See [`../docs/api.md`](../docs/api.md) for endpoint documentation, request
payloads, response examples, and Android integration notes.

## Schema

`schema.sql` is the bootstrap snapshot for an empty database. Ordered production
changes live in `migrations/` and are applied by `npm run migrate` under a
PostgreSQL advisory lock. Applied filenames and SHA-256 checksums are recorded in
`schema_migrations`; never edit a migration after it has been applied. Add a new
four-digit sequence instead.
