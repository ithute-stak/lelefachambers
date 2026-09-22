# Lelefa Chambers Legal Operations

The Legal Operations workspace turns the Chambers website/CMS foundation into the beginning of a legal-practice operating system.

## Operating flow

```text
Prospective instruction / institutional referral
                  |
                  v
            Conflict check
          /                 \
       CLEAR             POTENTIAL HIT
         |                    |
         |               Advocate review
         |                    |
         +---------+----------+
                   |
                   v
             Client / Matter
                   |
       +-----------+-----------+
       |           |           |
       v           v           v
     Parties    Legal tasks  Court diary
       |           |           |
       +-----------+-----------+
                   |
                   v
       Demand / settlement / pleadings
                   |
                   v
      Hearing / judgment / execution
                   |
                   v
          Recovery / legal closure
                   |
                   v
             Client reporting
```

## Core records

### Client
The legal client or instructing organisation. The client record can represent an individual, company, bank, MFI, SACCO, government entity or other institution.

### Matter
The Chambers file. Every matter has a Chambers reference, client, matter type, workflow stage, priority, responsible professional, deadlines, court references and controlled internal notes.

### Matter party
A person or organisation associated with a matter, such as a client, plaintiff/applicant, defendant/respondent, debtor, witness or related party. Party records are included in future conflict searches.

### Conflict check
A pre-instruction screening record. The current search looks for potential matches across:

- existing legal clients;
- parties already captured on legal matters;
- prospective clients in consultation requests;
- exact identifiers captured against matter parties.

A system search that returns no hits is not a legal conclusion. A potential match is routed to a reviewer. Final acceptance remains a professional decision.

### Court event
Court dates, hearings, mentions, filing dates or other scheduled legal events. Court diary records can include location, courtroom, status, outcome and next step.

### Legal task
Operational work attached to a matter. Tasks have assignee, due date, priority and workflow state and feed the overdue-task dashboard.

### Professional credential
Admission, practising certificate, degree, professional certification and other credentials associated with Chambers professionals. Public visibility is controlled separately from the private register.

## Lelefa Debt Collectors legal-referral bridge

The platform exposes a disabled-by-default server-to-server endpoint:

```text
POST /api/v1/integrations/lelefa-debt-collectors/referrals
```

The caller must provide the configured integration key in `X-Integration-Key`.

A referral contains only the legal-intake data deliberately sent by the authorised recovery system, including:

- source reference;
- creditor name;
- debtor reference and name;
- current outstanding amount as supplied by the source system;
- collection stage/history summary;
- document manifest;
- reason for legal referral;
- authority/instruction reference.

The Chambers platform does **not** silently take ownership of the creditor ledger. Source-system balances remain authoritative unless a contract explicitly defines another arrangement.

### Referral acceptance gates

```text
Lelefa Debt Collectors referral
            |
            v
      Duplicate check
            |
            v
       Conflict search
            |
        +---+---+
        |       |
      CLEAR   POTENTIAL HIT
        |       |
        |    Human review
        |       |
        +---+---+
            |
            v
       Chambers review
        /         \
     ACCEPT      DECLINE
       |
       v
Create client if needed
       |
       v
Create legal matter
       |
       v
Create debtor/respondent party
```

Acceptance requires conflict status `clear` or `cleared_after_review`. A confirmed conflict blocks acceptance.

## Role boundaries

| Role | Legal operations capability |
|---|---|
| System Owner | Full platform administration, including user accounts |
| Chambers Administrator | Client, matter, court, task, conflict, referral and credential operations |
| Managing Advocate | Full professional legal-operations review and referral acceptance |
| Advocate | Matter updates, parties, court diary and tasks; can request conflict checks |
| Reception | Read-only matter/client context and conflict-check intake |
| Auditor | Read-only operational and audit access |
| Content Editor | Public CMS only; no legal-operations permissions by default |

Permissions are enforced by the API. Hiding a button in the interface is not treated as an authorization control.

## Privacy boundary

The public website APIs expose only published website content. Legal clients, matters, parties, referrals, internal tasks, conflict results and court operations sit behind authenticated legal-operations endpoints.

The media library remains a **public-content media boundary**. It should not be used as the final legal evidence/document store. Private matter-document storage will use a separate authenticated document service in the next phase.

## Next expansion

The next legal-practice layer should add:

1. private matter document/evidence store;
2. document versioning and document-level permissions;
3. conflict-check aliases and stronger matching controls;
4. court-deadline reminders/background jobs;
5. matter activity timeline and notes;
6. settlement/judgment/execution records;
7. institutional client portal with client-scoped authorization;
8. Ithute Pay integration for authorised recovery-payment reconciliation;
9. Lelefa Debt Collectors status synchronisation;
10. database migrations and production backup/restore automation.
