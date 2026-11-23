# ETERNYX Services Phase 36 — independently queried staging history and catalog

**No new migration. No production write. No new Supabase project, payment, account registration, business-record mutation, or secret export.**

## What changed

The protected manual GitHub Action "Services staging acceptance (manual, real accounts)" previously relied on a fresh, operator-supplied JSON claim of a passing **64-check** Phase 27 database catalog and reconciled migrations. That remains a mandatory human review, but it cannot independently prove the SQL was actually executed.

Phase 36 now **adds a real database query** in the protected staging workflow **before npm install and before test-user sign-in**. Using a dedicated read-only PostgreSQL login, it runs in one explicitly read-only transaction: the connection identity and database timestamp, the actual named managed migration history, the exact checked-in six-object Phase 35 schema probe, and the exact checked-in 64-check Phase 27 catalog verdict. Missing evidence, authentication, permissions, TLS validation, SQL error, timeout, partial schema or missing migration fails closed.

This is stronger than simply affirming the staging SQL was checked. It remains *point-in-time catalog evidence*, not proof of exact migration content, historical timestamp collision remediation, full Supabase Auth isolation, or production readiness.

## Blocked unless approved independent staging exists

As of November 23, 2026 the connected account lists only one Supabase project — the existing Eternyx production-linked project. Its real managed history shows the first 11 named Services migrations but not Phase 13/14. Read-only SQL finds the Phase 13 amendment table and queues and Phase 14 journal absent. **This is a live production-linked observation, not authorization to change it.**

Do **not** point the staging tests or audit password to that project. First arrange an operator-approved **separate staging project**, budget approval for any project cost, controlled independent staging migration reconciliation and installation (approved missing Phase 13 before Phase 14). All eleven historical cross-pillar timestamp collision groups require independent review; never blindly run all repository migrations, rewrite already-applied history, or run "supabase db push" to bypass the gap.

## Dedicated read-only auditor role (staging ONLY)

An authorized database administrator must first create a dedicated **services_staging_auditor** LOGIN role with its own strong password **in the staging database only**. It must:

- Be NON-SUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOINHERIT; not a member of postgres, service_role, authenticated, anon, or another privileged/application role.
- Have CONNECT on the staging database, USAGE on the **supabase_migrations** schema, and SELECT of only the **version** and **name** columns of **supabase_migrations.schema_migrations**. The catalog tables/views used by the existing read-only checks must be queryable.
- Have **no INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, REPLICATION or row-read access** to customer/business tables. Ensure privilege inspection is reviewed separately. Require database default_transaction_read_only=on on this role where available.
- Be provisioned through your approved staging-only DBA process, with a separately reviewed grant script and secret rotation procedure. This PR deliberately **does not create this account**.
- Be tested with the **session-mode shared Supavisor pooler**, not the transaction pooler. Session mode uses port 5432 and supports the username format `services_staging_auditor.<STAGING_PROJECT_REF>`. Select the actual pooler hostname from the staging Dashboard **Connect** dialog; do not infer its AWS cluster index. Supabase notes session mode supports IPv4, unlike some direct connections.

Reference: Supabase's current [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) guide. Verify the current dashboard guidance for connection settings. No legacy connection string or administrator password is permitted.

## Configure GitHub Environment "services-staging"

The workflow must remain manually dispatched and protected by trusted required reviewers; restrict who can edit environment variables, secrets and workflow files.

Existing protected values remain required: SERVICES_PREFLIGHT_URL, SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF, SERVICES_STAGING_RELEASE_EVIDENCE, the three real staging-only A/B/Admin account secrets, pre-existing request fixture IDs, and the publishable Supabase key. The Phase 31 operator-evidence snapshot must be **fresh and actually reviewed**, with zero unresolved collisions/gaps and a 64/64 catalog result.

Add exactly these new protected settings for the **different, independently approved staging project**:

- Environment **variable**: `SERVICES_STAGING_AUDIT_POOLER_HOST`, e.g. `aws-0-us-east-1.pooler.supabase.com`, copied directly from that staging project's Supabase Connect dialog (not a URL, no port, no username or password).
- Environment **secret**: `SERVICES_STAGING_AUDIT_DB_PASSWORD`, the dedicated staging-only read-only auditor role's password. Never reuse the project postgres password, a service-role key, a deploy key, or a password used by production.

The code pins the username to `services_staging_auditor.<staging-ref>`, port **5432**, database **postgres**, TLS `verify-full` with the OS CA bundle, and forces `default_transaction_read_only=on`. It rejects ports, alternative hosts, direct DB URLs and production references. The password is passed via `PGPASSWORD` only, never placed in command-line arguments or printed. If TLS fails, repair the certificate configuration through a separately reviewed PR rather than downgrading verification. The job's PostgreSQL client installation happens only after the operator gate and only during the manually approved protected workflow.

The query is composed from reviewed, exact source files; the code does not accept user-controlled SQL text or execute a shell. It applies **BEGIN TRANSACTION READ ONLY**, a statement timeout, and **COMMIT**. History and catalog are read by PostgreSQL. No business-row SELECT is performed. The script returns only fixed pass/fail statuses and never writes SQL outputs, database errors or secret values to Actions logs.

## Mandatory truth conditions

Before any staging Auth sign-in, Phase 36 requires all of:

1. Fresh approved operator evidence and exact staging project ref, not the linked production ref.
2. A genuine TLS-verified Supabase session pooler connection under the staging-specific dedicated auditor login; correct SQL current_user and database.
3. Database clock within five minutes of the CI runner clock.
4. A complete SQL-read managed migration history with unique version/name formats. Actual recorded migration **names**, not repository filename timestamps, must include all 13 Services sources.
5. The original requests table, Phase 12 follow-up view, Phase 13 amendment table and both queues, and Phase 14 journal must all exist.
6. The original Phase 27 catalog query must actually report **64 checks passed, zero failed, no failing check IDs**.
7. Source Phase 13 history and objects must be present before treating dependent Phase 14 as valid; any discrepancy blocks acceptance.
8. The prior operator release approval still must attest actual collision review and deployment ordering. The remote SQL catalog alone cannot identify which historical migration file ran under a reused timestamp.
9. After this gate passes, the separate real-account staging A/B/admin/anon acceptance must *also* pass. Passing SQL is never enough.

If a protected setting is absent, the staging project is not connected, the auditor lacks permission, or the live catalog differs from the operator's prior claim, the workflow fails **before authenticating any test user**. There is no staging shortcut and **no fallback to production**.

## Limitations and release status

The dedicated auditor identity is a **role declaration**: the workflow does not prove its grants, membership or privilege exclusions. The staging DBA must independently confirm least privilege and enforce default read-only at the role level. The audit checks a schema snapshot, not true migration SQL content or stable network health across all services. The protected repo workflow cannot itself attest the operator's honesty or prove a staging project is registered through a separate Management API. Real-account staging verification is still required.

This PR is **not production-ready** certification. It only makes the eventual separately provisioned real staging acceptance gate independently verify more of its own required evidence. Production Supabase and its migrations remain unchanged.
