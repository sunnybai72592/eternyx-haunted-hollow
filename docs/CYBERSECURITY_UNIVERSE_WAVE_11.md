# Cybersecurity Universe — Wave 11: PostgreSQL catalog and rollback readiness

This wave does not deploy a migration, access production or prove remote staging readiness. It strengthens security-release evidence by testing the proposed indexed ledger against real but disposable PostgreSQL and offering an additional read-only catalog inspection for a dedicated staging environment.

## Bundled improvements

1. Sixty live PostgreSQL catalog checks across seven security tables.
2. RLS enabled and denied anonymous SELECT for all required tables.
3. Authenticated SELECT access and scoped owner-read RLS policies for every table.
4. Owner-bound INSERT and UPDATE policies on the four ledger relations.
5. No authenticated DELETE on indexed ledger tables.
6. Five validated composite foreign keys for ownership/engagement provenance.
7. Four active scope, change-history and evidence-link triggers.
8. Four private helper functions without direct EXECUTE grants to users or anonymous sessions.
9. Private non-public evidence bucket, bounded file-size configuration and Storage RLS.
10. Immutable history permission verification and strict exact-result validation with zero tolerance for missing or failed checks.
11. SHA-256 source fingerprints for the proposed migration, catalog gate and prerequisite migrations.
12. An offline PostgreSQL transaction rollback drill that temporarily disables asset RLS, verifies the change, rolls it back, and reruns all checks.

## Operator workflows

Source-only (no network/database):

    node scripts/security-ledger-catalog-gate.mjs --check-source
    node scripts/security-ledger-catalog-gate.mjs --explain

Use ONLY an approved isolated staging database with a nonprivileged read-only inspector role and verified TLS to run the catalog gate:

    psql "$STAGING_READONLY_DATABASE_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 -f scripts/sql/security-ledger-catalog-gate.sql | node scripts/security-ledger-catalog-gate.mjs --evaluate

Never place credentials, tokens or connection strings in GitHub logs. The SQL explicitly begins a read-only transaction and issues SELECTs over the PostgreSQL catalog and storage bucket metadata. Missing ledger tables fail the check, as they should.

The Wave 10 read-only two-account API and Storage probe is separate:

    node scripts/security-case-staging-readonly.mjs --run

It requires real staging credentials and seeded rows. It was NOT run with real staging users in this PR.

## CI and scope boundary

The existing .github/workflows/security-case-ledger-sql.yml creates a disposable networkless PostgreSQL 17 instance. Inside it alone, the workflow applies prerequisite migrations and the staged SQL proposal, exercises real database-role isolation, checks all catalog invariants, proves transaction rollback restoration and reruns the catalog gate. Cleanup runs on all outcomes.

**Passing offline CI is not a live Supabase staging acceptance.** It cannot prove remote migration history, staging API exposure, write denial, revoked access, backup restore, or production readiness.

## Production remains BLOCKED

Review migration history, actual staging RLS/grants, real user authentication and write/revoke behavior, backup and rollback, monitoring, incident recovery and an independent named approval before production promotion. The disposable rollback drill is NOT a remote migration restore rehearsal.

Supabase documentation: https://supabase.com/docs/guides/api/securing-your-api
