# ETERNYX Workspace Phase 16 — release readiness and isolated recovery drills

**Status: code in PR; no automatic production verification or deployment.**
Phase 16 is a deliberate shift toward testing Workspace readiness before collaboration features. It introduces **no new Supabase migrations** and no paid compute.

## Delivered

1. **Authenticated read-only readiness panel** in Digital Workspace. It checks fresh `auth.getUser()` before and after the run, and makes scoped `SELECT id` requests for owner-visible projects, tasks, checklist steps, saved items, import sessions and reconciliation receipt tables. A failed or missing API is reported as **blocked**, not disguised by an empty result.
2. **Storage metadata check without writes.** A read-only bucket listing tests whether the signed-in account's private Storage prefix is reachable. The UI explicitly warns that this does **not** prove the ability to download file bytes, authenticate an unrelated user's data, or validate all RLS policies.
3. **No false release certification.** Even if all API calls succeed, the strongest outcome is `review_required`: this is API *reachability*, not production migration status, account isolation, real backup restoration, or a signed security audit.
4. **Privacy-preserving evidence.** Download a metadata-only readiness report. It excludes account IDs, JWTs, URL, Storage object paths, raw backend error details, private task/note contents and files. A former user's report is hidden when the active account changes.
5. **Offline source-migration inventory CLI.** `node scripts/workspace-release-readiness.mjs --source-check` fails if any of the 10 required Workspace migration sources or any of the 10 PostgreSQL acceptance tests is missing from source or disconnected from the isolated workflow. It also verifies general CI invokes the inventory and the readiness panel is present in Digital Workspace.
6. **Machine-readable offline report.** `node scripts/workspace-release-readiness.mjs --report` writes a sanitized JSON result containing source checks and explicit `production_certified:false`. Source presence never verifies live database deployment.
7. **Real synthetic import lifecycle test in isolated PostgreSQL 17.** A disposable user creates a v3 restore session, retries its exact source SHA, commits and replays tasks with different checklist states, imports a note and HTTPS link, verifies no premature completion, claims/registers a private file metadata object, finalizes and cross-checks actual saved rows and server receipts.
8. **Interrupted project protection drill.** A second disposable partial import is put on hold, a human-style task edit is applied, new writes and unsafe release are rejected, and the edited data remains intact.
9. **Account isolation drill.** A second PostgreSQL fixture account cannot see the first user's sessions or file claims, inspect its import status, or release its protected project. The mock Storage object contains **metadata only**, not real bytes; the lifecycle test does not claim to check live Storage operations.
10. **Mandatory CI gates.** The offline inventory is included in the existing application CI; the new drill is included in the network-isolated PostgreSQL acceptance job. Node unit tests cover valid owner checks, fail-closed account mismatch, API errors, sanitized reports and disconnected migration/CI evidence.

## How to validate

Run from the repo root:

```bash
npm ci
npm test
node scripts/workspace-release-readiness.mjs --source-check
node scripts/workspace-release-readiness.mjs --report
npm run build
```

The isolated PostgreSQL job in `.github/workflows/workspace-revisions-postgres.yml` runs disposable PostgreSQL 17 with `--network none`, applies actual Workspace migration files in order, executes prior RLS and recovery acceptance suites, and finally runs `tests/sql/workspace-release-drill-db-smoke.sql`.

## What still requires REAL staging / operations acceptance

1. **Migration list:** Compare deployed Supabase migration history against all Workspace migration files, in a secured authorized staging project. Merging a PR does not deploy migrations. Check Auth/API schema exposure separately from RLS.
2. **Two authenticated accounts:** Verify project/task/notes/steps, import-session/receipt UUIDs and Storage object reads **cannot** cross tenants. The in-app panel probes only the current account and cannot certify this.
3. **Real binary backup drill:** With *synthetic but real* staging file uploads, create and export a v3 complete archive with a private file, check locally, delete or otherwise isolate only test records after explicit owner approval, restore into a separate private project, and confirm the original SHA-256 bytes match after upload/download. No test should modify production data.
4. **Interruption drill:** Simulate lost network replies at a batch boundary and during Storage upload, then retry the *identical original archive*. Check idempotent DB batch receipts, actual Storage file bytes, ownership and no duplicate projects.
5. **Held/recovery conflict drill:** Edit a partially imported task, inspect server drift, protect it, and create a separately restorable reviewed archive. Confirm the manually edited original remains intact.
6. **Actual browser acceptance:** Exercise authenticated desktop and mobile journeys; the repository's public preview browser check does **not** log in to Supabase. That UI smoke suite cannot substitute for real staging Auth and Storage testing.
7. **Storage permissions:** Audit private bucket RLS and object prefixes with a second account. Metadata-only fixture rows in isolated PostgreSQL do not simulate Supabase Storage API security or file bytes.
8. **Deployment sign-off:** Collect staging evidence from the migration history, user-isolation checks, backup round-trip, file hash matching, login/logout, browser errors and rollback plan. A human operator must decide readiness.

## Safety limitations

- All included automated integration SQL tests are offline and use fixed synthetic fixture accounts. They **do not** connect to production, send emails, create real users or run destructive database cleanup on remote projects.
- The authenticated readiness panel performs **no** mutation. A passing request may return zero rows, so it does not prove data exists or RLS is secure for another account.
- No fake scores, sample account secrets, service-role keys, background watchers or external paid AI APIs are introduced.
- Browser-only SHA-256 is equality/integrity checking, not cryptographic origin certification. Any file manifest and archive header may be authored by an untrusted party.
- Reliable server-side distributed transaction across Storage and PostgreSQL, restore of old activity/revision history, automatic conflict merge and fully verified production runbooks remain outside this phase.

## Release decision

**Do not describe ETERNYX Workspace as production-certified based on this PR.**
Once all isolated tests are green, the code may be merged. Staging/production release remains separately gated by verified migrations, real account isolation, real private Storage data checks and the operator's approval. The next Workspace phases can begin collaboration or cross-pillar integrations only after these operational dependencies are understood.
