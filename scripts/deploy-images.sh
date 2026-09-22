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

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-lelefachambers}"
LELEFA_API_HOST_PORT="${LELEFA_API_HOST_PORT:-18080}"
LELEFA_WEB_HOST_PORT="${LELEFA_WEB_HOST_PORT:-13000}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "==> Pulling published production images"
compose pull api worker web

echo "==> Ensuring PostgreSQL and Redis are running"
compose up -d db redis

echo "==> Waiting for database readiness"
for _ in $(seq 1 60); do
  if compose exec -T db pg_isready -U "${POSTGRES_USER:-lelefa}" -d "${POSTGRES_DB:-lelefachambers}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
compose exec -T db pg_isready -U "${POSTGRES_USER:-lelefa}" -d "${POSTGRES_DB:-lelefachambers}" >/dev/null

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
echo "Image tag: ${LELEFA_IMAGE_TAG:-latest}"
echo "Local web: http://127.0.0.1:${LELEFA_WEB_HOST_PORT}"
echo "Local API: http://127.0.0.1:${LELEFA_API_HOST_PORT}"
echo "Public site: https://lelefachambers.co.ls"
echo "API: https://api.lelefachambers.co.ls"
