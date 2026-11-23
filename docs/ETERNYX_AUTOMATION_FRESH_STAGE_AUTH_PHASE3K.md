# ETERNYX Automation Phase 3K — Fresh Staging Auth Sessions for Real Two-Account Acceptance

The original two-account staging acceptance added in PR #625 required two
pre-issued JWTs stored as GitHub Environment secrets. These could expire
before a user-approved test run, and refreshing them manually introduced
unnecessary credential handling.

This phase obtains **fresh access JWTs from Supabase Auth**, securely,
for two dedicated **isolated-staging-only test accounts** during each
manually approved two-owner acceptance run.

**No Supabase deployment, staging branch creation, account creation, real
remote login or hosted action was performed in this PR.**

## Ten improvements in one PR

1. Auth sign-ins use the project-scoped Supabase password grant endpoint
   \`https://<staging-ref>.supabase.co/auth/v1/token?grant_type=password\`.
2. Each run signs in two different **dedicated test users** exactly once
   each; the same fresh sessions are reused for the inspection and,
   when independently approved, temporary manual workflow acceptance.
3. Reject known production project \`wcncuarekaofmfurbtbh\` even when
   an attacker spoofs the separate declared production ref.
4. Run the protected Management API identity/organization/project
   status and core-function JWT inventory gate **before** the step
   receives test-account password secrets.
5. Require exact staging Auth issuer, audience \`authenticated\`, role
   \`authenticated\`, matching token subject and returned user ID,
   distinct account identities, recent token issuance, and a remaining
   lifetime sufficient for the acceptance test.
6. Require valid distinct email/password test-account configuration,
   12–256-character passwords and the **staging publishable key**, not
   a \`service_role\` or \`sb_secret_\` key.
7. Login attempts are **sequential, bounded and not retried**. They
   disallow HTTP redirects, cross-project hosts, cookies, forwarded
   credentials or arbitrary endpoints.
8. Auth JSON responses are streamed with a **64-KiB byte cap**,
   invalid Content-Length/UTF-8 rejection and cancellation; upstream
   errors and response bodies are never printed.
9. Passwords, access JWTs and returned refresh tokens are held only
   inside one runtime process. No token files, secret debug logs,
   browser storage, hardcoded JWT environment variables, token
   artifacts, or GitHub write permissions are introduced.
10. Existing two-user Auth verification, private workflow/history
    checks, one-workflow bounded execution, idempotent replay,
    cross-owner denial, and safe temporary-workflow cleanup remain
    mandatory. New local-HTTP and simulated full-execution tests prove
    the fresh-session path and guard against forged JWTs, expired
    tokens, duplicate users and malicious HTTP responses.

## Security and operational boundaries

The \`automation-staging\` GitHub Environment must have independently
configured required reviewers. The protected GitHub Action is
\`workflow_dispatch\` **only**, and executes exclusively on \`main\`.
The default \`INSPECT_ONLY\` mode performs no workflow data writes,
but **password sign-in still creates Auth sessions** on the staging
project. It is not a zero-mutation database operation in every
possible subsystem. Reviewers must accept this Auth activity.

For \`ONE_TEMPORARY_WORKFLOW\`, the separate exact write approval
\`I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN\` remains required. It creates
one temporary test workflow, runs/replays it, proves cross-owner
isolation, and deletes that workflow. Stored audit/run history may
remain; the receipt makes that explicit.

No signed webhook event, schedule tick, external provider request,
production data, or arbitrary workflow execution is allowed by this
test. A passing local fixture does not prove hosted password Auth
works. Hosted staging remains **not yet provisioned** in the
connected Supabase account and its actual migration state is
unverified.

## GitHub Environment setup

Keep existing \`automation-staging\` Environment variable
\`ETERNYX_AUTOMATION_STAGING_REF\`. Add the staging-only **public**
\`ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY\` variable if missing.

Replace the old long-lived test JWT secrets with these **four
staging-only Environment secrets**:

- \`ETERNYX_AUTOMATION_STAGING_OWNER_A_EMAIL\`
- \`ETERNYX_AUTOMATION_STAGING_OWNER_A_PASSWORD\`
- \`ETERNYX_AUTOMATION_STAGING_OWNER_B_EMAIL\`
- \`ETERNYX_AUTOMATION_STAGING_OWNER_B_PASSWORD\`

These must belong to **two separate dedicated nonanonymous
test accounts** with email/password sign-in enabled in an approved
staging project. The operator must create and verify these test
accounts separately; merging this PR creates none. Never use actual
production users or credentials. Prefer restrictive roles, unrelated
strong passwords and configured Auth rate limits.

The existing Environment secret
\`ETERNYX_AUTOMATION_STAGING_MANAGEMENT_TOKEN\` remains necessary for
the independent read-only project and function inventory proof.

Once the new workflow is merged and validated, remove the unused
\`ETERNYX_AUTOMATION_STAGING_OWNER_A_JWT\` and
\`ETERNYX_AUTOMATION_STAGING_OWNER_B_JWT\` secrets from the staging
Environment through GitHub Settings. Do not copy tokens into logs,
PRs, issues or chat.

## Execution

GitHub → Actions → **Automation isolated staging two-real-account HTTP
acceptance** → Run workflow on **main**.

\`INSPECT_ONLY\` is the default. It obtains two staging Auth sessions,
verifies both via \`GET /auth/v1/user\`, and checks private lists and
history. For the separately approved single temporary write, choose
\`ONE_TEMPORARY_WORKFLOW\` and approve
\`I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN\`.

No JWTs or passwords appear in the uploaded receipt; only sanitized
mode, two-session counts, verified isolation, cleanup status and
\`productionReady=false\` appear.

This is staging acceptance, not production release authorization. The
staging project, migrations, deployment and required reviewers must be
independently established and reviewed before any real run.
