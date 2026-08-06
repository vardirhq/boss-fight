#!/usr/bin/env bash
set -euo pipefail

readonly app_root="${BOSS_KAMP_APP_ROOT:-/opt/boss-fight}"
readonly retention_days="${BOSS_KAMP_BACKUP_RETENTION_DAYS:-30}"

if [[ "$app_root" != /* || "$app_root" == / ]]; then
  echo "BOSS_KAMP_APP_ROOT must be a specific absolute directory" >&2
  exit 2
fi
if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
  echo "BOSS_KAMP_BACKUP_RETENTION_DAYS must be a positive whole number" >&2
  exit 2
fi

readonly backup_dir="$app_root/backups"
install -d -m 700 "$backup_dir"
find "$backup_dir" -mindepth 1 -maxdepth 1 -type f \
  -name 'pre-deploy-????????T??????Z.dump' -mtime "+$retention_days" -print -delete
