# Lelefa Chambers

Dynamic public website and Chambers administration platform for **Lelefa Chambers**, Maseru, Lesotho.

Primary production domain: **https://lelefachambers.co.ls**

## What this project is

This repository is not a hard-coded brochure site. It is the first layer of the **Lelefa Chambers Digital Legal Practice Platform**:

- a public legal-practice website;
- a PostgreSQL-backed content management system;
- a secure Chambers administration workspace;
- professional profiles and credential-ready records;
- legal insights publishing with controlled status;
- consultation intake and internal assignment;
- institutional debt-recovery positioning;
- role-based access and audit history;
- a foundation for later legal matter/client portal features.

## Architecture

- `apps/web` — Next.js public website and `/chambers-admin` CMS interface
- `apps/api` — FastAPI API, PostgreSQL domain model, authentication, RBAC and audit trail
- PostgreSQL — dynamic website, professional, enquiry and future matter data
- Redis — cache/job/realtime foundation
- file volume — controlled media assets; production storage can later move behind an object-storage adapter
- Docker Compose — local and deployment-oriented orchestration

```text
lelefachambers.co.ls
        |
        v
    Next.js web
        |
        v
      FastAPI
        |
   +----+-----+
   |          |
PostgreSQL   Redis
   |
CMS / professionals / consultations / audit
```

## Phase 1 capabilities

### Public website
- premium responsive Chambers design;
- dynamic home page and CMS-driven pages;
- practice areas;
- professional profiles;
- legal insights/publications;
- financial-institution and debt-recovery positioning;
- consultation request form with minimum-necessary public intake;
- SEO metadata and security headers.

### Administration
- `/chambers-admin` login;
- system-owner bootstrap through environment variables;
- roles for System Owner, Chambers Administrator, Managing Advocate, Advocate, Content Editor, Reception and Auditor;
- pages, practice areas, professional profiles, legal insights and consultation records;
- draft/review/published/archived content lifecycle;
- audit trail for content and consultation changes;
- image/PDF media upload API with file-type and size controls.

### Data boundaries
The public website never receives private matter data. The API exposes only `published` public records through public endpoints. Private Chambers administration endpoints require a bearer session and permission checks. Future matter/client-portal data must remain behind separate authenticated routes and database authorization rules.

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
- API docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/health`

The first API startup creates the schema, seeds initial public Chambers content and creates the bootstrap system-owner account from the environment. Change the bootstrap password after first use before any production launch.

## Content publishing model

Content is stored in PostgreSQL with these lifecycle states:

```text
DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED
```

A Content Editor can draft/submit content, while privileged roles control publication. Every write is recorded in the audit log. This is deliberate because legal content, practitioner profiles and institutional capability statements should not be published without accountability.

## Future legal-practice expansion

The current boundaries are designed so Phase 2 can add, without rebuilding the public CMS:

- institutional client portal;
- legal matters and parties;
- conflict checking;
- legal diary/court dates;
- evidence/document packs;
- settlement and payment monitoring;
- judgments and execution tracking;
- Lelefa Debt Collectors legal-referral API;
- Ithute Pay recovery/reconciliation integration;
- client reporting and dashboards.

## Validation

Pull requests run checks for:

- Python API compile/import;
- Next.js production build;
- Docker Compose configuration.

## Security rules

- no production secrets in Git;
- PostgreSQL is never exposed directly to the browser;
- provider/payment credentials stay in their owning service;
- public consultation forms request only minimum-necessary information;
- sensitive legal documents must move to an authenticated workflow rather than the public contact form;
- authorization is enforced on the API, not only hidden in the UI;
- media uploads are type/size restricted and should be malware-scanned before a later document-management release permits legal evidence uploads.
