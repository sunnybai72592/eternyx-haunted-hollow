# ETERNYX Docker staging — fresh test-account sessions and live owner isolation

This milestone builds upon merged #525. The earlier read-only Docker staging workflow required pre-supplied JWTs. Those expire and can be difficult to maintain safely in protected CI environments. This **separate manual workflow** can now sign in two pre-existing synthetic staging accounts to generate fresh short-lived tokens *after* the deployed function metadata is checked.

## Ten practical improvements

1. Preserve the exact release commit, staging/production project deny pins, independently pinned four-function manifest and Management API `verify_jwt`/version/bundle metadata gates from #525.
2. Split validation of staging host, publishable API key and fixture ownership UUIDs from JWT validation; existing manual JWT-only checks continue working.
3. Add a `freshSessionProvider` to the staging orchestrator, invoked **only after** the Management API reports all four functions match independently pinned release expectations.
4. Use Supabase Auth `signInWithPassword` for two *existing* test-only staging user accounts. No sign-ups, password resets, user creation or storage/admin operations.
5. Restrict the Auth client fetch transport to HTTPS `POST /auth/v1/token?grant_type=password` on the exact pinned staging project hostname. Redirects, different paths, methods and hosts are blocked.
6. Create Supabase JS clients with `persistSession:false`, `autoRefreshToken:false`, `detectSessionInUrl:false`. Tokens and refresh tokens are never written into GitHub artifacts or console output.
7. Require each returned user UUID, JWT `sub`, issuer, `role=authenticated`, audience, issuance and expiry to match the independently pinned staging account. Accounts must be different.
8. Pass the two fresh access tokens only to the existing eight `action:list` Docker Control/Enrollment HTTP requests, which test anonymous rejection and exact two-owner workspace isolation.
9. Add a separately approved manual-only `main` GitHub Action under the protected `docker-staging` environment, requiring **explicit authorization for staging Auth session writes** and two independently provisioned test accounts.
10. Produce a bounded, sanitized report with `stagingAuthSessionsCreated:true`, `mutationRequestsSent:true`, `stagingDataMutationRequestsSent:false`, `productionDeploymentAuthorized:false`, and `stagingDockerExecutionAuthorized:false`; add adversarial offline regression tests.

## Why this is not a purely read-only run

Supabase password sign-in **creates authentication sessions** and is a state-changing operation in the Auth system. Even though the eight Docker endpoints are `action:list` only, this new workflow correctly records Auth writes. It is distinct from the existing `Docker isolated staging acceptance — MANUAL READ ONLY` workflow and requires separate operator confirmation. The test accounts and their workspaces must be created in isolated staging through a previously approved process; this workflow never provisions them.

## Configuration — only after authorized staging deployment

Under GitHub Settings → Environments, create or retain the **docker-staging** protected environment. Require trusted manual reviewers and restrict to `main`. The previous staging URL, project ref, production deny ref, release SHA and SHA-256 manifest pin remain required.

Add protected environment variables:

- `ETERNYX_DOCKER_STAGING_OWNER_A_USER_ID` and `ETERNYX_DOCKER_STAGING_OWNER_B_USER_ID`: distinct pre-existing Auth user UUIDs
- `ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE` and `_OWNER_B_WORKSPACE`: the owned workspace UUIDs already required by #525

Add protected environment secrets:

- `ETERNYX_DOCKER_STAGING_OWNER_A_EMAIL`, `_OWNER_A_PASSWORD`
- `ETERNYX_DOCKER_STAGING_OWNER_B_EMAIL`, `_OWNER_B_PASSWORD`

Keep all release, project, Management API, publishable key, and manifest pins from #525. **Do not put JWTs, passwords, emails or API keys into workflow inputs, repository files or PR comments.** Do not reuse production accounts. If account MFA or password login policy requires interactive action, the workflow must fail; it must not weaken policy to bypass it.

## Manual execution

After an authorized staging deployment is complete, run **Actions → Docker staging fresh-session acceptance — MANUAL AUTH WRITES → Run workflow**, choosing `main`. Confirm both booleans and enter the independently pinned staging project ref, different production deny ref, and exact current Git commit SHA. The workflow environment must approve execution before secrets become available.

The preflight validates manifest/project/account formats without remote requests. The live step then performs exactly one Management API GET, two staging password grant POSTs (these write Auth sessions) and eight Docker `action:list` POSTs. It fails closed on mismatched deployments, wrong user/issuer, expired tokens, leaked owner records, disabled security checks or any transport error.

The sanitized evidence artifact is kept for three days; it contains no JWTs, refresh tokens, passwords or private keys. If you need a long-term record, independently archive and sign its hash under your release review process.

## Remaining blockers

Passing a real staging run would prove these bounded checks were observed at the specified time. It **does not** establish independent deployed-code byte parity, complete database privilege/RLS security, actual Docker host identity, physical network isolation, incident response or production authorization. The separate offline release signature verification and owner-review controls remain mandatory. The host/agent execution flags must stay disabled until separately authorized operator acceptance.

This pull request does **not** run the manual workflow, create test accounts, deploy Edge functions, apply migrations, inspect production, or run an actual Docker host.