# Lelefa Chambers — Recovery Automation Phase 4

Phase 4 turns the Phase 3 recovery registers into a monitored recovery control loop.

## Operating flow

```text
Legal Matter
    |
    v
Settlement / Judgment
    |
    +--------------------------+
    |                          |
    v                          v
Installment Schedule        Court / Legal Tasks
    |                          |
    v                          v
Due / Grace / Overdue       Deadline Scanner
    |                          |
    +------------+-------------+
                 |
                 v
          Reminder Centre
                 |
                 v
      Advocate / Recovery Team
                 |
                 v
        Debtor Payment Request
                 |
                 v
             Ithute Pay
       provider routing / C2B
                 |
       signed webhook / refresh
                 |
                 v
       Recovery Payment Ledger
                 |
                 v
       Automatic Allocation
                 |
                 v
Settlement Paid / Partial / Defaulted
                 |
                 v
       Institutional Client Portal
```

## Settlement installment schedules

A settlement can now be expanded into dated installments. Each installment stores:

- sequence number;
- due date;
- grace-until date;
- amount due;
- amount paid;
- status (`scheduled`, `due`, `partial`, `paid`, `overdue`, `waived`).

Schedules can be weekly, fortnightly, monthly, once-off or custom. The generator caps a schedule at 240 installments. A generated schedule cannot be replaced after payment allocations exist.

Matched recovery payments linked to a settlement are automatically allocated to the oldest unpaid installment. This preserves a deterministic payment trail rather than merely changing a settlement balance.

## Broken-arrangement detection

The automation worker recalculates installment states. Once an unpaid installment passes its grace date, it becomes `overdue`; the settlement moves to `defaulted` when any schedule item remains overdue.

This is a workflow state, not an automatic legal decision. A professional still decides whether the next action should be contact, renegotiation, litigation, execution or another client-approved step.

## Reminder engine

The scanner creates idempotent reminders for:

- court events within seven days;
- legal tasks due within three days or already overdue;
- settlement installments due within three days or overdue;
- professional credentials expiring within 60 days.

Reminder records live in PostgreSQL. The worker additionally publishes new reminders to a Redis stream for future realtime notifications and downstream delivery. A Redis outage does not destroy the reminder: the database remains the authoritative reminder record.

## Worker

Docker Compose now runs a dedicated `worker` service using the same API image.

Default cycle:

```text
Every 60 seconds
      |
      +-- recalculate settlement installment states
      +-- scan reminder sources
      +-- allocate matched settlement payments
      +-- publish pending reminder events to Redis
```

The interval is configurable through `AUTOMATION_SCAN_SECONDS` and is clamped to at least 15 seconds.

## Ithute Pay integration

Lelefa Chambers consumes **Ithute Pay** as a payment client rather than embedding M-Pesa, EcoCash or other provider credentials in the Chambers application.

Ithute Pay remains responsible for:

- provider credentials;
- C2B collection routing;
- provider-specific payment lifecycle;
- transaction status;
- idempotency controls;
- provider callbacks;
- payment accounting and reconciliation at the payment-platform boundary.

Lelefa Chambers remains responsible for:

- the legal matter;
- settlement/installment business context;
- the Chambers recovery record;
- allocating successful payments to the correct matter/settlement;
- client-facing recovery reporting.

### Consumer boundary

```text
Lelefa Chambers backend
        |
        | Bearer application API key
        | Idempotency-Key
        | optional HMAC request signature
        v
api.pay.ithute.co.ls
        |
        v
Ithute Pay
        |
        +-- M-Pesa
        +-- EcoCash
        +-- future approved providers
```

A browser never receives the Ithute Pay application key.

## Payment request lifecycle

When an authorised Chambers user creates a recovery payment request:

1. Chambers validates the matter and optional settlement/installment relationship.
2. A durable local idempotency key is generated and stored.
3. Chambers sends `POST /api/v1/payment-intents` to Ithute Pay.
4. The request metadata includes stable Chambers matter and settlement references.
5. Chambers stores the Ithute Pay public payment ID and current state.
6. Final success can be learned through a signed Ithute Pay webhook or an explicit status refresh.
7. A successful intent is imported once into `recovery_payments` using the Ithute Pay public ID as the deduplication boundary.
8. If linked to a settlement, the matched recovery is allocated to the oldest unpaid installments.
9. Recovery totals and settlement state are recalculated.

## Ithute Pay security contract

The integration implements the current Ithute Pay consumer contract:

- application API key prefixes `ipb_test_...` / `ipb_live_...`;
- `Authorization: Bearer <application key>`;
- `Idempotency-Key` for financial create operations;
- optional HMAC request signing using timestamp, nonce, HTTP method, path and SHA-256 body hash;
- signed webhook verification over `<timestamp>.<raw JSON body>`;
- webhook event-ID persistence for duplicate delivery protection.

`ITHUTE_PAY_ENABLED=false` is the default. Production activation requires a dedicated Lelefa Chambers Ithute Pay application, scoped live credentials, configured webhook secret and provider certification/activation in Ithute Pay. Real credentials must never be committed to Git.

## Source-of-truth rule

Ithute Pay is authoritative for its payment resource and provider transaction states. Lelefa Chambers is authoritative for its legal matters and recovery allocations. The creditor/source lending system remains authoritative for the contractual debt balance unless a formal integration contract explicitly changes that responsibility.

A successful payment in Ithute Pay therefore creates recovery evidence in Chambers; it does not silently rewrite the creditor's contractual loan ledger.

## Administration

`/chambers-admin/automation` provides:

- automation dashboard;
- manual scan control;
- reminder centre;
- settlement schedule generation;
- Ithute Pay payment-request creation and refresh.

The main admin navigation links Website CMS, Legal Operations, Recovery & Client Portal, and Automation & Ithute Pay as separate workspaces with shared authentication.

## Next hardening work

Before broad production use:

1. add an Alembic baseline and versioned migrations for every schema change;
2. provision a dedicated Ithute Pay **test** application and certify the Chambers payment flow before issuing live credentials;
3. register the exact Chambers webhook URL in Ithute Pay;
4. connect reminder events to Ithute Push/email/SMS policies instead of treating Redis as the end-user notification channel;
5. add end-to-end browser tests for staff and client portals;
6. add payment statement/report generation for institutional clients;
7. move private legal documents to encrypted object storage with malware scanning when the deployment reaches production scale.
