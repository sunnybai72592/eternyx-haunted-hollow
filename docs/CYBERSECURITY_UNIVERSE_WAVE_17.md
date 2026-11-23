# Cybersecurity Universe — Wave 17: real isolated staging schema deployment

## Real Supabase staging result (2026-11-23)

Wave 17 is the first Cybersecurity wave to **deploy the already-reviewed security schema in a real isolated staging project**. The connected Supabase account contains `Eternyx` (production) and a separate healthy `Eternyx Staging` project. All deployments and SQL checks described here targeted **only** staging ref `mhodwvypfbxafamkrgsk`. No production SQL was executed.

Preflight: staging had **zero Auth users**, zero public tables, and no recorded migrations. The normal `auth` and `storage` system schemas were present.

Three previously reviewed source files were applied in dependency order using staging-only recorded Supabase migrations. Afterward we inspected `supabase_migrations.schema_migrations` and compared each **recorded statement byte-for-byte with the exact corresponding GitHub source**. Each comparison was true:

| Staging migration name | Recorded staging version | Reviewed source | SHA-256 (recorded and source matched) |
| --- | --- | --- | --- |
| `pentest_engagement_management_staging_baseline` | `20261123215132` | `supabase/migrations/20261111210000_pentest_engagement_management.sql` | `131411face266582e889f37e8e4a6821d78f3f46a33e6697d5f7427fbb65b77d` |
| `pentest_evidence_and_audit_staging_baseline` | `20261123215141` | `supabase/migrations/20261111220000_pentest_evidence_and_audit.sql` | `369f2d92db82b39ac1b0732b742ce57dfe4528ec36413a4141a8e14bdc071a22` |
| `security_case_indexed_ledger_staging_v1` | `20261123215211` | `scripts/sql/staged-security-case-ledger.sql` | `5690769dd6f00819d304f6b18f25445d1179556760e88a96d898f1ce206424e2` |

**Real staging verification:** seven public security tables are present, all have RLS enabled, zero seeded business rows, a private `pentest-evidence` Storage bucket (20 MiB limit), all **60/60 Wave 11 catalog security invariants passed**, and the Supabase Security Advisor returned no findings for the project at inspection time. The new Wave 17 read-only source/deployment probe returned **11/12 passed**, with its only blocker deliberately reported as `auth-two-user-fixtures|blocked`, because staging still has **zero Auth users**.

### Critical scope limits

- This is a *real staging deployment*, not an offline CI-only claim. It is **not production deployment**.
- `supabase_migrations` now records **new staging-specific generated versions**, not the old migration filenames' timestamps. This discrepancy is expected from the staging migration tool but must be reconciled before adopting unrestricted CLI migrations. Do **not** run `supabase db push`, `db reset --linked`, or migration repair blindly. The repository contains many unrelated pending migrations. Review `supabase migration list`, match exact applied SQL bytes and prepare a controlled version reconciliation plan before future deployments. Supabase migration repair changes history without executing SQL.
- Zero Auth users means no real two-user JWT HTTP/RLS, private Storage upload/download, revocation acceptance, or UI end-to-end journeys have been completed. The live read-only catalog checks are not a substitute.
- No backup was restored, no real RTO/RPO measured, no independently signed operator approval obtained. Production release remains **BLOCKED**.
- `scripts/sql/staged-security-case-ledger.sql` remains the reviewed source, not an automatically registered canonical CLI migration file. A later versioned migration needs independent review and a safe staging history reconciliation, not blindly reapplying `CREATE POLICY` statements.

## Reproducible, project-pinned source integrity and RLS audit

Offline source review (no network):

    node scripts/security-wave17-live-audit.mjs --explain
    node scripts/security-wave17-live-audit.mjs --check-source

The source checker verifies exact SHA-256 hashes for all three recorded GitHub files. The read-only SQL file `scripts/sql/security-wave17-live-audit.sql` queries the real migration history, exact recorded statement hashes, seven RLS table flags, the private bucket, and whether two real test users exist. The SQL runs in `BEGIN TRANSACTION READ ONLY`, uses timeouts, and contains no data modification.

To run the audit from a separately authorized, operator-controlled environment, reuse the guarded Wave 15 PostgreSQL TLS configuration with:

- `ETERNYX_STAGING_ONLY=yes`
- `ETERNYX_STAGING_MIGRATION_ACK=I_APPROVE_READONLY_STAGING_AUDIT`
- `ETERNYX_STAGING_PROJECT_REF=mhodwvypfbxafamkrgsk`
- `ETERNYX_PRODUCTION_PROJECT_REF=<different-production-project-ref>`
- `ETERNYX_STAGING_W17_AUDIT_ACK=I_APPROVE_READONLY_STAGING_W17`
- PostgreSQL settings: `PGHOST=db.mhodwvypfbxafamkrgsk.supabase.co`, `PGPORT=5432`, `PGDATABASE=postgres`, `PGUSER=postgres`, a secure **staging-only** `PGPASSWORD`, `PGSSLMODE=verify-full`, and `PGSSLROOTCERT=/path/to/trusted/ca.pem`.

After independently confirming those settings target staging only:

    node scripts/security-wave17-live-audit.mjs --run > wave17-staging-audit.json

The report is **unsigned**, includes no JWT, Auth user IDs, SQL passwords, or private evidence bytes, and always reports `jwtHttpAcceptance: not-tested`, `productionAuthorized: false`. A private CLI may be constrained by network/IPv6 availability; **never** disable TLS verification or fall back to a different host implicitly.

## Offline CI replay

The networkless Docker PostgreSQL workflow seeds the same source SQL into **synthetic** `supabase_migrations.schema_migrations` rows inside its disposable database and reruns the exact statement-digest/RLS audit. It expects the 11 schema/source checks to pass while `auth-two-user-fixtures` is visibly missing; this is a deliberate release blocker. CI cannot authenticate the external staging endpoint.

## Next real acceptance gate

Create **two independent test Auth accounts** only in Eternyx Staging using the supported Supabase Auth sign-up/admin workflow. Seed distinct synthetic authorized engagements and private evidence via the actual app/API, then execute the previously prepared Wave 10 and Wave 13 GET-only authenticated tests and Wave 12 staging write/revocation acceptance. Validate private Storage, deny cross-owner reads, and record the revocation audit. No production access or customer information is needed.

Before promotion also demonstrate migration-history parity, a genuine isolated backup restore, access controls after restore, and independent security approval. **Production: BLOCKED**.

Supabase migration reconciliation guidance: https://supabase.com/docs/guides/deployment/database-migrations
