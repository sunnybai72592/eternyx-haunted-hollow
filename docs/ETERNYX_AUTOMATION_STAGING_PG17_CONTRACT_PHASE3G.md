# ETERNYX Automation Phase 3G — Executed SQL contract for the protected staging diagnostic

**Release status:** this PR does not execute against Supabase production or any
hosted staging database. PR #589 introduced a manual-only isolated-staging
read-only probe; this PR proves the probe's actual PostgreSQL SQL behavior and
hardens libpq transport variables **before** a user-authorized staging run.

## Why this work is needed

The linked ETERNYX production Supabase project still reports healthy via
management metadata but its direct migration-history management calls have
repeatedly timed out. We have not established the cause. Offline
cross-pillar SQL tests applied 59 migrations in PostgreSQL 17, but did
**not** execute the exact newly added staging-diagnostic SQL file.

This PR closes that distinction without creating a new staging project or
incurring provider charges.

## Ten concrete improvements

1. Add an independent \`postgres:17-alpine\` GitHub Actions job with
   \`--network none\`: a **real PostgreSQL server**, not a mocked database.
2. Bootstrap synthetic Auth users and apply the actual Automation control,
   signed-webhook and scheduled-workflow SQL migrations.
3. Prove the exact production-reviewed **read-only diagnostic SQL** fails
   when the migration-history relation is missing; no invented empty
   history or false-success status.
4. Add a fixture-only \`supabase_migrations.schema_migrations\` journal
   with two synthetic collision-version rows; no claim of applied real
   versions.
5. Execute the exact diagnostic SQL under PostgreSQL
   \`default_transaction_read_only=on\` and \`BEGIN READ ONLY\` and parse
   its actual output through the production parser.
6. Assert the expected Automation workflow/run/webhook/schedule relations
   are visible after the real source migrations, while exactly two
   fabricated fixture versions appear in the returned allowlisted output.
7. Attempt a real PostgreSQL **INSERT** with the read-only connection
   setting and require a failure; then verify that the synthetic journal
   row count is still two.
8. Harden the approved staging runner against ambient libpq
   \`PGHOSTADDR\` injection and other inherited SSL, certificate,
   authentication and connection routing overrides.
9. Exercise the **actual Bash runner** with a fake local \`psql\`
   executable: check strict host/ref, port, TLS, read-only settings,
   temporary CA file, and hostname override clearing. The fake executable
   cannot reach Supabase.
10. Fail closed on malicious success output and prove credentials/raw
    PostgreSQL errors are never printed; the known production project
    reference is rejected before the local \`psql\` executable runs.

## Evidence and limitations

The GitHub Actions job
**"Automation standalone read-only probe contract on offline PostgreSQL 17"**
runs automatically for relevant pull requests and can also be dispatched
manually. It uses **no GitHub secrets** and has no Supabase network access.

Successful offline tests mean:
- The **actual SQL** works under the tested PostgreSQL version and
  synthetic Auth/migration fixture.
- The SQL detects missing migration history, and PostgreSQL read-only
  settings prevent writes in the tested session.
- The production manual runner invokes the intended command with
  strict environment settings when tested against a fake \`psql\`.

They **do not** mean the manual runner has successfully completed a
real TLS handshake with hosted Supabase, that any applied production
migration version has been identified, or that the missing Automation
Edge Functions were deployed.

## Remaining activation prerequisites

A separately approved, independent staging project and
\`automation-staging\` GitHub Environment must exist, with its own
verified staging ref, host, user, staging-only password and trusted CA.
The owner must explicitly dispatch the Phase 3F read-only staging
workflow; no PR push, offline job or merge invokes it.

After independently verifying that read-only database access is reliable,
reconcile all eleven historical duplicate migration timestamps against
the actual staging schema and deployment history. Applying migrations,
publishing the three missing Automation Edge Functions, enabling
scheduled/webhook execution and real two-user staging HTTP acceptance
are all **separate approvals**, not automatic follow-ons from this PR.

No cloud project, host, database, users, secrets, schedules, functions,
paid external service or production data are changed by this pull request.
