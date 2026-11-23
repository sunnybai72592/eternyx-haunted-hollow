# ETERNYX Services Phase 31 — staging release evidence before live Auth

## Current blocker

At the November 23, 2026 check, the connected Supabase account listed **only the Eternyx project** — one project, with no separately listed staging project. The SQL management connector still returned intermittent **connection timeout** errors. Earlier read-only catalog inspection found the Phase 13 amendment table/queues and Phase 14 journal were absent in the connected database.

Phase 29/30's complete thirteen-migration PostgreSQL 17 replay and synthetic A/B/admin/anon RLS regression tests passed inside disposable Docker. That is source/SQL behavior evidence, NOT a real Supabase staging release.

**No new migration, paid staging project, user registration, database write, remote Auth session, production change, or live deployment is made by this Phase 31 PR.**

## The gate now enforces twelve release safeguards

The existing manual protected GitHub workflow "Services staging acceptance (manual, real accounts)" runs a new **operator-evidence preflight before npm install and before any real-account sign-in**.

1. Runs the pinned historical migration source-integrity guard before inspecting staging.
2. Requires the explicit READ_ONLY_STAGING_ACCEPTANCE dispatch acknowledgment.
3. Requires an exact, separate 20-letter staging project reference; the connected production project is expressly rejected.
4. Binds the reference to an exact HTTPS staging project origin, rejecting redirects, userinfo, ports, query strings and alternate URLs.
5. Accepts a restricted JSON snapshot ONLY from the protected services-staging environment variable SERVICES_STAGING_RELEASE_EVIDENCE; never echoes raw evidence to logs.
6. Requires an accurately captured UTC timestamp no more than 24 hours old (with a five-minute clock tolerance).
7. Requires the operator to confirm a successful SQL round-trip and sufficiently stable SQL access for manual checks.
8. Requires an actual Phase 27 catalog-verdict result declaring **64 catalog checks**, success, zero failures and an empty failed-ID list.
9. Requires separate operator reconciliation of real managed migration history against actual deployed catalog and all 13 Services migration sources.
10. Requires explicit review of all eleven historical collision versions, verified **Phase 13 before Phase 14** ordering and no migration-history rewrites.
11. Requires zero unresolved schema gaps and zero unresolved Services migration ambiguities.
12. Emits only fixed failure codes/success flags, leaves existing real-account staging A/B/admin/anon verification mandatory, and never deploys SQL.

**The JSON is operator-supplied, NOT cryptographic evidence** of database state or successful deployment. The verifier confirms the internal consistency, freshness, target binding and declared review, not independently whether the operator's statements are true. Protect the GitHub services-staging environment with trusted mandatory reviewers and do not allow untrusted changes to the evidence.

## Prepare a staging project and reviewed evidence

- Secure explicit approval for the cost, if any, before provisioning a **separate nonproduction** Supabase staging project. None is visible as currently connected.
- Establish stable SQL access. Independently inspect actual managed migration history and database catalog; do not infer the SQL executed from a colliding timestamp. If missing migrations require an approved staging deployment, apply them only with controlled, reviewed ordering: **Phase 13 before Phase 14**.
- Run the SELECT-only Phase 27 SQL audit from docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql in the *staging* SQL Editor after confirming a healthy connection. Record the actual result. It must indicate catalog_checks_passed = true, checks_evaluated = 64, checks_failed = 0, failed_check_ids = [].
- Manually build the following operator-reviewed JSON, replacing ALL sample values with real staging observations. Do NOT simply paste the example as evidence. The illustrative reference and timestamp below are not a real staging project or real verification.
- Set the GitHub protected Environment variable SERVICES_STAGING_RELEASE_EVIDENCE to the reviewed JSON and configure the existing staging-only URL, project ref, authenticated A/B/admin identities and **existing** record IDs according to Phase 20. No emails, tokens, passwords, customer data or database-row exports belong in the evidence object.
- Dispatch the manual Services staging acceptance workflow with READ_ONLY_STAGING_ACCEPTANCE. The gate fails before any account sign-in if evidence is missing, stale, mismatched or incomplete. Real Auth session cleanup continues to use the Phase 26 local-scope sign-out.

## Example JSON shape — illustrative only


```json
{
  "schema": "eternyx-services-staging-operator-evidence-v1",
  "projectRef": "abcdefghijklmnopqrst",
  "capturedAt": "2026-11-23T19:00:00Z",
  "database": {
    "sqlRoundTripConfirmed": true,
    "connectionStableForManualChecks": true
  },
  "catalog": {
    "catalog_checks_passed": true,
    "checks_evaluated": 64,
    "checks_failed": 0,
    "failed_check_ids": []
  },
  "operatorMigrationReview": {
    "actualManagedHistoryInspected": true,
    "allThirteenServicesSourcesReconciled": true,
    "elevenHistoricalCollisionVersionsReviewed": true,
    "phase13BeforePhase14Verified": true,
    "noHistoryRewrites": true,
    "independentCatalogCompared": true,
    "unresolvedServiceSchemaGaps": 0,
    "unresolvedServiceMigrationAmbiguities": 0
  }
}
```

## Independence and definition of done

The protected workflow is **not** an SQL deployer, not a certification of operator honesty, and not a substitute for the real staging application. Verify actual customer A/B/admin/anonymous owned data, saved scope/clarification/amendment and journal events, source grants/RLS, browser behavior and reviewer sign-off separately.

The production-linked project is NOT a fallback staging target. No deployment is authorized by passing CI. Services remains **not production-ready** until deployment, history, security and real-account staging evidence are verified and approved.
