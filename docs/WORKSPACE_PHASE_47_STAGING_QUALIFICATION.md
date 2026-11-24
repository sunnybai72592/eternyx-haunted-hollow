# Workspace Phase 47 — Authenticated staging qualification

## Fixed acceptance defects
- Composite-key member and read-cursor tables now use user_id for negative visibility probes rather than a nonexistent id.
- Activity verification requires at least one recorded event, not exactly one.
- Owner/editor/viewer portfolio probes use the same minimal column projections, exact counts, limits and summary validator as the UI. Metadata, membership and authenticated identity are rechecked.
- Outsider portfolio projections must return zero rows and an exact zero count; a query error is not a successful authenticated denial.
- Final identity checks for all four accounts before emitting sanitized evidence.

Three injected local query-double regression groups exercise the probe logic; they are not evidence of live RLS. Existing staging command still requires the 17 explicit environment variables and nonproduction confirmation. No actual credentials or fixture values committed.

## Operator sequence
1. Run general CI and disposable PostgreSQL CI.
2. On the explicitly approved isolated staging target, run `npm run workspace:staging:db:config` and `npm run workspace:staging:db:audit` with the required operator configuration.
3. Set the existing four-account staging fixture variables locally and run `npm run workspace:staging:config`, then `npm run workspace:staging:acceptance`.
4. Separately approve the existing mutation, revocation, Realtime and Storage fixture drills. Verify actual browser workflows including portfolio revocation and downloads.
5. Review the sanitized receipts and migration SQL provenance before production consideration.

No migrations or deployment in this PR. Live execution has not been performed. Read-only acceptance is not production certification.
