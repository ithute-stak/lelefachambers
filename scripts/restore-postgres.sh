#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ $# -ne 1 ]]; then
  echo "Usage: CONFIRM_RESTORE=yes $0 /path/to/backup.dump" >&2
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Restore is destructive. Re-run with CONFIRM_RESTORE=yes after verifying the target environment." >&2
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file does not exist: $BACKUP_FILE" >&2
  exit 1
fi

if [[ -f "$BACKUP_FILE.sha256" ]]; then
  echo "Verifying checksum..."
  (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256")
fi

if [[ ! -f .env ]]; then
  echo "Missing .env." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if ! docker compose ps --status running db | grep -q db; then
  echo "PostgreSQL service is not running." >&2
  exit 1
fi

echo "Restoring ${POSTGRES_DB:-lelefachambers} from $BACKUP_FILE"
echo "Existing database objects will be cleaned before restore."

docker compose exec -T db pg_restore \
  --username "${POSTGRES_USER:-lelefa}" \
  --dbname "${POSTGRES_DB:-lelefachambers}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl < "$BACKUP_FILE"

echo "Restore complete. Run application smoke tests before returning the service to users."
