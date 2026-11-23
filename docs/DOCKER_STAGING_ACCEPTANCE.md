# Docker: full migration readiness and manually approved real staging acceptance

This PR follows merged #519. It connects two existing, independently tested live read-only tools to a single **operator-approved staging acceptance** and adds a separate automatic *offline-only* PostgreSQL migration-chain gate. It does not deploy or update Supabase or exercise an actual Docker Engine. Both server-side and local agent execution remain disabled.

## What this milestone checks

1. GitHub PR CI applies the **seven signed agent/dispatch/containment and three release-review migrations** in sequence to the same ephemeral PostgreSQL 17 database with `--network none`.
2. It tests real two-owner RLS, nonce replay resistance, receipt lifecycle, incident hold, release-review transitions, independent reviewer consent, SHA-256 audit history and complete owner-only audit export in one migration-upgrade journey.
3. A manual-only workflow exists at `.github/workflows/docker-staging-readonly-manual.yml`. It does NOT run from a PR or push and is restricted to `main` plus two explicit boolean confirmations.
4. The `docker-staging` GitHub Environment must be configured by a human, ideally with **required reviewers** and a branch restriction to `main`. Never place the staging secrets in repository-wide unprotected variables.
5. The manual workflow takes a separately verified staging ref, **distinct production deny ref**, and full Git commit SHA. These must match environment pins and the actual checked-out commit.
6. The release expectations manifest has four exact active Docker Edge functions with independently pinned expected versions, JWT policies and bundle digests. The digest of the manifest must be retained separately.
7. A **read-only** Management API call (`edge_functions_read` permission) verifies deployed function versions, `verify_jwt` flags, and reported pinned bundle SHA-256 metadata first.
8. ONLY if deployment metadata matches do two pre-seeded staging user JWTs make eight fixed HTTPS POST `{"action":"list"}` calls to Docker Control/Enrollment, verifying unauthenticated rejection and account-owned workspace isolation.
9. Both network clients refuse redirects, unexpected origins, oversized data and exposed execution flags. All fields in the resulting report are sanitized; JWTs, management tokens and API keys are never included.
10. A domain-separated SHA-256 is computed over the combined, sanitized staging observations and stored as a short-retention GitHub artifact. A failure produces a nonzero exit and no falsely green report.
11. Even a passing result explicitly leaves real host identity, independent remote code-byte attestation, complete RLS testing, operational release, Docker execution and production deployment **unverified/not authorized**.

## Required setup before manually running

Prepare a **separately approved, isolated** Supabase staging project, deploy the intended schema and all four Docker Edge Functions under a distinct change-controlled process, and pre-seed two separate synthetic test users with one owned Docker workspace each. Do **not** run this acceptance until staging deployment is authorized, complete, and operationally separate from production.

In GitHub Settings → Environments, create `docker-staging` with required reviewers and restrictions to the main branch. Configure these *environment variables*:

- `ETERNYX_DOCKER_STAGING_REF`, `ETERNYX_DOCKER_PRODUCTION_REF`: independently verified different project IDs
- `ETERNYX_DOCKER_STAGING_URL`: `https://<staging-ref>.supabase.co`
- `ETERNYX_DOCKER_STAGING_PINNED_HOST`, `ETERNYX_DOCKER_PRODUCTION_HOST`: matching official staging/production hostnames
- `ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE`, `ETERNYX_DOCKER_STAGING_OWNER_B_WORKSPACE`: distinct owned test-workspace UUIDs
- `ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256`: separately retained SHA-256 from `docker-staging-management-inventory.mjs pin`

Configure these *protected environment secrets* (never paste into chat, issues or committed files):

- `ETERNYX_DOCKER_STAGING_MANIFEST_B64`: standard Base64 of a compact JSON release expectations manifest (the expected version/bundle digests are PINNED independently)
- `ETERNYX_DOCKER_MANAGEMENT_READ_TOKEN`: least-privileged Management API fine-grained `edge_functions_read` token scoped to staging
- `ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY`: staging publishable API key, not service-role or secret key
- `ETERNYX_DOCKER_STAGING_OWNER_A_JWT`, `ETERNYX_DOCKER_STAGING_OWNER_B_JWT`: short-lived access JWTs of distinct synthetic staging user accounts

Select **Actions → Docker isolated staging acceptance — MANUAL READ ONLY → Run workflow** on `main`. Enter exactly the pinned project refs and the Git SHA selected for this run. Acknowledge both confirmations. The first step validates *all* pins without network; only then may the two read-only remote checks run.

An approved run makes **one** staging Management API GET and, after metadata passes, **eight** staging-only account-list POSTs. It never sends a mutation action, makes no request to production, deploys no Edge Function, modifies no database row and never invokes Docker. The evidence artifact is retained seven days and excludes credentials.

## Remaining genuine release blockers

- The user must actually deploy the code and run a real staging acceptance under an explicit approval. Merely merging this workflow does not accomplish those steps.
- The staging tests do not independently verify bytes of the remote Edge Function bundles, all SQL privileges/RLS, actual server flags or host OS networking.
- A separate operator-owned, physically isolated Docker host must pass manual containment, crash recovery, socket isolation and permit/revocation tests before actual lab execution can be considered.
- All original human approvals and independently pinned signing keys remain necessary. The staging report never sets `productionDeploymentAuthorized` or `stagingDockerExecutionAuthorized` to true.

CI and runbooks are not equivalent to production readiness. Keep `DOCKER_REMOTE_LAB_ENABLED` and `ETERNYX_REMOTE_LAB_ENABLED` unset until full authorized acceptance.
