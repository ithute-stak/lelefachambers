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

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/legal-vault}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/lelefachambers_legal_vault_${STAMP}.tar.gz"

if ! docker compose ps --status running api | grep -q api; then
  echo "API service is not running." >&2
  exit 1
fi

VAULT_DIR="${LEGAL_VAULT_DIR:-/app/legal-vault}"

echo "Creating private legal-vault archive: $FILE"
docker compose exec -T api sh -c "test -d '$VAULT_DIR' && tar -C '$VAULT_DIR' -czf - ." > "$FILE"

chmod 600 "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
chmod 600 "$FILE.sha256"

echo "Legal-vault backup complete."
echo "Store the archive off-server in encrypted storage with access limited to authorised Chambers personnel."
