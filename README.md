# Lelefa Chambers

Dynamic public website and Chambers administration platform for **Lelefa Chambers**, Maseru, Lesotho.

## Architecture

- `apps/web` — Next.js public website and Chambers CMS/admin interface
- `apps/api` — FastAPI API, PostgreSQL data model, RBAC and audit trail
- PostgreSQL — dynamic website/CMS and legal-practice data
- Redis — cache, job coordination and future realtime events
- Docker Compose — local and production-oriented service orchestration

Primary production domain: `https://lelefachambers.co.ls`.

The first release focuses on the dynamic public website, CMS, professional profiles, practice areas, legal insights, consultations, institutional recovery services, role-based administration and auditable publishing. The data/API boundaries are deliberately designed to support later client-portal and matter-management expansion.
