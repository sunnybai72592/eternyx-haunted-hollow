# Cybersecurity Universe — Wave 12: transactional staging writes, revocation, rollback

Wave 12 adds a real PostgreSQL authorization and revocation rehearsal that can run against a dedicated staging database only after explicit operator consent. **The PR does not deploy a migration, perform real remote staging tests or change production data.**

## Twelve improvements

1. Two independent existing staging Auth account IDs required for any staging-runner execution.
2. Exact dedicated PostgreSQL staging hostname and separate production project ref required; no custom host, port, DB or role.
3. Verified full TLS mode and explicit CA file, plus double staging-only and rollback-rehearsal acknowledgement.
4. Source-only explanation and network-free configuration check; no automatic staging or production database connection.
5. A single transaction temporarily creates an authorized engagement, an in-scope asset and a finding for owner A.
6. Synthetic validation confirms real trigger-written history and actor ownership, plus risk acceptance/retest guardrails.
7. Out-of-scope and explicitly excluded assets must reject INSERT, even when the user owns the engagement.
8. Owner B can create its own authorized engagement and asset but cannot read or change A's assets, finding or history.
9. Cross-owner engagement reuse, foreign asset references, and impersonating the other owner must fail.
10. Scope revocation for A must immediately deny asset and finding edits and new asset creation, while B remains authorized.
11. An unconditional ROLLBACK precedes independent read-only checks that verify no synthetic records or audit events survived.
12. Disposable networkless PostgreSQL CI runs the full SQL rehearsal plus the 60-check catalog audit again. Unit tests reject unsafe runner settings.

## Local review commands (never connect to a database)

    node scripts/security-ledger-staging-writes.mjs --explain
    node --test tests/security-ledger-staging-writes.test.mjs

## Dedicated staging operator procedure

Preconditions: the indexed case ledger has been **separately approved and deployed to an isolated staging project**; two genuine staging Auth users already exist; the expected table grants, RLS, and triggers are installed; staging backups and rollback procedure have been reviewed. The direct PostgreSQL connection role must be able to SET ROLE authenticated. Store the DB password in a secure ephemeral environment, not CLI arguments or repository files.

Supply these exact environment variable classes:

- ETERNYX_STAGING_ONLY=yes
- ETERNYX_STAGING_WRITE_ACK=I_APPROVE_ROLLBACK_ONLY_STAGING_TEST
- ETERNYX_STAGING_PROJECT_REF=STAGING_PROJECT_REF
- ETERNYX_PRODUCTION_PROJECT_REF=SEPARATE_PRODUCTION_PROJECT_REF
- ETERNYX_STAGING_USER_A_ID=EXISTING_STAGING_AUTH_USER_UUID_A
- ETERNYX_STAGING_USER_B_ID=EXISTING_STAGING_AUTH_USER_UUID_B
- PGHOST=db.STAGING_PROJECT_REF.supabase.co
- PGPORT=5432
- PGDATABASE=postgres
- PGUSER=postgres
- PGPASSWORD=SECRET_STAGING_DATABASE_PASSWORD
- PGSSLMODE=verify-full
- PGSSLROOTCERT=/path/to/trusted/root-ca.pem

Run first:

    node scripts/security-ledger-staging-writes.mjs --check-config

Only after independently confirming the destination is isolated staging:

    node scripts/security-ledger-staging-writes.mjs --run

The runner passes account UUIDs via psql variables, never puts DB passwords into process arguments, enforces a 60-second timeout, requires explicit success after rollback, and reports only generic failure if an error occurs. On any psql failure the connection is closed, so an uncommitted transaction is rolled back by PostgreSQL. An authorized operator must review the actual run evidence and confirm the expected staging project. No remote staging run is automatically performed in this PR.

## Limits and release blockers

This is an authenticated **database-role emulation test** using SET ROLE authenticated plus request.jwt.claim.sub. It is not a replacement for actual Supabase JWT HTTP checks and does not test storage-object bytes, JWT revocation, realtime events, or production restoration. Use the Wave 10 staging-only Data API / private Storage probe independently.

Changing a live table inside a transaction still briefly acquires locks and writes rows until rollback. The rehearsal uses synthetic-only rows, statement/lock timeouts, explicit scope, a dedicated staging identity, and never commits. It must never run against production.

**Production release remains blocked** until the staged Wave 4 migration is reviewed and accepted in actual isolated Supabase staging, complete two-account HTTP authorization, DB catalog, transactional negative writes, revocation, rollback/recovery and named approver checks are evidenced independently. CI success proves the simulated networkless PostgreSQL behavior, not real staging execution.

Documentation: https://supabase.com/docs/guides/database/postgres/row-level-security
