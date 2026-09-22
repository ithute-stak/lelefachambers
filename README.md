# Lelefa Chambers

Dynamic public website and legal-practice operations platform for **Lelefa Chambers**, Maseru, Lesotho.

Primary production domain: **https://lelefachambers.co.ls**

## What this project is

This repository is the evolving **Lelefa Chambers Digital Legal Practice Platform**, not a hard-coded brochure site.

It now includes:

- a dynamic public legal-practice website;
- a PostgreSQL-backed CMS;
- a secure Chambers administration workspace;
- consultations and professional profiles;
- legal clients and matters;
- matter parties, conflict checks, court diary and legal tasks;
- Lelefa Debt Collectors legal-referral intake;
- professional credentials and user administration;
- a private legal-document vault;
- settlements, judgments and execution tracking;
- recovery-payment matching and remittance status;
- an institutional client portal;
- role-based access and audit history;
- PostgreSQL and legal-vault backup utilities.

## Architecture

- `apps/web` — Next.js public website, Chambers CMS, legal operations, recovery workspace and institutional client portal
- `apps/api` — FastAPI API, PostgreSQL domain model, authentication, RBAC, recovery ledger and audit trail
- PostgreSQL — website, professional, client, matter, recovery and portal records
- Redis — cache/job/realtime foundation for upcoming reminder and notification workers
- public media volume — CMS images/PDFs
- private legal-vault volume — authenticated matter documents only
- Docker Compose — local and deployment-oriented orchestration

```text
lelefachambers.co.ls
        |
        v
      Next.js
   +----+---------------------------+
   |        |            |          |
 Public    CMS      Legal Ops   Client Portal
 Website             Recovery
   |        |            |          |
   +--------+-----+------+----------+
                  |
                  v
               FastAPI
                  |
       +----------+----------+
       |                     |
   PostgreSQL              Redis
       |
 Legal clients / matters / settlements /
 judgments / payments / portal access
       |
 Private Legal Document Vault
```

## Phase 1 — Dynamic website and CMS

- premium responsive Chambers design;
- CMS-driven pages and homepage content;
- practice areas;
- professional profiles;
- legal insights/publications;
- financial-institution positioning;
- consultation request workflow;
- SEO metadata and security headers;
- draft/review/published/archived content lifecycle;
- audit logging.

## Phase 2 — Legal operations

`/chambers-admin/operations`

- legal clients;
- legal matters and Chambers references;
- matter parties;
- conflict checking and reviewer decisions;
- court diary/events;
- legal tasks and deadlines;
- professional credential register;
- Chambers user administration;
- Lelefa Debt Collectors legal-referral bridge with conflict and human-review gates.

## Phase 3 — Recovery and institutional portal

`/chambers-admin/recovery`

- private matter-document vault;
- document visibility controls (`internal` / `client`);
- SHA-256 document checksums;
- settlement register;
- judgment register;
- execution/enforcement register;
- recovery-payment ledger;
- matching/unallocated/reversed payment states;
- remittance status;
- recovery dashboard and alerts;
- institutional client portal user provisioning.

`/client-portal`

Authorised institutional clients can view only their organisation's matters, including:

- matter stage/status;
- client-visible documents;
- settlements;
- judgments;
- execution activity;
- matched recovery payments;
- recorded recovery totals.

Private Chambers notes and internal-only documents are not returned through client-portal endpoints.

## Local development

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Replace every `CHANGE_THIS_*` value. Never run a public deployment with template credentials.

3. Start the full stack:

```bash
docker compose up -d --build
```

4. Open:

- Public website: `http://localhost:3000`
- Chambers CMS: `http://localhost:3000/chambers-admin`
- Legal Operations: `http://localhost:3000/chambers-admin/operations`
- Recovery Workspace: `http://localhost:3000/chambers-admin/recovery`
- Institutional Client Portal: `http://localhost:3000/client-portal`
- API docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/health`

The first API startup creates the schema, seeds initial public Chambers content and creates the bootstrap system-owner account from the environment. Change the bootstrap password after first use before any production launch.

## Lelefa Debt Collectors integration

The recovery referral bridge is disabled until `LELEFA_DEBT_COLLECTORS_API_KEY` is configured with a strong production secret.

A referral follows this pattern:

```text
Lelefa Debt Collectors
        |
        v
Authenticated legal referral
        |
        v
Duplicate check
        |
        v
Conflict screening
        |
        v
Human Chambers review
   +----+----+
   |         |
 Accept    Decline
   |
   v
Client + legal matter created
```

The source collection system remains authoritative for creditor/source balances unless a future integration contract explicitly changes that responsibility.

## Backups

PostgreSQL:

```bash
scripts/backup-postgres.sh
```

Private legal-document vault:

```bash
scripts/backup-legal-vault.sh
```

Both generate SHA-256 checksum files. Production backups should be copied off-server into encrypted storage with tested restore procedures.

## Validation

Pull requests validate:

- Python API compile/import;
- pytest model/route/role tests;
- Next.js production build;
- Docker Compose configuration;
- PostgreSQL backup/restore script syntax;
- private legal-vault backup script syntax.

## Security rules

- no production secrets in Git;
- PostgreSQL is never exposed directly to the browser;
- public consultation forms request only minimum-necessary information;
- legal matter documents are not served through the public media mount;
- private document download requires authenticated API authorization;
- authorization is enforced on the API, not only hidden in the UI;
- client-portal users are scoped to one institutional client record;
- provider/payment credentials remain in their owning service;
- production document handling should add malware scanning, encrypted off-server storage, formal retention controls and tested disaster recovery.

## Next work

The strongest next phase is:

- Alembic migration baseline and versioned schema changes;
- settlement installment schedules and broken-arrangement automation;
- Redis-backed reminders for court dates, settlement dues and credential expiry;
- Ithute Pay recovery/reconciliation integration;
- richer client statements and downloadable institutional reports;
- private object storage with malware scanning and encryption;
- end-to-end browser tests;
- monitored production deployment to `lelefachambers.co.ls`.

See `docs/LEGAL_OPERATIONS.md` and `docs/LEGAL_RECOVERY_PHASE_3.md` for the detailed operating model.
