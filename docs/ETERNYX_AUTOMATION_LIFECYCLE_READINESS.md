# ETERNYX Automation Phase 2R — Case Lifecycle Consistency and Operational Readiness

## Purpose

The Automation incident pipeline has developed owner case creation, evidence
capture, manual investigation-plan attestations, closure/reopen reviews and
status-transition protection. This phase provides **read-only PostgreSQL
consistency diagnostics** and **truthful operational reporting** over those
persisted ledgers. It does not generate pretend reliability, service uptime,
automatic failure detection or cryptographic proof.

## Ten substantive capabilities

1. **Per-case event-chain validation:** Compare real incident event order,
   status before/after transitions and the original opening event. Identify
   missing openings or inconsistent predecessor links.
2. **Persisted status/revision reconciliation:** Check that the case's current
   status equals its last recorded status transition, and that its revision
   agrees with the number of actual incident events.
3. **Plan attestation consistency:** Verify investigation-plan revision equals
   the number of recorded plan events plus one, all acknowledged steps belong
   to the chosen fixed review checklist, and review acknowledgments do not
   exceed selected steps.
4. **Plan stage and sign-off order:** Check that draft/reviewed/closed states
   correspond to actual review and closure events, with selected steps
   complete before review sign-off and no later acknowledgments.
5. **Source evidence and audit-ledger reconciliation:** Check for a real
   captured evidence snapshot behind any plan; independently count the
   incident status, evidence, plan, closure and reopening ledgers and compare
   against the existing owner-only unified audit projection. This is a
   database consistency check, not a cryptographic tamper audit.
6. **Versioned current-approval signals:** Report whether the latest owner
   closure/reopening decision is effective *for the current case and plan
   revisions*, not whether it was ever approved historically. No approval
   action occurs.
7. **Historic plan continuity insight:** Identify a legitimate reopened
   incident that still has a historically closed plan. It is explicitly
   informational, **not an integrity failure** or proof that a new review
   has been performed.
8. **Actual whole-account status aggregates:** Database-counted owner cases
   open/investigating/resolved, high-severity unresolved, unresolved older
   than 24 hours, evidence coverage and current plan stages. No invented
   severity scores, percentages or uptime.
9. **Honest bounded consistency sample:** Check at most the 30 **most
   recently updated** cases with the full consistency checker. Display
   exact inspected count, per-case codes, number of issues found
   *inside that sample*, whether the sample is truncated and whether
   all cases were checked. Never label a recent sample an account-wide
   verification.
10. **Working owner dashboard and private exports with actual SQL
    acceptance:** Inspect a sampled case against current stored events,
    view specific flagged discrepancies, download strict allowlisted
    JSON/CSV, and run network-isolated PostgreSQL 17 acceptance against
    two independent accounts. The test deliberately alters disposable
    fixture case and plan revisions, confirms the checker catches the
    mismatches and restores the fixtures. Regression tests reject
    fabricated results, unauthorized fields, impossible totals and
    secret-bearing export content.

## Security and limitations

- **Read-only functions:** Both new functions only select/count persisted
  owner-owned rows. They cannot execute, schedule, retry, deploy, restore,
  approve, dismiss, change credentials or alter case histories.
- **Owner scope:** The Edge Function passes the authenticated account ID
  to service-only security-invoker RPCs; browser roles cannot directly
  execute those functions. New request contracts forbid arbitrary
  filters, user ID parameters, secrets, external URLs or code.
- **No crypto integrity:** Comparing current rows to other current rows
  can detect some accidental inconsistencies; it cannot detect coordinated
  tampering, missing-but-self-consistent records, compromised database
  operators, or missing external logs. The UI states this explicitly.
- **No health guarantee:** Case lifecycle consistency is not a service
  availability, worker uptime, webhook delivery, malware, failure-rate
  or incident-remediation certification.
- **Sampling:** The whole-account status totals are exact database
  aggregates. Consistency findings are only for the 30 most recently
  updated cases. A large account may have problems outside that sample.
- **Historical plans:** A closed plan after reopening indicates older
  human review, not current reviewed evidence. Phase 2P requires a
  fresh approval before subsequent planned resolution.
- **Private handling:** No raw workflow inputs/outputs, notes, tokens,
  request fingerprints, customer data or secrets go into report exports.
  Do not treat incident notes as a place to store confidential material.
- **Cost and deployment:** Existing Supabase database execution/storage
  may incur usage fees. No new AI provider, paid GPU, external webhook,
  background worker or production deployment is introduced.

## Release / verification checklist

1. Require green GitGuardian, isolated PostgreSQL 17 case consistency
   suite, full Node utility regressions, JavaScript syntax, production
   build, release provenance and desktop/mobile browser acceptance.
2. Apply migration
   supabase/migrations/20261123140000_automation_lifecycle_integrity.sql
   **after** the preceding Automation migrations through Phase 2Q.
3. Redeploy authenticated automation-control Edge Function and
   publish AutomationLifecycleReadinessPanel through AutomationCloudPanel.
   No new environment secret is needed.
4. Staging: create two independent owner accounts, real completed run
   receipts, incidents, captured evidence and plan review decisions.
5. Check normal initial case, investigating case, resolved case and
   resolved/reopened case. Verify historical closed plan is marked
   informational, not inconsistent.
6. In disposable test database only, deliberately mutate a revision,
   confirm detection, and restore the record. Do not corrupt production
   data for manual testing.
7. Confirm whole-account status counts, evidence coverage, sample size
   and explicitly partial results if there are more than 30 cases.
8. Verify cross-owner case ID reads are rejected; browser RPC permissions
   remain revoked; no private notes or token fields appear in CSV/JSON.
9. Verify inspection doesn't change run count, schedule state,
   evidence ledger, incident state or review approvals.
10. Monitor database load/storage and assess production limits before
    enabling reporting for more users. Merging the PR is not deployment.

## Verification files

- tests/automation-lifecycle-integrity.test.mjs
- tests/sql/automation-lifecycle-integrity-db-smoke.sql
- .github/workflows/automation-lifecycle-integrity-sql.yml
- Existing utility tests, release build and desktop/mobile browser journeys
