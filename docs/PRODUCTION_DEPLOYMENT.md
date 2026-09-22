# Lelefa Chambers production deployment

This guide is for the production deployment of `lelefachambers.co.ls`. It assumes Docker Compose, PostgreSQL, Redis, the API, worker and Next.js web service are deployed on a controlled host behind TLS.

## 1. Production invariants

Before launch:

- `APP_ENV=production`;
- PostgreSQL is used for `DATABASE_URL`;
- Redis is reachable only from the application environment;
- `JWT_SECRET` is a strong random secret of at least 32 characters;
- `CORS_ORIGINS` contains only the intended Chambers web origins and never `*`;
- bootstrap administrator credentials are rotated after first sign-in;
- Lelefa Debt Collectors integration uses a dedicated server-to-server secret;
- Ithute Pay remains disabled until its dedicated Chambers application, API key and webhook secret are issued;
- the private legal vault is on persistent storage and is not web-served as a public static directory;
- PostgreSQL and legal-vault backups are copied off-server into encrypted storage;
- TLS termination, firewall policy and host patching are in place.

The API refuses to start in `APP_ENV=production` when critical secret/CORS/database configuration remains unsafe.

## 2. Database migrations

The application now uses Alembic as the schema-change control plane.

### Fresh installation

From the API container/workdir:

```bash
alembic upgrade head
alembic current
```

The expected baseline is:

```text
0001_baseline
```

### Existing installation created before Alembic

Do **not** blindly run the baseline migration against an existing live database.

1. Stop writes or place the service in a maintenance window.
2. Create and verify a PostgreSQL backup.
3. Compare the existing schema with current SQLAlchemy metadata in a staging copy.
4. Resolve any drift.
5. Only after verification, mark the schema as being at the baseline:

```bash
alembic stamp 0001_baseline
alembic current
```

6. Start the application and run smoke tests.

Future schema changes must be delivered as new Alembic revisions. Do not use ad-hoc `ALTER TABLE` changes in production.

## 3. Safe deployment sequence

```text
Backup database
      |
Backup private legal vault
      |
Pull tested release
      |
Validate environment
      |
Apply Alembic migrations
      |
Build/start services
      |
Check /health/live
      |
Check /health/ready
      |
Verify worker + reminders
      |
Smoke-test public website
      |
Smoke-test Chambers admin
      |
Smoke-test client portal
      |
Confirm legal-vault access control
      |
Confirm integrations remain in intended enabled/disabled state
```

Recommended commands:

```bash
scripts/backup-postgres.sh
scripts/backup-legal-vault.sh
docker compose build

docker compose run --rm api alembic upgrade head
docker compose up -d

curl -fsS http://127.0.0.1:8000/health/live
curl -fsS http://127.0.0.1:8000/health/ready
```

Do not deploy a release when readiness is failing.

## 4. Health semantics

`GET /health/live`

Process-only liveness probe. It confirms that the API process can answer HTTP requests. It does not claim PostgreSQL or Redis are healthy.

`GET /health/ready`

Readiness probe. It checks PostgreSQL and Redis. It returns HTTP 503 when either required dependency is unavailable.

`GET /api/v1/admin/system-status`

Authenticated operational view for authorised Chambers roles. It reports dependency and security-posture status without returning secrets.

## 5. Backups and recovery

The repository contains:

- `scripts/backup-postgres.sh`;
- `scripts/restore-postgres.sh`;
- `scripts/backup-legal-vault.sh`.

Backups must be treated as sensitive legal data. At minimum:

- encrypt backup media at rest;
- restrict access to authorised administrators;
- retain checksums;
- copy backups off the application host;
- perform scheduled restore tests;
- document who performed each restore test and the result.

A backup that has never been restored successfully is not considered a verified recovery plan.

## 6. Rollback policy

Application rollback and database rollback are not the same operation.

- Application containers may be rolled back to a prior compatible release.
- The baseline Alembic downgrade is deliberately non-destructive and refuses to drop the legal-practice database.
- For destructive or incompatible schema failures, restore from a verified backup according to an approved incident procedure.

## 7. Post-deployment acceptance checks

Verify all of the following before declaring the release healthy:

- public website loads over HTTPS;
- `/health/live` succeeds;
- `/health/ready` succeeds;
- administrator login works;
- legal matter listing works;
- conflict-check workflow is accessible only to authorised users;
- private legal documents cannot be accessed without authenticated permission;
- institutional client portal sees only the logged-in client's records;
- worker process is running;
- reminders can be generated;
- Ithute Pay is disabled unless deliberately activated;
- Lelefa Debt Collectors referral endpoint rejects invalid integration credentials;
- database and legal-vault backups complete successfully.

## 8. What should never be stored in GitHub

Never commit:

- live database passwords;
- JWT secrets;
- integration keys;
- Ithute Pay API keys;
- webhook secrets;
- client portal passwords;
- real debtor/client evidence;
- private legal documents;
- production database dumps.
