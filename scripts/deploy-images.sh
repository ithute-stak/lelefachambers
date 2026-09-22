#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-compose.images.yaml}"
ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.production.example to .env and set production secrets first." >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing $COMPOSE_FILE." >&2
  exit 1
fi

# Read individual values from Docker Compose's env file without sourcing it as
# shell code. Docker env files may legitimately contain spaces in values (for
# example BOOTSTRAP_ADMIN_NAME=Lelefa Chambers Administrator), which would be
# unsafe/invalid to `source` directly in bash.
env_value() {
  local key="$1"
  local fallback="$2"
  local value

  value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r')"
  if [[ -z "$value" ]]; then
    printf '%s' "$fallback"
    return
  fi

  if [[ ( "$value" == \"*\" && "$value" == *\" ) || ( "$value" == \'*\' && "$value" == *\' ) ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(env_value COMPOSE_PROJECT_NAME lelefachambers)}"
POSTGRES_USER="${POSTGRES_USER:-$(env_value POSTGRES_USER lelefa)}"
POSTGRES_DB="${POSTGRES_DB:-$(env_value POSTGRES_DB lelefachambers)}"
LELEFA_API_HOST_PORT="${LELEFA_API_HOST_PORT:-$(env_value LELEFA_API_HOST_PORT 18080)}"
LELEFA_WEB_HOST_PORT="${LELEFA_WEB_HOST_PORT:-$(env_value LELEFA_WEB_HOST_PORT 13000)}"
LELEFA_IMAGE_TAG="${LELEFA_IMAGE_TAG:-$(env_value LELEFA_IMAGE_TAG latest)}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if ! docker network inspect public-edge >/dev/null 2>&1; then
  echo "Required Docker network 'public-edge' does not exist." >&2
  echo "The production Caddy edge proxy must provide this shared network before Lelefa Chambers is deployed." >&2
  exit 1
fi

echo "==> Pulling published production images"
compose pull api worker web

echo "==> Ensuring PostgreSQL and Redis are running"
compose up -d db redis

echo "==> Waiting for database readiness"
for _ in $(seq 1 60); do
  if compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null

echo "==> Applying Alembic migrations using the pulled API image"
compose run --rm api alembic upgrade head

echo "==> Starting application services from published images"
compose up -d --remove-orphans api worker web

echo "==> Current services"
compose ps

echo "==> Waiting for API liveness on 127.0.0.1:${LELEFA_API_HOST_PORT}"
for _ in $(seq 1 60); do
  if curl --fail --silent "http://127.0.0.1:${LELEFA_API_HOST_PORT}/health/live" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl --fail --silent "http://127.0.0.1:${LELEFA_API_HOST_PORT}/health/live" >/dev/null

echo "==> Waiting for API readiness"
curl --fail --silent "http://127.0.0.1:${LELEFA_API_HOST_PORT}/health/ready" >/dev/null

echo "==> Waiting for Next.js on 127.0.0.1:${LELEFA_WEB_HOST_PORT}"
for _ in $(seq 1 60); do
  if curl --fail --silent "http://127.0.0.1:${LELEFA_WEB_HOST_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl --fail --silent "http://127.0.0.1:${LELEFA_WEB_HOST_PORT}/" >/dev/null

echo "Deployment complete."
echo "Image tag: ${LELEFA_IMAGE_TAG}"
echo "Local web: http://127.0.0.1:${LELEFA_WEB_HOST_PORT}"
echo "Local API: http://127.0.0.1:${LELEFA_API_HOST_PORT}"
echo "Caddy upstream web: lelefachambers-web:3000 on public-edge"
echo "Caddy upstream API: lelefachambers-api:8000 on public-edge"
echo "Public site: https://lelefachambers.co.ls"
echo "API: https://api.lelefachambers.co.ls"
