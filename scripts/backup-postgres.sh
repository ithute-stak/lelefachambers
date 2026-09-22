#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Create it from .env.example before running backups." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/lelefachambers_${STAMP}.dump"

if ! docker compose ps --status running db | grep -q db; then
  echo "PostgreSQL service is not running." >&2
  exit 1
fi

echo "Creating encrypted-storage-ready PostgreSQL dump: $FILE"
docker compose exec -T db pg_dump \
  --username "${POSTGRES_USER:-lelefa}" \
  --dbname "${POSTGRES_DB:-lelefachambers}" \
  --format custom \
  --no-owner \
  --no-acl > "$FILE"

chmod 600 "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
chmod 600 "$FILE.sha256"

echo "Backup complete."
echo "Store a copy off-server in an encrypted backup location and periodically test restore procedures."
