# Cybersecurity Universe — Wave 13: Real-account HTTP authorization and engagement revocation

Wave 13 provides a **GET-only two-phase real-JWT Supabase staging acceptance**, with independently operator-driven engagement attestation revocation between observations. The implementation can observe a live staging project, but **no live staging run or production deployment occurs in this PR**.

## Twelve improvements

1. Explicit staging-only project/ref separation and extra GET-only operator acknowledgement.
2. Authenticate two different real JWTs against `/auth/v1/user` before each phase.
3. Verify a specifically selected owned engagement for each account, rather than accepting an arbitrary first row.
4. Require both engagements attested at baseline; account B must remain attested in the revoked phase.
5. Require account A to transition to revoked/draft state through a separate authorized operator action.
6. Probe owned and opposite-owner access across seven private engagement, evidence, audit and case-ledger tables.
7. Check that anonymous API access never exposes any of the seven selected private rows.
8. Verify each owner can still fetch their own historical authenticated private Storage object while the opposite account cannot.
9. Demand a fresh owner-scoped audit event after baseline whose changed-fields record contains `authorization_attested`.
10. Bind both phases to the same users, engagement IDs, project and run secret using HMAC-SHA256; no token, user UUID or file path appears in exported reports.
11. Bounded 24-hour baseline age, strict report schema, fixed check ordering and fail-closed evidence validation.
12. Local Security Release Readiness page import, negative regression tests, no-store HTTP caching and no server mutations.

## Live staging procedure

**Operator prerequisites:** independent dedicated staging Supabase project, known distinct production project ref, verified Wave 4 indexed ledger migrations deployed **only to staging**, two real staging user sessions and one complete owner-scoped engagement/asset/finding/evidence/history/audit fixture per user. Verify all seven tables are available through the staging Data API. Do not use production JWTs or personal evidence.

Provide these environment variables through an ephemeral secure runner (not GitHub logs):

- `ETERNYX_STAGING_ONLY=yes`
- `ETERNYX_STAGING_URL=https://STAGINGREF.supabase.co/`
- `ETERNYX_STAGING_PROJECT_REF=STAGINGREF`
- `ETERNYX_PRODUCTION_PROJECT_REF=DIFFERENT_PRODUCTION_REF`
- `ETERNYX_STAGING_PUBLIC_KEY=STAGING_PUBLISHABLE_KEY`
- `ETERNYX_STAGING_JWT_A=REAL_USER_A_ACCESS_TOKEN`
- `ETERNYX_STAGING_JWT_B=REAL_USER_B_ACCESS_TOKEN`
- `ETERNYX_STAGING_HTTP_ENGAGEMENT_A=ATTESTED_TEST_ENGAGEMENT_A_UUID`
- `ETERNYX_STAGING_HTTP_ENGAGEMENT_B=ATTESTED_TEST_ENGAGEMENT_B_UUID`
- `ETERNYX_STAGING_HTTP_RUN_SECRET=RANDOM_32_PLUS_CHARACTER_EPHEMERAL_SECRET`
- `ETERNYX_STAGING_HTTP_ACK=I_APPROVE_GET_ONLY_STAGING`

Review the steps and check configuration with **no network**:

    node scripts/security-staging-http-revocation.mjs --explain
    node scripts/security-staging-http-revocation.mjs --check-config

Run baseline while A and B are both attested. This performs GETs only:

    node scripts/security-staging-http-revocation.mjs --baseline > wave13-baseline.json

Now, **separately and explicitly**, an authorized staging operator uses account A's legitimate engagement edit workflow to set **only the disposable staging engagement A** to `draft` (or `cancelled`) with `authorization_attested=false`. The backend should record the update in `pentest_audit_events`, with the `authorization_attested` field among the changed fields. Do not modify account B's engagement. The runner never performs this revocation itself.

Preserve the exact same two access tokens and run secret for phase two; access tokens must not have expired. Set `ETERNYX_STAGING_HTTP_BASELINE_FILE` to the secure local path of the baseline JSON, then run:

    node scripts/security-staging-http-revocation.mjs --revoked > wave13-revoked.json

The revoked phase validates baseline binding, a fresh post-baseline audit event, account B continuity, owner/cross-account/anonymous RLS and private Storage. Export contains HMAC identifiers only and no raw tokens, IDs, private paths or evidence bytes. Baseline files are unsigned, are not cryptographic execution attestations, and must be securely stored.

Import the second-phase report locally in the existing authenticated `/cybersecurity/release-readiness` page. The page shows **operator-reported, unsigned** status and always keeps production blocked.

## Important trust boundaries

- This tests **engagement attestation revocation**, not JWT/session invalidation or deletion of an account. A's JWT remains valid in both phases.
- Under the current owner-scoped policy, the owner still sees their historical evidence and may download private objects even after engagement attestation is revoked; we explicitly confirm this behavior rather than claiming that reading was revoked.
- The Wave 12 PostgreSQL test separately proves case-ledger writes are blocked after revocation. **This Wave 13 HTTP checker never attempts INSERT, PATCH, POST or DELETE**, so it does not establish HTTP write denial.
- The `Prefer: tx=rollback` PostgREST preference is not assumed or exercised. It may require server configuration and is **not enabled by default**; it must not be relied on to protect staging from accidental writes without independent verification.
- GET-only reports do not establish production readiness, migration history, restored backup success, Realtime permissions or independently trusted custody/signatures.
- The entire flow requires two real isolated staging accounts, genuine database fixtures and an authorized operator. Those external prerequisites are not completed automatically.

## Local verification

    node --test tests/security-staging-http-revocation.test.mjs
    npm test
    npm run build

References: https://supabase.com/docs/guides/api/securing-your-api and https://docs.postgrest.org/en/v16/references/api/preferences.html
