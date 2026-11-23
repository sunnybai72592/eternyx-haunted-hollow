# ETERNYX Automation Phase 2S — Owner Case Audit Coverage

Phase 2R checks the 30 most recently updated cases. Phase 2S adds read-only
explicit pagination so operators can inspect older case histories in batches
of up to twenty. Pages are best-effort, not atomic snapshots, and never
certify cryptographic integrity or system uptime.

## Ten significant improvements

1. Stable owner-only pagination by created_at DESC and UUID DESC. Ordinary
   status updates do not shuffle keyset order.
2. 1–20 cases per authenticated request; one-row lookahead; up to 50 pages
   (1,000 cases) per manually initiated browser scan.
3. Paired ISO timestamp + UUID cursor, echoed back and validated across pages;
   reject missing components, repeated cases, skipped pages and wrong order.
4. Real per-case integrity checks based on the existing Phase 2R owner ledger
   function, including status/revision, plan review and audit consistency.
5. Recorded per-page metrics: mismatches, evidence-free cases and historically
   closed plans after reopening (informational, not an integrity failure).
6. Validate server provenance, descending row order, counts, duplicate IDs,
   cursor continuity and explicit limitations before showing results.
7. Detect changing account case counts between page requests and warn
   that newly created cases may be outside the current traversal.
8. Operator interface with start scan, load older cases, filter by ID/status/
   finding, and independently recheck the current state of a chosen case.
9. Owner-private allowlisted JSON and spreadsheet-safe CSV with no workflow
   input/output, secrets, private notes or request keys, and explicit partial
   coverage flags.
10. PostgreSQL 17 acceptance and Node regressions: 45 persisted case fixtures
    across three pages, two accounts, deliberate revision drift and restoration,
    keyset sequence checks, privacy boundaries and zero new workflow runs.

## Important limits

- This is an inspection across separate HTTP/database requests, not a single
  repeatable-read or serializable transaction. Cases can be created or
  changed between requests. A completed traversal is not a production
  release certification.
- Phase 2R orders its recent sample by last update; Phase 2S scans by
  original creation date. They have different purposes and selection rules.
- A green result means only that the checked stored ledgers satisfy these
  explicit consistency rules. It does not prove that the database was not
  tampered with in a coordinated fashion, that a worker is live, or that
  an external webhook was delivered.
- Manual scan UI caps at 1,000 cases. Older cases beyond that cap remain
  outside the interactive scan and must not be called verified.
- Existing Supabase compute/storage can incur charges. This PR does not add
  new paid AI/GPU tools, schedule restores, automatic retries, background
  jobs, worker actions or external writes.

## Deployment checklist (not performed by merging)

1. All checks green: network-isolated PostgreSQL 17, GitGuardian, Node suite,
   syntax, production build, release provenance, desktop/mobile browser.
2. Apply migration:
   supabase/migrations/20261123150000_automation_case_coverage.sql
   only AFTER migrations through Phase 2R have been applied.
3. Redeploy the authenticated automation-control Edge Function with
   incidentCoveragePage; publish AutomationCaseCoveragePanel from
   AutomationCloudPanel. No additional API key is needed.
4. In staging, verify two owner accounts, bound page sizes, paired cursor,
   owner isolation, actual per-case inconsistencies and no execution.
5. Test a case arriving during the scan, confirm count-change warning.
6. Confirm partial results remain explicitly incomplete, never a security
   certification, and complete navigation retains non-atomic disclaimer.
7. Check direct owner case re-read against fresh ledger status after changes.
8. Inspect exported JSON/CSV for notes, credentials, request IDs or raw text.
9. Review resource cost and query latency with many realistic case records.
10. Treat database migration, function deployment and public website publish
    as separate release actions; GitHub merge does not deploy them.

## Verification

- tests/automation-case-coverage.test.mjs
- tests/sql/automation-case-coverage-db-smoke.sql
- .github/workflows/automation-case-coverage-sql.yml
- Standard utility, build, provenance and desktop/mobile browser workflows
