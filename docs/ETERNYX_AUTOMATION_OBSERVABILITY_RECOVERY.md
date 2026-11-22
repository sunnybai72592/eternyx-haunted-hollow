# ETERNYX Automation Phase 2L — Measured Observability, Audit Export and Guarded Recovery

## Overview

This milestone strengthens the authenticated Automation workspace with a factual
operations overview, privacy-controlled audit exports and manual schedule
quarantine. All figures are measured from existing owner-scoped PostgreSQL rows.
No real workload, signed webhook, scheduler tick or third-party issue is created
by a diagnostic or audit request.

## Ten production-oriented improvements in one PR

1. **Measured 24-hour execution breakdown:** count completed manual, signed
   webhook and scheduled runs, and show last completed timestamp.
2. **Measured seven-day run volume:** an independent seven-day total, separate
   from the rolling 24-hour count. Only recorded successful completions count.
   Attempted-but-not-recorded failures are NOT invented.
3. **Real trigger health metadata:** enabled/disabled webhook counts, enabled
   schedules, active versus expired schedule leases, failed schedule last
   statuses, paused workflows, pending versus overdue approvals and rejected
   approval records. None of these figures proves worker uptime or delivery.
4. **Private seven-day audit snapshot:** server generates a bounded, owner-only
   immutable snapshot from actually completed run metadata: run UUID, source
   workflow, revision, channel, counts, timestamp and step trace.
5. **Truthful truncation:** include up to 100 matching records, report actual
   total matching and clearly state when the sample is truncated. Filters for
   one saved workflow or execution channel can narrow the snapshot.
6. **Replay-safe export receipt:** same UUID/filters returns the exact stored
   snapshot rather than a newly computed, misleading export. Changing filters
   with that UUID is rejected. The limit is five new exports per rolling 24h.
7. **Safely downloadable JSON and CSV:** the frontend explicitly allowlists
   nonsecret metadata fields; CSV escapes quotes and spreadsheet formula
   prefixes. Downloads are assembled in the user's browser; no external
   export service is invoked. No raw inputs/outputs, credential values,
   secrets, run fingerprints or request keys are included.
8. **Guarded schedule quarantine:** the owner may disable a schedule while
   investigating unexpected behavior, an expired lease or a manual safety
   hold. The function checks owner, exact schedule revision and current worker
   lease. An active, unexpired lease makes quarantine fail closed.
9. **No automatic retry or restoration:** quarantine disables the schedule,
   clears any expired lease, invalidates the old schedule request key,
   increments revision and records a small private reason/receipt.
   Nothing re-runs, calls an external API, or re-enables the schedule.
   Existing schedule controls require explicit user action before resumption.
   Five quarantine actions per account per rolling 24h, replay safe.
10. **Private seven-day retention and security acceptance:** service-role-only
    RLS-protected receipts, owner-triggered audit/quarantine metadata cleanup,
    strict authenticated request contracts, Node regressions and
    network-isolated PostgreSQL 17 tests for two account identities, owner
    isolation, precise quotas, immutable snapshots and lease fencing.

## Important limitations

- This is factual stored-metadata monitoring, NOT a complete infrastructure
  failure/uptime monitor. Worker liveness and real ingress delivery are not
  verified. A failed attempt may never have become a completed run record.
- Export is a bounded historical snapshot, not a complete download if the
  server reports truncation. Filter or query the existing paginated history
  for other portions. The client sanitizes fields a second time.
- Quarantine is a safety stop, not replay or recovery of lost input. It cannot
  reverse an already completed job. An unexpired worker lease is explicitly
  protected. It does not delete encrypted schedule inputs or reset old
  already-completed audit history.
- Existing Supabase hosting and storage may incur usage costs. The five/day
  request quotas are not guaranteed dollar-value caps.
- No paid AI/GPU provider, arbitrary script runtime, or automated external
  operation is introduced.

## Deployment — NOT performed by merging

1. Require all applicable CI checks green: Node utility regression, JavaScript
   syntax, Vite production build, generated release provenance,
   desktop/mobile Chrome acceptance, GitGuardian and the dedicated
   disposable PostgreSQL 17 acceptance.
2. Apply the migration file:
   supabase/migrations/20261123080000_automation_observability_recovery.sql
   after all earlier Automation migrations including Phase 2K.
3. Redeploy the authenticated automation-control Edge Function and publish
   the AutomationAuditRecoveryPanel and its integration in
   AutomationCloudPanel. No additional API key, provider or paid service is
   necessary; existing webhook/schedule secrets remain server-only.
4. In staging, confirm two owner accounts cannot read each other's counters,
   exports or schedules. Check that only actually recorded runs appear.
5. Run an export containing more than 100 sample completed-run receipts:
   the response must be marked truncated and include exactly 100. Verify a
   repeat request with the same key returns the original snapshot, not current
   data. Test the five/day limit and safe CSV handling in spreadsheet apps.
6. Stage one enabled schedule with an active 90-second lease and ensure
   quarantine fails. Then expire that lease; require explicit owner
   confirmation to quarantine it, verify it is disabled, old lease invalidated,
   revision incremented and no additional run created. Test stale revision,
   nonowner action, duplicate key and five/day cap.
7. Observe actual hosting/retention behavior. Cleanup happens opportunistically
   when the owner refreshes observability. There is NO guaranteed-timing cron.

## Verification

Node: tests/automation-observability-recovery.test.mjs

SQL: tests/sql/automation-observability-recovery-db-smoke.sql

GitHub Actions: Automation Observability, Audits and Safe Quarantine SQL Acceptance.

Nothing in this PR rotates or publishes a production secret or deploys
production migrations/functions without a separate rollout.
