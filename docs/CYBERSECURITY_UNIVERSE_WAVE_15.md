# Cybersecurity Universe — Wave 15: Staging Migration History and Recovery Gates

Wave 15 introduces a **strictly read-only** staging migration history observer and an explicit disaster-recovery evidence checklist. No actual Supabase staging access or production deployment occurs in this PR.

## Improvements bundled

1. Query the actual Supabase CLI `supabase_migrations.schema_migrations` database history with a `BEGIN TRANSACTION READ ONLY` PostgreSQL session.
2. Require recorded versions of the existing security engagement and private evidence migrations (`20261111210000`, `20261111220000`).
3. Check the expected engagement and evidence relations exist in `public`.
4. Check all four indexed-ledger relations; detect missing or partially deployed table sets.
5. Keep ledger migration registration **UNVERIFIED** even if every ledger table physically exists. History presence alone is not source-byte verification.
6. Pin exact dedicated staging PostgreSQL hostname, separate production project ref, port 5432, postgres database and verified-full TLS with an existing trust anchor file.
7. Explicit staging-only consent and additional migration-read acknowledgment; reject service/host override variables to minimize accidental target changes.
8. Fail-closed parse of eight ordered SQL check rows, refusing missing history, malformed output, unexpectedly missing baseline tables or partially deployed ledger state.
9. Create a small **operator-reported, unsigned** JSON observation with staged project refs, source and query SHA-256 fingerprints and the limited evidence status.
10. Provide offline `--check-source`, `--check-config`, `--explain` and raw SQL result evaluation commands. Only a separately acknowledged `--run` connects to a database.
11. Add a dedicated local migration observation upload to the protected Security Release Readiness page.
12. Show eight **unverified** independent recovery requirements, including backup snapshot, restore execution, integrity, RLS/Storage revalidation, RTO/RPO, monitoring and independent approval.
13. Extend networkless disposable PostgreSQL CI with synthetic CLI migration history and exercise the real read-only SQL query plus parser.
14. Add regression tests rejecting partial ledger schemas, false migration verification, invalid staging configurations, forged approval and unsafe SQL.

## The actual staging-only run

First, review the isolated staging project in the Supabase Dashboard and its official CLI migration list. Never assume an environment variable is proof of project ownership. Establish that it is **not production**.

With no secrets and no network:

    node scripts/security-staging-migration-history.mjs --explain
    node scripts/security-staging-migration-history.mjs --check-source

For a real isolated staging read, provide the following configuration through a secure, ephemeral shell (never commit credentials):

- `ETERNYX_STAGING_ONLY=yes`
- `ETERNYX_STAGING_MIGRATION_ACK=I_APPROVE_READONLY_STAGING_AUDIT`
- `ETERNYX_STAGING_PROJECT_REF=DEDICATED_STAGING_REF`
- `ETERNYX_PRODUCTION_PROJECT_REF=DIFFERENT_PRODUCTION_REF`
- `PGHOST=db.DEDICATED_STAGING_REF.supabase.co`
- `PGPORT=5432`
- `PGDATABASE=postgres`
- `PGUSER=postgres`
- `PGPASSWORD=SECRET_STAGING_DB_PASSWORD`
- `PGSSLMODE=verify-full`
- `PGSSLROOTCERT=/absolute/path/to/trusted/ca.pem`

The direct database host and verified TLS are intentionally strict. Some managed environments provide a pooler or require a different auth model; the safe outcome is **fail closed**, not silently switch to a pooler or disable certificate validation. The query runs inside a database `READ ONLY` transaction, even though the connect role is a privileged staging database role. The login role must be approved for this specific inspection.

Then:

    node scripts/security-staging-migration-history.mjs --check-config
    node scripts/security-staging-migration-history.mjs --run > wave15-migration-history.json

The JSON is operator-produced and **unsigned**. The receipt has a SHA-256 fingerprint of the locally reviewed Wave 4 staged ledger proposal and read-only SQL, but those hashes do not establish that the corresponding content was executed remotely. The proposal `scripts/sql/staged-security-case-ledger.sql` remains explicitly **NOT verified as a registered Supabase migration**. A separately reviewed and committed migration and independent staging migration-history/content review are necessary before promotion.

Import the JSON under **Staging migration history and recovery readiness** on the authenticated `/cybersecurity/release-readiness` route. All actual recovery requirements remain unverified until separately evidenced by authorized operators.

## Disposable CI acceptance

The networkless PostgreSQL CI sets up an isolated database, creates **synthetic** `supabase_migrations.schema_migrations` rows for the two known baseline versions, applies the staged proposal only to the disposable database, and runs the read-only observer query with the strict offline parser. This is a test of SQL compatibility and parser safety; it is **not** proof that a Supabase project is configured or migrated.

Run local checks:

    node --test tests/security-staging-migration-history.test.mjs
    npm test
    npm run build

## Real restore/rollback gate (not yet complete)

An independent authorized operator must identify an actual backup, restore it to a separate isolated recovery target, measure actual RTO and RPO, verify recovered schema/migration history and data integrity, re-run two-user RLS and private Storage checks, and prove monitoring and alert escalation after restoration. A named reviewer must independently approve the evidence. No backup job or restore is executed or implied here.

**Production release: BLOCKED.** Even a passing migration-history observation is an unsigned local report of selected metadata, not proof of migration source bytes, full restore, IAM boundaries or independent release authorization.

Supabase migration documentation: https://supabase.com/docs/guides/local-development/cli-workflows
