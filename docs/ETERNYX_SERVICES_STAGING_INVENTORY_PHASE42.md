# ETERNYX Services Phase 42 — genuine staging gap inventory (read-only)

**Current staging is real and healthy. The Services schema is not deployed there yet.** Phase 41 registered-project validation is useful, but the full protected Services acceptance workflow is intentionally fail-closed when none of the 13 Services migrations/tables exist. Phase 42 supplies a separate, non-deploying, manual operator inventory to distinguish **missing Services deployment** from **misconfigured staging** without treating missing schema as a successful security test.

## Observed live staging state — 23 November 2026

A separate Supabase project named **Eternyx Staging** was confirmed using the connected Supabase project inventory, and was reported as `ACTIVE_HEALTHY` running PostgreSQL 17 in `us-east-1`, in the same organization as ETERNYX production. It is a *different project* from the production-linked ETERNYX instance.

A read-only staging query and managed migration listing observed **three pentest/security-area migrations**, **zero of the 13 named Services migrations**, and **all six Services schema markers absent**: requests, customer followup queue, brief amendments, customer amendment queue, admin amendment queue, and request journal. This is a point-in-time observation using connected staging read-only metadata access, **not** a live connected execution of the Phase 36 Services security gate. Re-check before any deployment.

**Services staging deployment is missing and remains a release blocker.** The previous assumption that no separate staging project had been created is no longer accurate.

## New independent manual GitHub Actions workflow

`.github/workflows/services-staging-readonly-inventory.yml`

1. Trusted operator selects `READ_ONLY_STAGING_INVENTORY` via manual workflow dispatch. The `services-staging` GitHub Environment controls approval, secrets, access, and separation from production.
2. Validate the **existing 13-file reviewed Services source manifest** and collision/source-integrity guard. No SQL generation for deployment.
3. Perform the Phase 41 fixed-origin, GET-only Management API registration proof using the existing staging organization, name, region and database-host pins. Phase 41 now recognizes the **inventory-only** explicit approval separately from `READ_ONLY_STAGING_ACCEPTANCE`. The original full acceptance workflow remains unchanged.
4. Connect using **only** `services_staging_auditor.<staging-ref>`, read-only PostgreSQL transactions, `REPEATABLE READ`, verified TLS, a bounded statement timeout and no shell. Require pre-provisioned audit credentials scoped to staging; if not configured, report `staging_auditor_unavailable`, **never** pretend the schema is empty.
5. Read **only** the checked-in Phase 35 six schema booleans and named/versioned records from `supabase_migrations.schema_migrations`. No business data, auth users, tenant rows, SQL functions, migration SQL bodies, credentials, or request bodies.
6. Report one of three states: `awaiting_services_staging_deployment`, `partial_or_inconsistent_services_staging_schema`, `eligible_for_protected_services_safety_audit`. The last requires all **13 source-defined names**, all **six schema markers** and correct **recorded dependency order**. It is **not** an RLS, Auth, full 64/64 catalog or production readiness certification.
7. Display only non-sensitive source-defined missing migration names and six catalog marker names, not unknown migration names, customer data, connection refs, tokens or raw catalog/SQL response.
8. Unit tests cover empty staging with unrelated security migrations, partial/mismatched migrations and schema, all 13/6 markers, Phase 13 vs 14 order, extra/invalid history, approval and production ref fencing, and workflow ordering. Offline CI requires no Management API or staging secrets.

## Existing secure staging configuration

Ensure the protected `services-staging` GitHub environment contains:
- `SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF` and `SERVICES_PREFLIGHT_URL` for **staging only**.
- `SERVICES_STAGING_EXPECTED_ORG_SLUG`, `SERVICES_STAGING_EXPECTED_PROJECT_NAME`, `SERVICES_STAGING_AUDIT_POOLER_HOST`.
- `SERVICES_STAGING_MANAGEMENT_API_TOKEN` scoped as narrowly as possible to project-read capability.
- `SERVICES_STAGING_AUDIT_DB_PASSWORD` for a dedicated **unprivileged and limited** staging auditor, not `postgres` and not a `service_role` key.

Do not reuse production credentials. Creation/provisioning of the restricted auditor role requires separate, reviewed **staging-only** privileges and is not performed by this PR.

## Actual remaining work

A separate reviewed **staging-only deployment** must reconcile all 13 Services migrations against existing staging security migrations and historical cross-pillar timestamp collisions. Apply the source-defined dependency chain in order, with **Phase 13 before Phase 14**. Do not infer exact deployed SQL contents from a matching migration name, do not rewrite applied history or execute schema changes against production, and do not use the networkless PG17 replay as evidence of remote application.

After an independently approved staging migration plan has actually run, execute the existing manual protected Phase 36–41 full database safety gate, then real customer A/B, Admin and anonymous account acceptance. Until then, **Services is not production-ready**.

**No migration, project, customer row, token, audit role, or billable resource was created or changed by Phase 42.**
