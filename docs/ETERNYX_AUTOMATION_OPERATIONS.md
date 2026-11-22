# ETERNYX Automation Phase 2K — Verified Operations Console

## Scope

This milestone adds three real operator tools to the existing authenticated Automation workspace: atomic bulk pause/resume, server-paginated factual run history, and non-executing cryptographic trigger diagnostics. No new external integration or automatic provider write is enabled.

## Improvements

1. Atomic **pause or resume for up to five saved workflows**, conditioned on exact owner, expected revision and current active state. If one target is stale or foreign, no workflow is changed.
2. Explicit owner confirmation before either bulk action. Resume may make previously enabled signed webhook or schedule triggers eligible again; bulk operations never create triggers, credentials, or delete workflows.
3. Durable UUID idempotency receipts: same request/key replays safely, different content with the same key fails. A real server-controlled 10 new bulk operations per rolling 24 hours applies independently from execution quotas.
4. Service-only RLS bulk audit records with opportunistic seven-day cleanup when the owner loads quota. No fictitious background cleanup is claimed.
5. Owner-only filtered run history for all workflows or one selected workflow, with channel filters manual, webhook or scheduled.
6. Stable Postgres **created timestamp + UUID keyset pagination**: the UI requests 15 real receipts per page; server supports up to 30. History includes stored counts, trigger source, revision and trace metadata, never raw workflow input/output text or credentials.
7. Local webhook credential check: decrypt actual owner-owned webhook secret with its server-only encryption key, sign a fresh fixed challenge, verify HMAC locally. No event is delivered, queued or executed.
8. Local scheduled input decrypt check with the existing server-only schedule encryption key; results are boolean-only and plaintext input is not returned to the browser.
9. Truthful diagnostics include actual enabled flags, last-use timestamps, scheduler global switch, next run, last status and current pending approval count. They do NOT assert external delivery, endpoint connectivity or worker liveness.
10. Node regressions and network-isolated PostgreSQL 17 acceptance test owner isolation, all-or-nothing batch behavior, replay, quota, mixed-owner rejection, private history, crypto checks and cleanup.

## Limitations

Credential self-tests do not prove external webhook delivery or that a worker is alive. A controlled real signed event or worker tick is required to verify end-to-end connectivity and may trigger real authorized execution. Pausing cannot reverse already completed runs. Resuming workflows may allow already-enabled separate triggers to execute.

These request quotas are not monetary spending caps. Existing Supabase hosting usage may incur charges. No paid GPU/API or new automatic external actions are added.

## Deploy separately after review

1. Confirm GitGuardian, Node tests, application build, release provenance, PostgreSQL 17 acceptance, and desktop/mobile browser journeys are all green.
2. Apply migration supabase/migrations/20261123070000_automation_operations.sql after Phase 2J.
3. Redeploy the authenticated automation-control Edge Function and publish the updated AutomationOperationsPanel and AutomationCloudPanel frontend. No new secrets needed.
4. Staging-test bulk atomicity with two owners, stale workflow revision, duplicate action UUID, 10/day quota, and owner-controlled pause/resume.
5. Run existing manual and signed webhook/scheduled workflows in a controlled staging account. Check that real paginated history matches persisted completed runs, including equal timestamp tie ordering.
6. Check credential diagnostics with valid and invalid keys and verify no run is recorded, no external webhook sent and no decrypted text returned.
7. Observe existing hosting resource consumption. This PR does not deploy backend changes or run third-party actions.

Use the repository's automation-operations.test.mjs utility test, normal npm test/build and the dedicated Automation Operations SQL Security Acceptance workflow for verification.
