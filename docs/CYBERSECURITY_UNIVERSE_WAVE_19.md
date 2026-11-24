# Cybersecurity Universe Wave 19 — live session and evidence lifecycle acceptance

Wave 18 PR #710 was merged; both final CI workflows passed. Live staging read-only inventory showed zero Auth users, zero engagements and zero private evidence objects. This is a blocker, not a live acceptance result.

## Run only on Eternyx Staging
Create two distinct disposable confirmed email/password users through the supported staging Auth dashboard. Do not share credentials in chat, source, logs or issues. Reuse all Wave 18 environment requirements from docs/CYBERSECURITY_UNIVERSE_WAVE_18.md and additionally set:
    ETERNYX_W19_ACK=I_APPROVE_DISPOSABLE_SESSION_AND_EVIDENCE_TESTS

In a private terminal with Node 22+, reviewed source and staging network access:
    node --test tests/security-wave19-session-evidence.test.mjs
    node scripts/security-wave19-session-evidence.mjs --check-config
    node scripts/security-wave19-session-evidence.mjs --run-wave18-and-19 > wave19-observation.json

The combined command performs actual Wave 18 and 19 acceptance in order. To run Wave 19 separately use --run. No service-role key or production access; only ordinary disposable users. Runs create retained synthetic database fixtures and registered evidence; an unregistered test object is deliberately removed. Partial fixtures can remain on failures. Do not repeatedly run without reviewing retained fixtures.

Wave 19 verifies:
- Two real password logins and distinct verified Auth users.
- Private object upload and metadata registration; public endpoint denial and cross-owner signing denial.
- Owner-issued 15-second signed link downloads exact bytes without credentials; tampering and expiry denial. Signed URLs are bearer capabilities, not identity-bound. They may remain valid after logout until expiry.
- Registered evidence overwrite and deletion denial followed by byte integrity verification. Positive owner deletion of an unregistered disposable object and subsequent absence.
- Local logout of the runner's disposable session only, explicit revoked-refresh rejection, other account refresh continuity, and observed residual access JWT behavior. A still-valid old JWT is a limitation, not immediate revocation success. Strict immediate session revocation requires separately reviewed backend authorization controls.
- Unsigned observation without tokens, user IDs, URLs, passwords or evidence contents; production is always blocked.

Do not create new Auth users by writing directly to auth.users. Use the dashboard or supported Auth API. No live login, signed URL or session test has been executed in this PR. Offline regressions are not real staging proof. Production promotion also requires restore acceptance, migration reconciliation, independent approval and operational readiness.

References:
https://supabase.com/docs/guides/auth/signout
https://supabase.com/docs/guides/storage/serving/downloads
