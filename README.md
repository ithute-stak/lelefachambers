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
- settlement installment schedules and automatic allocation;
- broken-arrangement / overdue detection;
- court, task, installment and credential reminder scanning;
- a Redis-backed recovery automation worker;
- server-to-server Ithute Pay payment collection integration;
- signed Ithute Pay webhook processing and idempotent event capture;
- an institutional client portal;
- role-based access and audit history;
- PostgreSQL and legal-vault backup utilities.

## Architecture

- `apps/web` — Next.js public website, Chambers CMS, legal operations, recovery, automation workspace and institutional client portal
- `apps/api` — FastAPI API, PostgreSQL domain model, authentication, RBAC, recovery ledger, automation and audit trail
- PostgreSQL — website, professional, client, matter, recovery, schedule, payment and portal records
- Redis — recovery reminder stream and job/realtime foundation
- `worker` — periodic recovery-control scanner and automatic payment allocator
- public media volume — CMS images/PDFs
- private legal-vault volume — authenticated matter documents only
- Ithute Pay — central provider/payment boundary for approved collections; Lelefa Chambers keeps business references and recovery allocations, not provider credentials
- Docker Compose — local and deployment-oriented orchestration

```text
lelefachambers.co.ls
        |
        v
      Next.js
   +----+-------------------------------+
   |        |            |              |
 Public    CMS      Legal Ops      Client Portal
 Website             Recovery
                     Automation
   |        |            |              |
   +--------+-----+------+--------------+
                  |
                  v
               FastAPI
                  |
       +----------+-----------+
       |                      |
   PostgreSQL                Redis
       |                      |
 Legal clients / matters   Reminder stream
 settlements / schedules       |
 judgments / payments          v
 portal access               Worker
       |
 Private Legal Document Vault
       |
       +---- server-to-server ----> Ithute Pay ----> approved providers
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

Authorised institutional clients can view only their organisation's matters, including matter stage/status, client-visible documents, settlements, judgments, execution activity, matched recovery payments and recorded recovery totals. Private Chambers notes and internal-only documents are not returned through client-portal endpoints.

## Phase 4 — Recovery automation and Ithute Pay

`/chambers-admin/automation`

- settlement installment schedule generation;
- scheduled/due/partial/paid/overdue installment states;
- automatic allocation of matched settlement payments to the oldest unpaid installment;
- automated detection of overdue/defaulted settlement arrangements;
- reminder centre for court dates, legal tasks, settlement dues and professional credential expiry;
- manual automation scan for authorised staff;
- Ithute Pay payment-request creation and status refresh;
- signed webhook ingestion from Ithute Pay;
- idempotent Ithute Pay event processing;
- successful Ithute Pay collections converted into Chambers recovery records and allocations.

The Docker `worker` scans recovery state periodically and publishes new reminder events to Redis. PostgreSQL remains the reminder source of truth so a Redis outage does not discard reminders.

### Ithute Pay boundary

Lelefa Chambers is a **consumer** of Ithute Pay. Provider credentials and provider-specific payment logic remain inside Ithute Pay. Chambers uses a dedicated application API key, stable idempotency keys, optional HMAC request signing and signed webhooks.

`ITHUTE_PAY_ENABLED=false` is the safe default. Activation requires a dedicated Chambers test/live application, webhook signing secret and the appropriate provider approval/certification in Ithute Pay.

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
- Automation & Ithute Pay: `http://localhost:3000/chambers-admin/automation`
- Institutional Client Portal: `http://localhost:3000/client-portal`
- API docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/health`

The first API startup creates the schema, seeds initial public Chambers content and creates the bootstrap system-owner account from the environment. Change the bootstrap password after first use before any production launch.

## Lelefa Debt Collectors integration

The recovery referral bridge is disabled until `LELEFA_DEBT_COLLECTORS_API_KEY` is configured with a strong production secret.

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

## Recovery payment flow

```text
Matter / Settlement
       |
       v
Installment Schedule
       |
       v
Payment Request ----> Ithute Pay ----> M-Pesa / EcoCash / approved providers
       |                    |
       |              signed event / status
       +--------------------+
                 |
                 v
          Recovery Payment
                 |
                 v
        Automatic Allocation
                 |
                 v
 Settlement / Matter Update
                 |
                 v
      Institutional Client Portal
```

Only a terminal successful Ithute Pay state is converted into a matched recovery. A timeout, `processing` or `unknown` state is not treated as a successful payment.

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

- Python API and worker compile/import;
- pytest model/route/role/schedule/webhook tests;
- Next.js production build;
- Docker Compose configuration, including the automation worker;
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
- Ithute Pay application/provider credentials remain server-side and are never exposed to the browser;
- successful payment ingestion is deduplicated by the Ithute Pay public resource ID;
- production document handling should add malware scanning, encrypted off-server storage, formal retention controls and tested disaster recovery.

## Next work

The strongest remaining platform-hardening work is:

- Alembic migration baseline and versioned schema changes;
- connect reminder events to Ithute Push/email/SMS policies;
- downloadable institutional recovery statements and management reports;
- private encrypted object storage with malware scanning;
- end-to-end browser tests;
- monitored production deployment to `lelefachambers.co.ls`;
- sandbox certification of the Lelefa Chambers Ithute Pay application before any live payment activation.

See `docs/LEGAL_OPERATIONS.md`, `docs/LEGAL_RECOVERY_PHASE_3.md` and `docs/RECOVERY_AUTOMATION_PHASE_4.md` for the detailed operating model.
