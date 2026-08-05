# Deployment

Production API:

```text
https://boss-kamp.vardir.no
```

Production server checkout:

```text
/opt/boss-fight
```

Runtime environment file:

```text
/opt/boss-fight/server/.env.production
```

The environment file is intentionally ignored by git.

It must include working SMTP credentials for invitation delivery:

```text
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM="Boss Kamp <chris@vardir.no>"
SMTP_REPLY_TO=chris@vardir.no
```

The API also requires explicit browser origins and opt-in proxy trust:

```text
CORS_ORIGIN=https://boss-kamp.vardir.no,http://localhost,https://localhost,capacitor://localhost
TRUST_PROXY=true
```

Do not use a wildcard origin. The checked-in production Compose configuration
overrides legacy values with this allowlist and enables proxy trust. Keep proxy
trust enabled only while Caddy remains the sole public path to the API.

The sender address must be permitted by the configured SMTP service. These
values belong in `.env.production`, not in GitHub Actions or the repository.

## GitHub Actions

`.github/workflows/ci-deploy.yml` runs on pushes and pull requests targeting
`main`.

Quality checks:

- install PWA dependencies with `npm ci`
- build the PWA with `npm run build`
- run root dependency audit at `critical` threshold
- install server dependencies with `npm ci`
- build the server with `npm run build`
- run migration ordering and checksum tests with the server test suite
- run server dependency audit at `high` threshold
- build the API image once and push it to GHCR under the source commit
- scan that image for High and Critical vulnerabilities

Pull requests build and scan the image locally without publishing it. On `main`,
the image job pushes the same commit-tagged image and returns a digest-pinned
reference. Deploy runs only after checks and the image scan pass, and only for
`main` pushes or manual `workflow_dispatch` runs. Pull requests never publish or
deploy.

The final runtime image contains production application dependencies but not the
npm CLI or npm's global dependency tree. Migrations and the API entrypoint invoke
their Node scripts directly. npm remains available only in the discarded build
stage where dependencies are installed and TypeScript is compiled.

## Required GitHub Secrets

The production deploy job needs:

```text
BOSS_KAMP_DEPLOY_HOST
BOSS_KAMP_DEPLOY_USER
BOSS_KAMP_DEPLOY_SSH_KEY
```

These are configured in the `vardirhq/boss-fight` GitHub repository.
GHCR authentication uses the job-scoped `GITHUB_TOKEN`; no long-lived registry
password is stored on the production host, and the workflow logs out after each
deployment attempt.

## Server User

Deploys run as:

```text
bosskamp-deploy
```

The user owns `/opt/boss-fight` and belongs to the `docker` group. Automated
deployments run the checked-in helper with a digest produced by the image job:

```bash
cd /opt/boss-fight
bash scripts/deploy-production.sh \
  ghcr.io/vardirhq/boss-fight-api@sha256:<digest>
```

## Manual Deploy

For manual recovery, authenticate Docker to GHCR with a token that has
`read:packages`, check out the exact source commit associated with the image,
and deploy its digest:

```bash
sudo -u bosskamp-deploy bash -lc '
  cd /opt/boss-fight
  git fetch origin <commit-sha>
  git reset --hard <commit-sha>
  bash scripts/deploy-production.sh \
    ghcr.io/vardirhq/boss-fight-api@sha256:<digest>
'
```

Automated deployment uses the order: pull scanned image, capture the current
image, backup, migrate, replace, health-check. On production, backups are
captured with `pg_dump` inside the existing Postgres container
(`BOSS_KAMP_POSTGRES_CONTAINER`, default `friskr_postgres`), and migrations run
with the database-owner connection derived from that container. The live API
continues to use the limited app role from `server/.env.production`. Migration
failure leaves the existing application container running.

## Database Migrations

`server/schema.sql` bootstraps a new empty database. Every later schema change is
an immutable, ordered SQL file in `server/migrations/` named
`NNNN_description.sql`. The migration runner:

- serializes deploys with a PostgreSQL advisory transaction lock;
- applies all pending migrations atomically;
- records each filename and SHA-256 checksum in `schema_migrations`;
- refuses to continue if an applied migration file was edited;
- safely adopts an existing pre-migration database as the baseline.

Before opening a migration PR, test both a fresh bootstrap and an upgrade from a
recent production backup in a disposable database. Prefer additive and backward-
compatible changes so the previous application image remains usable during rollback.

## Rollback

Application rollback is safe without a database restore only when every migration
since the previous image is backward-compatible. The deployment helper retains
both image references under `/opt/boss-fight/deployments/`. If replacement or
readiness fails, it recreates the service from `previous-api-image`, verifies
health, and then exits unsuccessfully so GitHub reports and alerts on the failed
release.

To select a retained image manually:

```bash
sudo -u bosskamp-deploy bash -lc '
  cd /opt/boss-fight/server
  export BOSS_KAMP_API_IMAGE="$(cat ../deployments/previous-api-image)"
  docker compose up -d --no-build --force-recreate boss-kamp-api
  curl -fsS http://127.0.0.1:3002/health
'
```

For an incompatible or destructive migration, stop writes, preserve the failed
database for investigation, restore the matching pre-deploy dump with `pg_restore`
under the database operator account, then deploy the earlier commit. Restoration is
intentionally not automated: selecting and overwriting a production database
requires an explicit operator decision. Record periodic restore drills and verify
row counts plus `/health` and authenticated sync after each drill.

## Android Release Flow

Normal feature and fix pull requests add user-facing notes beneath
`## [Unreleased]` in `CHANGELOG.md`. They do not change application versions.

To prepare a production release:

1. Open **Actions → Prepare release → Run workflow** on `main`.
2. Enter the next version in `x.y.z` form, for example `1.1.0`.
3. Review and merge the generated `Release 1.1.0` pull request.

The preparation workflow:

- updates `package.json` and the root entries in `package-lock.json`
- updates Android `version.name`
- increments Android `version.code`
- moves `[Unreleased]` notes into a dated version section
- restores a fresh empty `[Unreleased]` section
- validates release metadata, release tooling, TypeScript, and the production build

After the release pull request is merged, `finalize-release.yml` creates the
matching `vX.Y.Z` tag and dispatches `android-release.yml`. The Android
workflow verifies both APK and AAB signatures before publishing the GitHub
Release assets.

The manual dispatch on `android-release.yml` remains available for recovery.
It must reference a version already committed to all release metadata files.
Do not overwrite an existing production release after it has been distributed;
prepare a new patch version instead.
