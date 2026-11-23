# Cybersecurity Universe Wave 10 — Real staging acceptance and production release gate

Wave 10 introduces a read-only, strictly staging-scoped two-account Supabase acceptance probe and a protected release readiness page. **No real staging acceptance has yet been run in this PR; production release is blocked.**

## Improvements

1. Explicit staging-only opt-in and exact HTTPS Supabase hostname verification, with a different production project ref.
2. Authenticate two distinct real user tokens against staging Auth API.
3. Demand two attested, scoped staging engagement fixtures, with at least one non-excluded target per account.
4. Confirm own-row visibility and foreign-row invisibility across seven owner-scoped tables: pentest_engagements, pentest_evidence, pentest_audit_events, security_case_assets, security_case_findings, security_case_finding_evidence and security_case_finding_history.
5. Prove both owners can fetch their own authenticated private Storage objects while the other account cannot.
6. Allow only GET requests to the pinned staging origin with redirects disabled; the script performs no writes, SQL, migration application or account creation.
7. Emit small JSON check evidence with check names and counts, excluding JWTs, private object paths, owner IDs and contents.
8. Fail closed for missing, duplicated or incomplete check evidence, table/schema failures and Storage leaks.
9. Keep production permanently blocked pending authorized migration review, privileged policy/grant audit, actual staging write-denial and revocation tests, rollback and named sign-off.
10. Authenticated Hub page for local report review and regression tests for malicious or incomplete results.

## How to use

Read blockers with no credentials and no network requests:

    node scripts/security-case-staging-readonly.mjs --explain

In an isolated staging project, supply these environment variables through a secure ephemeral shell, **not** through Git or frontend code:

- ETERNYX_STAGING_ONLY=yes
- ETERNYX_STAGING_URL=https://STAGINGREF.supabase.co/
- ETERNYX_STAGING_PROJECT_REF=STAGINGREF
- ETERNYX_PRODUCTION_PROJECT_REF=DIFFERENTPRODUCTIONREF
- ETERNYX_STAGING_PUBLIC_KEY=STAGING_PUBLISHABLE_KEY
- ETERNYX_STAGING_JWT_A=ACCOUNT_A_ACCESS_TOKEN
- ETERNYX_STAGING_JWT_B=ACCOUNT_B_ACCESS_TOKEN

Check configuration without any network request:

    node scripts/security-case-staging-readonly.mjs --check-config

Only after an authorized operator has reviewed and deployed the indexed ledger proposal to **dedicated staging** and seeded both users' attested engagements, private Storage objects and at least one row in every required table:

    node scripts/security-case-staging-readonly.mjs --run > staging-security-readonly-report.json

The report can be imported locally at /cybersecurity/release-readiness. Its contents are unsigned and **can be fabricated**, so reviewers must retain independent run evidence. A passing read-only report does **not** prove safe writes, revocation, migration rollout or production approval.

## Outstanding security and release blockers

The source scripts/sql/staged-security-case-ledger.sql is **not deployed by this change**. Real staging deployment must be independently reviewed and approved. After that, complete full SQL catalog/grant/RLS review, two-account write/revoke acceptance, recovery and rollback validation and named security/operator authorization.

Run repository tests and build:

    node --test tests/security-staging-readiness.test.mjs
    npm test
    npm run build

Supabase reference: https://supabase.com/docs/guides/api/securing-your-api
