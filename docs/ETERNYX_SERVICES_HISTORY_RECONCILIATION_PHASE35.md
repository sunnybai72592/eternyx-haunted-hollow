# ETERNYX Services Phase 35 — actual managed-history and catalog reconciliation

## Verified linked-project observation — November 23, 2026

The connected Supabase project list currently exposes only the existing **Eternyx** project, not an independently verified staging project. A successful read-only managed-migrations listing returned **11 named Services migrations**, from service_requests through service_clarification_followthrough, embedded among other historical migrations. There were no named entries for service_brief_amendments or service_request_journal.

The managed-history **versions are different from the timestamps in this repository's source migration filenames**. This version mismatch is why matching by filename timestamp, or running a blind migration push, is unsafe.

A successful independent read-only SQL query confirmed the Phase 1 requests table and Phase 12 follow-up queue exist, while **four absent Phase 13/14 objects** were:
- public.service_brief_amendments
- public.service_customer_amendment_queue
- public.service_admin_amendment_queue
- public.service_request_journal

These are point-in-time observations of the existing linked project, NOT evidence that any object should be deployed there automatically. Do not interpret a successful SELECT 1 or healthy management dashboard as proof of complete Services deployment.

**No new migration, remote SQL write, user registration, customer-data read, schema repair or paid staging project is created by this PR.**

## What Phase 35 adds

1. A local read-only reconciliation tool that consumes **two independently captured kinds of evidence**: complete managed migration history by actual name, and the presence flags of six schema objects.
2. Source integrity revalidation against the existing 13-file Services migration allowlist and all historical collision/version-content checks.
3. Exact name matching for the first 11 Services migrations and the two later phases, **not source timestamp/version matching**.
4. Detection of an unexpectedly missing earlier Services migration; this must block further planning.
5. Distinct classification for fully absent, partially present, history-present/schema-missing, schema-present/history-missing and apparently-present but not content-proven Phase 13/14 objects.
6. A separate Phase 14 dependency on Phase 13. Approved staging-only changes must install **Phase 13 before Phase 14**.
7. Strict fail-closed checks for a complete and recent snapshot, well-formed unique migration history versions and nonempty names, bounded length, and six explicitly boolean catalog markers.
8. Production vs unverified nonproduction classification; a different-looking project reference is **not** automatically treated as independently verified staging.
9. Redacted results without customer data, raw URLs, source JSON, account credentials or input project references.
10. A source-controlled SELECT-only six-object catalog query with no business-table row reads.
11. CI regression tests for the observed 11+2 gap, missing earlier history, three kinds of schema/history disagreement, partial schema, stale input and spoofed project status.
12. An explicit release block in **all** outcomes: neither read-only evidence nor source compilation authorizes production or staging schema mutations.

## Collect genuine read-only evidence

The operator must collect the **complete** migration-history listing for the intended project, not merely the 13 Services names. Each row has its own applied version and name; unrelated migrations remain in the complete listing. Where the tool exposes unnamed legacy migrations, the name may be an empty string. Do not manufacture source filename version numbers or set missing migration names to present.

Run the exact SQL from docs/sql/eternyx/services-phase35-readonly-schema-markers.sql using operator-approved, read-only database access to **the same target project**. It returns six booleans and touches no customer rows.

Construct an evidence JSON file outside the repository, containing:

- schema: eternyx-services-phase35-readonly-evidence-v1
- projectRef: the exact target Supabase reference (never substitute production as staging)
- capturedAt: UTC ISO timestamp at the actual snapshot collection
- historyComplete: true **only** when every managed migration record has been collected
- managedMigrations: the full array of objects with version and name, **from the managed migrations API**, not guessed source timestamps
- catalog: exactly these six booleans: phase1_requests, phase12_customer_followup_queue, phase13_amendments, phase13_customer_queue, phase13_admin_queue, phase14_journal

For example, this **deliberately incomplete illustrative shape** must be replaced with real captured evidence before it can pass:

```json
{
  "schema": "eternyx-services-phase35-readonly-evidence-v1",
  "projectRef": "abcdefghijklmnopqrst",
  "capturedAt": "2026-11-23T00:00:00Z",
  "historyComplete": false,
  "managedMigrations": [],
  "catalog": {
    "phase1_requests": false,
    "phase12_customer_followup_queue": false,
    "phase13_amendments": false,
    "phase13_customer_queue": false,
    "phase13_admin_queue": false,
    "phase14_journal": false
  }
}
```

The JSON above is an **invalid placeholder for documentation only**: incomplete history, synthetic reference, and an old capture time. Never mark unknown booleans true or claim an incomplete history is complete.

Once independently captured, run:

```bash
node scripts/services-phase35-managed-history-reconciler.mjs /private/path/services-observed-evidence.json
```

The CLI only reads a local JSON file and the checked repository SQL sources. It cannot contact Supabase, apply migrations, produce migration SQL, create staging projects, or authenticate test users. It always reports stagingDeploymentAuthorized and productionDeploymentAuthorized as false.

## What the observed gap means — and does not mean

The linked database's **first 11 named Services migrations and the checked Phase 1/12 objects are present**, while neither the Phase 13/14 managed migration names nor the four corresponding schema objects were observed. This is stronger evidence of a genuine deployment gap than a mere failing CI check, but it is **not permission to deploy to production**.

The next actual release action requires a separate budget-approved nonproduction project, a *fresh* full managed-history and catalog audit against that project, independently reviewed reconciliation of all eleven historical repository timestamp collisions, reviewed staged schema changes for genuinely missing objects, the stricter 64-check Phase 27 query, and protected **real-account staging** A/B/Admin/anonymous acceptance. The staging change operator must preserve data, take backups/rollback plans, verify source content/dependencies and seek explicit approval before any SQL write. Manually altering the managed migration table to satisfy this report is forbidden.

Following a successful staging deployment, conduct desktop/mobile workflow tests, then plan production migration under separate approvals. The Services pillar is **not production-ready**.

No automatic database writes, billing, acceptance of service delivery, or customer authority are granted by these checks.
