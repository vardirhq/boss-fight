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
npm start
```

## Required Environment

Create `.env.production` on the server:

```text
PORT=3002
DATABASE_URL=postgresql://boss_kamp_app:<password>@127.0.0.1:5432/boss_kamp
CORS_ORIGIN=*
LOG_LEVEL=info
SESSION_DAYS=90
```

Never commit environment files.

## Deploy

On the server:

```bash
docker compose up -d --build
```

The Caddy route is configured outside this repo in `/srv/friskr/Caddyfile`.

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

`schema.sql` contains the current database schema snapshot. The next production-hardening step is replacing this one-shot schema file with versioned migrations.
