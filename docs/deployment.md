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

## GitHub Actions

`.github/workflows/ci-deploy.yml` runs on pushes and pull requests targeting
`main`.

Quality checks:

- install PWA dependencies with `npm ci`
- build the PWA with `npm run build`
- run root dependency audit at `critical` threshold
- install server dependencies with `npm ci`
- build the server with `npm run build`
- run server dependency audit at `high` threshold

Deploy runs only after checks pass, and only for `main` pushes or manual
`workflow_dispatch` runs. Pull requests run checks but do not deploy.

## Required GitHub Secrets

The production deploy job needs:

```text
BOSS_KAMP_DEPLOY_HOST
BOSS_KAMP_DEPLOY_USER
BOSS_KAMP_DEPLOY_SSH_KEY
```

These are configured in the `vardirhq/boss-fight` GitHub repository.

## Server User

Deploys run as:

```text
bosskamp-deploy
```

The user owns `/opt/boss-fight` and belongs to the `docker` group so it can run:

```bash
cd /opt/boss-fight/server
docker compose up -d --build
```

## Manual Deploy

From the server:

```bash
sudo -u bosskamp-deploy bash -lc '
  cd /opt/boss-fight
  git fetch origin main
  git reset --hard origin/main
  cd server
  docker compose up -d --build
  curl -fsS http://127.0.0.1:3002/health
'
```

## Rollback

To roll back to a known commit:

```bash
sudo -u bosskamp-deploy bash -lc '
  cd /opt/boss-fight
  git fetch origin
  git reset --hard <commit-sha>
  cd server
  docker compose up -d --build
'
```
