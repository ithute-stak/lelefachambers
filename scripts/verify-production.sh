#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

fail=0

check_non_placeholder() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" || "$value" == CHANGE_THIS_* || "$value" == "change-me" ]]; then
    echo "ERROR: $name is unset or still a placeholder"
    fail=1
  fi
}

if [[ "${APP_ENV:-}" != "production" ]]; then
  echo "ERROR: APP_ENV must be production for this verification"
  fail=1
fi

check_non_placeholder POSTGRES_PASSWORD
check_non_placeholder JWT_SECRET
check_non_placeholder BOOTSTRAP_ADMIN_PASSWORD
check_non_placeholder LELEFA_DEBT_COLLECTORS_API_KEY

if [[ ${#JWT_SECRET:-0} -lt 32 ]]; then
  echo "ERROR: JWT_SECRET must be at least 32 characters"
  fail=1
fi

if [[ "${CORS_ORIGINS:-}" == *"*"* ]]; then
  echo "ERROR: wildcard CORS is not allowed"
  fail=1
fi

if [[ "${ITHUTE_PAY_ENABLED:-false}" == "true" ]]; then
  check_non_placeholder ITHUTE_PAY_API_KEY
  check_non_placeholder ITHUTE_PAY_WEBHOOK_SECRET
fi

if (( fail != 0 )); then
  exit 1
fi

echo "Environment checks: OK"

docker compose config >/dev/null
echo "Docker Compose config: OK"

docker compose ps --services --filter status=running | grep -qx api || {
  echo "ERROR: api service is not running"
  exit 1
}

docker compose ps --services --filter status=running | grep -qx web || {
  echo "ERROR: web service is not running"
  exit 1
}

docker compose ps --services --filter status=running | grep -qx worker || {
  echo "ERROR: worker service is not running"
  exit 1
}

curl -fsS "$API_URL/health/live" >/dev/null
echo "API liveness: OK"

curl -fsS "$API_URL/health/ready" >/dev/null
echo "API readiness: OK"

curl -fsS "$WEB_URL" >/dev/null
echo "Public web: OK"

docker compose run --rm api alembic current | grep -q "0001_baseline" || {
  echo "ERROR: Alembic database revision is not at the baseline/head"
  exit 1
}
echo "Database migration state: OK"

echo "Production verification passed."
