# ETERNYX Automation Phase 2N — Verified Incident Evidence & Operational Reporting

## What is real

This milestone adds an **append-only owner incident evidence ledger**, **factual 7- or 30-day operational case reports**, **private JSON/CSV exports**, and **read-only quarantine recovery checks**. Records are acquired using service-only owner-checked PostgreSQL functions; they are not invented by the browser.

## Ten meaningful improvements

1. **Capture verified source evidence** from stored incident origin, completed workflow run, current saved schedule or existing quarantine receipt. The server reads the record from the database; the browser cannot supply evidence contents.
2. **Enforce owner and incident relationship:** source must be owned by the same account and originate from the current incident or relate to its saved workflow. Unrelated workflows, deleted sources or another user's incident are rejected.
3. **Append-only bounded snapshots:** up to 8 distinct snapshots per incident and 30 captures per owner per rolling 24h. Same request UUID replays its exact stored snapshot; another UUID cannot duplicate the same incident/source/kind. No automatic recapture or scheduled collection.
4. **Metadata-only privacy:** run source includes counts, timestamps and channel, not output or input content, request fingerprints or encryption fields. Schedule source includes current enabled/revision/lease status, not encrypted input, secret, lease token or private output. Quarantine includes reason and receipt metadata.
5. **Auditable owner evidence list:** up to 8 existing snapshots with source ID, kind, capture time and bounded server-generated JSON; successful output is labeled as a captured historical state, not live worker verification.
6. **Measured incident reports** for precisely 7 or 30 days: newly reported incidents, recorded resolution transitions, recorded case origins and case severity, distinct from global current status counts. No fake success percentages or upstream failure metrics.
7. **Backlog and age insights:** current open/investigating/resolved, high-severity unresolved, unresolved older than 24h and 7d, and actual owner-scoped top five workflow IDs by unresolved case count.
8. **Real evidence coverage:** counts additional captured evidence snapshots within reporting period and currently unresolved incidents with/without attached evidence. Evidence coverage is not a substitute for investigation quality.
9. **Private browser-generated JSON/CSV:** authenticated API retains database provenance, and the client requires it; then exports a strict nonsecret counts/UUID allowlist. CSV uses quoted/escaped cells and mitigates spreadsheet formula interpretation. No user notes, workflow payloads or credential fields.
10. **No-execution quarantine recovery check:** compare actual owner quarantine receipt with schedule existence, current revision, disabled state, lease, prior review decision, and separate manual-restore consideration. It never runs jobs, enables schedules, clears leases or verifies worker liveness. Acceptance includes Node regressions and networkless PostgreSQL 17 with two owners.

## Safety boundaries

- **Incident reporting is human-authored case management, not automatic detection** of every runtime failure. Resolution event counts can differ from unique cases if a case is reopened and resolved again.
- An evidence snapshot describes data **at capture time**, not proof of ongoing healthy operations.
- Schedules and workflows must still be restored, if appropriate, through independently authorized existing controls. This capability merely returns flags for human review.
- The browser shows server-generated nonsecret metadata; users should never put credentials, personally identifying details or confidential customer content into incident titles or review notes.
- Only the 30 most recently returned completed-run receipts can be discovered through the evidence-picker UI for a selected workflow at a time. The backend accepts exact valid IDs; no source lists are fabricated.
- Review receipts may expire under the earlier seven-day metadata retention scheme; these are not kept indefinitely by this feature.
- Request-count limits are not financial spend guarantees. Supabase host/storage can incur existing usage fees.
- No paid GPU, external inference API, recurring new worker, automated retry, external webhook dispatch or GitHub write is introduced.

## Deployment — not performed by GitHub PR merge

1. Require passing GitGuardian, dedicated PostgreSQL 17 evidence acceptance, full Node tests, syntax check, production build, release provenance and desktop/mobile Chrome journeys.
2. Apply the migration after Phase 2M:
   supabase/migrations/20261123100000_automation_incident_evidence_reporting.sql
3. Redeploy the existing authenticated automation-control Edge Function; publish new AutomationIncidentEvidencePanel and updated AutomationCloudPanel. No new secret or paid provider is needed.
4. In staging create two owners, unrelated workflows, genuine run and schedule metadata and a real incident. Confirm a captured source cannot be foreign, unrelated or tampered with. Verify same-key replay returns the original snapshot and new UUID duplicate is denied.
5. Verify at least two report periods (7/30), manual status transitions, source and severity counts, unresolved age, evidence coverage and no fabricated upstream failure metrics. Download JSON/CSV and verify they contain no notes or tokens.
6. With a real owner-quarantined schedule, run passive recovery checks both before and after the existing manual review. Verify all checks are database-derived and the schedule remains disabled. Verify no new run records or external writes arise from any evidence/report action.
7. Audit RLS grants: anon/authenticated must not access privileged evidence table or reporting RPCs directly. Monitor Supabase query/storage usage in staging.

## Verification paths

- tests/automation-incident-evidence.test.mjs
- tests/sql/automation-incident-evidence-db-smoke.sql
- GitHub Actions: Automation Incident Evidence and Reporting SQL Acceptance
- Existing utility tests, app build, provenance, browser journeys

This PR does not deploy to production or modify any secret.
