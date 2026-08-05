#!/usr/bin/env bash
set -euo pipefail

readonly image_ref="${1:?usage: deploy-production.sh <image-reference-with-digest>}"
if [[ "$image_ref" != *@sha256:* ]]; then
  echo "Deployment image must be pinned by sha256 digest" >&2
  exit 2
fi

readonly app_root="${BOSS_KAMP_APP_ROOT:-/opt/boss-fight}"
readonly state_dir="$app_root/deployments"
readonly service="boss-kamp-api"
readonly health_url="${BOSS_KAMP_HEALTH_URL:-http://127.0.0.1:3002/health}"
readonly health_attempts="${BOSS_KAMP_HEALTH_ATTEMPTS:-30}"

cd "$app_root/server"
export BOSS_KAMP_API_IMAGE="$image_ref"

install -d -m 700 "$app_root/backups" "$state_dir"
docker compose pull "$service"

current_container="$(docker compose ps -q "$service")"
previous_image=''
if [[ -n "$current_container" ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$current_container")"
fi

set -a
. ./.env.production
set +a
pg_dump --format=custom \
  --file="$app_root/backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).dump" \
  "$DATABASE_URL"

# A migration failure occurs before replacement, leaving the old container live.
docker compose run --rm "$service" node scripts/migrate.mjs

wait_for_health() {
  for _attempt in $(seq 1 "$health_attempts"); do
    if curl -fsS "$health_url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

rollback() {
  if [[ -z "$previous_image" ]]; then
    echo "No previous image is available for automatic rollback" >&2
    return 1
  fi

  echo "Readiness failed; restoring $previous_image" >&2
  export BOSS_KAMP_API_IMAGE="$previous_image"
  docker compose up -d --no-build --force-recreate "$service"
  if wait_for_health; then
    printf '%s\n' "$previous_image" > "$state_dir/current-api-image"
    echo "Previous image restored successfully; deployment remains failed" >&2
    return 0
  fi

  echo "Automatic rollback also failed readiness" >&2
  return 1
}

if ! docker compose up -d --no-build --force-recreate "$service" || ! wait_for_health; then
  docker compose ps >&2 || true
  docker compose logs --tail=80 "$service" >&2 || true
  rollback || true
  exit 1
fi

if [[ -n "$previous_image" ]]; then
  printf '%s\n' "$previous_image" > "$state_dir/previous-api-image"
fi
printf '%s\n' "$image_ref" > "$state_dir/current-api-image"
echo "Deployed $image_ref"
