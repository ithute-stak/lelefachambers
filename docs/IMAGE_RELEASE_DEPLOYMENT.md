# Lelefa Chambers — Published Docker Image Deployment

The production VPS does **not** need to build the Next.js or FastAPI applications.

GitHub Actions publishes tested images to GitHub Container Registry (GHCR) after the `Validate Lelefa Chambers` workflow succeeds on `main`.

## Published images

```text
ghcr.io/ithute-stak/lelefachambers-api:latest
ghcr.io/ithute-stak/lelefachambers-web:latest
```

The automation worker uses the same API image with a different command.

Every release is also tagged with a short immutable commit tag:

```text
ghcr.io/ithute-stak/lelefachambers-api:sha-<shortsha>
ghcr.io/ithute-stak/lelefachambers-web:sha-<shortsha>
```

Use `latest` for the normal deployment path. Use a `sha-*` tag when pinning or rolling back to a known release.

## Release pipeline

```text
Code merged to main
        |
        v
Validate Lelefa Chambers
  API / tests / Alembic / web / Compose
        |
        | success only
        v
Publish Lelefa Chambers Images
        |
        +--> API image --> GHCR :latest + :sha-...
        |
        +--> Web image --> GHCR :latest + :sha-...
```

A failed validation does not publish a new `latest` application image.

## One-time VPS preparation

Clone the repository once so the VPS has the Compose, Nginx, migration and deployment files:

```bash
git clone https://github.com/ithute-stak/lelefachambers.git
cd lelefachambers
cp .env.production.example .env
```

Replace every `CHANGE_THIS_*` value in `.env` with production secrets.

The normal image tag is:

```env
LELEFA_IMAGE_TAG=latest
```

The application ports remain loopback-only:

```text
127.0.0.1:3000 -> Next.js
127.0.0.1:8000 -> FastAPI
```

Nginx remains the public HTTPS edge.

## GHCR access

If the two GHCR packages are public, the VPS can pull them without logging in.

If the organisation keeps the packages private, log in once with a GitHub token that has `read:packages` permission:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u ithute-stak --password-stdin
```

Do not place the token in the repository or `.env` application file.

## Normal production deployment

After the images have been published, deployment is:

```bash
git pull --ff-only origin main
chmod +x scripts/deploy-images.sh
./scripts/deploy-images.sh
```

The script performs:

```text
pull API + worker + web images
        |
        v
start PostgreSQL + Redis
        |
        v
wait for PostgreSQL
        |
        v
run Alembic upgrade head using pulled API image
        |
        v
start API + worker + web
        |
        v
verify API liveness/readiness
        |
        v
verify local Next.js response
```

No `docker build` occurs on the VPS.

## Equivalent manual commands

```bash
docker compose -f compose.images.yaml pull

docker compose -f compose.images.yaml up -d db redis

docker compose -f compose.images.yaml run --rm api alembic upgrade head

docker compose -f compose.images.yaml up -d --remove-orphans
```

Check the release:

```bash
docker compose -f compose.images.yaml ps
curl -fsS http://127.0.0.1:8000/health/live
curl -fsS http://127.0.0.1:8000/health/ready
curl -I http://127.0.0.1:3000/
```

Then verify externally:

```text
https://lelefachambers.co.ls
https://api.lelefachambers.co.ls/health/live
```

## Pin or roll back to a known image

Set the same immutable tag for both application images:

```env
LELEFA_IMAGE_TAG=sha-1a2b3c4
```

Then redeploy:

```bash
./scripts/deploy-images.sh
```

Return to normal rolling releases by restoring:

```env
LELEFA_IMAGE_TAG=latest
```

## Important data rule

PostgreSQL, Redis data, public uploads and the private legal vault remain Docker volumes on the VPS. Pulling a newer application image does **not** replace those volumes.

Before a production release that changes schema or legal-storage behaviour, take the database and legal-vault backups described in the production deployment documentation.
