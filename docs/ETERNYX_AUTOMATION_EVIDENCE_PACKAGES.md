# ETERNYX Automation Phase 2T — Source-backed Audit Packages & Manual Release Review

## Scope

ETERNYX Automation can now capture private, immutable, metadata-only audit
packages from **existing owner-owned incident and evidence records**. Human
operators may record a bounded, append-only review. These are case-review
artifacts, **not release certificates**. No signed provenance, deployment
verification, worker uptime, automatic remediation, job execution or new
paid inference provider is asserted.

## Ten substantial improvements

1. **Genuine evidence-bound capture:** a package requires an existing case,
   exactly matching current incident revision, and an existing linked owner
   evidence receipt. The database computes the projection itself, never
   accepting a client-uploaded snapshot, arbitrary URL or raw text.
2. **Immutable, allowlisted package:** stores case status/revision, evidence
   reference/kind/capture timestamp, captured evidence count, plan stage
   and step counts, closure/reopening decision counts and database audit
   ledger counts. It deliberately omits notes, raw inputs/outputs, secrets,
   request fingerprints and the underlying evidence snapshot itself.
3. **Consistency gate:** a package can only be captured if existing
   owner lifecycle checks have no recorded findings. This is database
   consistency, not cryptographic tamper or worker-health verification.
4. **Freshness inspection:** each private inbox reprojects current case
   metadata, comparing it with the stored immutable package. A later
   status transition, updated plan or additional evidence invalidates
   current-snapshot status without changing past packages.
5. **Strict idempotency and quotas:** package UUID request replays
   exact original content, rejects changed intent, limits new packages
   to eight per incident and thirty per owner per rolling 24 hours.
6. **Bounded manual review decisions:** needs_attention can record a
   historical concern; reviewed_for_manual_release_checklist is permitted
   only for a current consistent package after three explicit
   limitations acknowledgments and a 12–500-character private note.
7. **Append-only owner review receipts:** each decision is timestamped,
   idempotent by its request UUID and bound to the correct package.
   Maximum eight review decisions per package and thirty new decisions
   per owner per rolling 24 hours. Nothing gets deployed or retried.
8. **Actual operator UI:** owner case discovery, evidence selection,
   immutable package creation, version/freshness indicators,
   chronological human-review notes, current/stale review gates and
   confirmation before recording manual decisions.
9. **Note-free private exports and honest release checklist:** source
   validation plus strictly allowlisted JSON/CSV; never export private
   review notes, raw payloads or secrets. A five-step local checklist
   lets an operator manually acknowledge migration, Edge deployment,
   frontend, CI and staging validation, **without claiming any of
   those actions was verified or performed by the app**.
10. **Executable acceptance:** network-isolated PostgreSQL 17 suite
    verifies real two-account evidence receipts, cross-owner privacy,
    missing evidence and stale revisions, exact capture/review replay,
    later case transition invalidation, fresh reviewed package,
    quotas and zero new run receipts. Node regressions validate API
    contracts and exported-source provenance and reject false release
    or cryptographic claims.

## Architectural limits

- Package capture and review are advisory metadata operations, not
  incident resolution or direct release authorization.
- Old snapshots remain historical. A previously recorded review is
  not fresh review of later case status changes.
- Checking three limitations is a **human attestation**, not a system
  scan or a second independent reviewer. Review notes are private to
  the owner but should never contain personal data, passwords,
  customer content, private keys or API tokens.
- The app's local release checklist is ephemeral: it does not
  communicate with Supabase migration history, GitHub Actions,
  deployments, hosting providers or live worker logs.
- No automatic job retry, schedule activation, webhook delivery,
  GitHub write, credential rotation, cloud provisioning or GPU work
  occurs in this phase.
- Existing Supabase compute/storage may incur ordinary charges;
  request-count caps are not an account monetary spending limit.

## Rollout / merge gate (not performed automatically)

1. Require success for isolated PostgreSQL 17 acceptance, GitGuardian,
   full Node utility suite, JavaScript syntax, production build,
   release provenance and desktop/mobile browser acceptance.
2. Apply
   supabase/migrations/20261123160000_automation_evidence_packages.sql
   after **all** prior Automation migrations through Phase 2S.
3. Redeploy the authenticated automation-control Edge Function and
   publish AutomationAuditPackagePanel through AutomationCloudPanel.
   No new AI API key or external provider is required.
4. In staging create two independent owners, genuine completed runs,
   incident origins and captured evidence. Verify an unrelated
   account cannot create/read/review another user's package.
5. Exercise exact source-backed capture, changed-intent UUID replay,
   stale incident revision, duplicate-safe retry and maximum package
   and review counts.
6. Transition an incident after capturing a package. Confirm the
   historical package remains intact but is marked stale, and a
   reviewed decision requires a newly captured current package.
7. Test the needs_attention path on an older package; confirm a
   reviewed decision needs all three manual limitation acknowledgments.
8. Inspect exports for unexpected notes, secrets, raw workflow content
   and misleading deployment/cryptographic claims.
9. Independently confirm the real migration, Edge Function, frontend,
   CI status and staging isolation before promoting a production release.
10. Remember merging GitHub does not deploy a migration, Edge Function,
    frontend, payment system or any cloud runtime. Monitor actual
    database load, usage costs and protected owner data.

## Verification files

- tests/automation-evidence-packages.test.mjs
- tests/sql/automation-evidence-packages-db-smoke.sql
- .github/workflows/automation-evidence-packages-sql.yml
- Existing utility, build, release-provenance and browser journeys
