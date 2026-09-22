# Lelefa Chambers — Legal Recovery Phase 3

This phase extends the internal Chambers operations layer into a controlled **legal-recovery and institutional-client platform**.

## Recovery lifecycle

```text
Lelefa Debt Collectors / Client Instruction
                  |
                  v
           Legal Matter
                  |
         +--------+---------+
         |                  |
         v                  v
 Private Matter        Settlement
 Document Vault        Monitoring
         |                  |
         +--------+---------+
                  |
                  v
              Judgment
                  |
                  v
        Execution / Enforcement
                  |
                  v
          Recovery Payment
                  |
                  v
     Matching / Reconciliation
                  |
                  v
        Client Portal Reporting
```

## Private matter-document vault

Legal matter files are stored in a dedicated `legal_vault_data` volume rather than the public CMS media directory.

Controls:

- no public static mount;
- authenticated API download only;
- `internal` or `client` visibility;
- SHA-256 checksum recorded at upload;
- random server-side storage names;
- controlled MIME types and maximum file size;
- separate backup archive with SHA-256 checksum.

The current vault is suitable for controlled application files. Before using it for highly sensitive evidentiary bundles at scale, add malware scanning, encrypted object storage/off-server replication, formal retention rules and tested disaster recovery.

## Settlements

A settlement is linked to a legal matter and records:

- settlement reference;
- agreed amount and currency;
- acceptance date;
- first due date;
- installment amount/frequency;
- terms;
- lifecycle status.

Matched recovery payments linked to the settlement automatically move it toward `active` and then `completed` once the agreed amount is fully recorded.

## Judgments and execution

Judgment records capture the court, judgment reference/date, principal, interest, legal costs and total award. Execution actions can then be linked to the judgment and matter, with types such as warrant of execution, attachment, garnishee, sale in execution and other lawful processes.

This is a workflow/evidence system. It does not decide whether a legal remedy is available; authorised legal practitioners remain responsible for legal judgment and client instructions.

## Recovery payments and reconciliation

Recovery payments have explicit states:

```text
PENDING -> MATCHED
        -> UNALLOCATED
        -> REVERSED
```

A payment can be linked to a matter, settlement and/or judgment. `MATCHED` payments update the matter's recorded recovery total. The system separately tracks remittance state (`pending`, `included`, `remitted`, `held`) so receipt, allocation and onward remittance are not treated as the same event.

The creditor/source system remains authoritative for contractual balances unless an agreed integration explicitly changes that responsibility.

## Institutional client portal

Authorised client-portal users are scoped to one `legal_client` record. They can see only matters belonging to their organisation.

Portal visibility includes:

- open matter count;
- settlement, judgment and execution counts;
- recorded matched recoveries;
- matter stage/status;
- client-visible matter documents;
- settlements;
- judgments;
- execution activity;
- matched payment history.

Internal confidential notes, internal-only documents and other clients' records are not returned by portal endpoints.

## Staff workspace

`/chambers-admin/recovery` provides Chambers staff with recovery administration for:

- private document upload;
- settlements;
- judgments;
- execution actions;
- recovery payments;
- client-portal user provisioning;
- recovery dashboard metrics.

## Roles

The System Owner, Chambers Administrator and Managing Advocate have broad recovery permissions. Advocates can work on legal recovery records but do not manage institutional portal users by default. Auditors have read-only access. Reception access is deliberately limited.

## Backups

- PostgreSQL: `scripts/backup-postgres.sh`
- Private legal vault: `scripts/backup-legal-vault.sh`

Both produce SHA-256 checksums. Production copies should be stored off-server in encrypted storage and restoration procedures should be tested periodically.

## Next phase

Recommended next work:

1. Alembic migration baseline and versioned schema changes;
2. settlement installment schedule and broken-arrangement automation;
3. Redis-backed deadline/reminder jobs;
4. notification centre for court dates, settlement dues and credential expiry;
5. Ithute Pay recovery-event/reconciliation adapter;
6. richer client-portal statements and downloadable reports;
7. private object-storage adapter with encryption and malware scanning;
8. end-to-end browser tests and production deployment hardening.
