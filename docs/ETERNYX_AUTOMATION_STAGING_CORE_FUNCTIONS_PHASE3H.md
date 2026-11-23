# ETERNYX Automation Phase 3H — Staging-only release for the three missing Edge Functions

**Status:** guarded workflow implementation and offline tests only. **Nothing was deployed
by this PR.** The connected Supabase account currently has one project,
\`wcncuarekaofmfurbtbh\` (production). Its migration-list API still times
out, it has no separate staging project/branch, and only the three
\`automation-schedule-control\`, \`automation-github-public\`, and
\`automation-github-issues\` functions are currently in the hosted
Automation inventory. This phase does **not** modify that project.

## Release goal

A guarded, manual release path for exactly these missing ETERNYX functions:

| Function | Auth expectation | Exposure / control |
|---|---|---|
| \`automation-control\` | \`verify_jwt=true\` | User-authenticated management RPC |
| \`automation-webhook\` | \`verify_jwt=false\` | Public endpoint protected by application-level signed webhook authorization |
| \`automation-scheduler-worker\` | \`verify_jwt=false\` | Private worker protected by the scheduler secret header |

Publishing an endpoint is **not** the same as activating triggers,
registering cron, or verifying a real user operation. Do not enable any
schedule or webhook just because a staging function deploy succeeded.

## 12 substantive safeguards and checks

1. GitHub Actions \`workflow_dispatch\` **only**, with no PR, push, cron
   or automatic-hosted deployment route.
2. Require **two explicit** operator acknowledgments: isolated staging
   function release approval **and** a completed schema/secrets/rollback review.
3. Restrict execution to the **main branch**, protected
   \`automation-staging\` GitHub Environment and a separate stage ref.
   Configure GitHub required environment reviewers yourself; the workflow
   cannot create or guarantee those settings.
4. Hard-deny known production project \`wcncuarekaofmfurbtbh\`,
   nonmatching direct DB hostname, malicious host/IP/URL overrides and
   unexpected pooler account references.
5. Verify all six Automation source handlers and config file JWT
   declarations, then SHA-256 fingerprint the three deployable handlers.
6. Run Phase 3F's independently verified, TLS \`verify-full\`, **read-only**
   database probe on the exact staging target; require real migration
   history relation and all four critical Automation table names.
7. Run a second **SELECT-only** schema-catalog query. Require the seven
   Automation control/webhook/scheduler RPCs and row-level security
   enabled on all four tenant-owned workflow/run/trigger/schedule tables.
8. Reject malformed database evidence, missing schema, disabled RLS,
   missing RPCs, fake success, and any unverified staging ref.
9. Use the Supabase **Management GET** endpoint to independently verify
   the stage project ID/ref, \`ACTIVE_HEALTHY\` status and expected ETERNYX
   organization **after** the database checks and before deployment.
10. Use explicit CLI v3 \`--remote=<stage-ref>\` and \`--yes\` to deploy
    **only** the three named functions, with explicit
    \`--no-verify-jwt\` only on webhook/worker. Do not link, prune,
    migrate, create secrets or deploy all functions.
11. Verify the three deployed function records using a fresh read-only
    Management API inventory and require \`ACTIVE\`, positive deployment
    version and the expected JWT policy for each.
12. Publish only a sanitized staging-only version receipt. Flag
    \`liveBusinessFlowsVerified=false\`, \`webhooksActivated=false\`,
    \`scheduleActivated=false\`, and \`productionDeployment=false\`.
    The standalone offline PG17 suite additionally proves a disabled
    tenant-table RLS bit blocks the catalog check.

## One-time requirements before attempting a hosted staging release

**An independently approved, separate staging project does not exist in
the connected account yet.** It must first be separately created or
connected with the owner's **explicit hosting-cost approval**.
Nothing in this PR creates a new Supabase project or incurs an automatic
hosted charge. The intended project must belong to the ETERNYX
organization and have its own data, database password and secrets.

Then, in GitHub Settings → Environments, configure
\`automation-staging\` with **required reviewers**, appropriate branch
protection and dedicated environment variables:

- \`ETERNYX_AUTOMATION_STAGING_REF\`: separate 20-letter staging ref,
  different from the production ref
- \`ETERNYX_AUTOMATION_STAGING_PGHOST\`: staged direct DB hostname or
  verified Supabase session pooler hostname
- \`ETERNYX_AUTOMATION_STAGING_PGUSER\`: \`postgres\` for direct,
  \`postgres.<staging-ref>\` for session pooler

Configure **only staging** Environment secrets:

- \`ETERNYX_AUTOMATION_STAGING_PGPASSWORD\`: staging PostgreSQL secret
- \`ETERNYX_AUTOMATION_STAGING_CA_PEM\`: correct, verified CA PEM for
  \`sslmode=verify-full\`
- \`ETERNYX_AUTOMATION_STAGING_MANAGEMENT_TOKEN\`: authorized Management
  API token with access to the *staging* Supabase project

Do **not** paste secrets into chat, a GitHub issue, comments, commits,
pull requests, logs or artifact descriptions. Tokens may have broader
account permissions than an individual project; use a carefully scoped,
reviewed operator identity and avoid granting access to production.
Review staged Edge Function **runtime** secrets out of band:
\`AUTOMATION_WEBHOOK_ENCRYPTION_KEY\`,
\`AUTOMATION_SCHEDULE_ENCRYPTION_KEY\`,
\`AUTOMATION_APPROVAL_ENCRYPTION_KEY\`,
\`AUTOMATION_PREVIEW_AUDIT_KEY\`, and
\`AUTOMATION_SCHEDULER_WORKER_KEY\` as required by their implementations.
The workflow intentionally cannot read or verify secret values.

Confirm that the 11 historical duplicate migration versions are fully
understood against independent staging schema/deployment history. The
read-only migration journal identifies versions **but cannot establish
which competing SQL file actually ran**. Manually attest that this has
been reviewed before proceeding.

## Controlled release steps (AFTER prerequisites exist)

GitHub → Actions → **Automation three-core-function isolated staging
release** → Run workflow on **main**. Select both positive approvals.
The protected Environment reviewer then validates the independent
staging target and authorizes access to Environment secrets.

The workflow checks sources → read-only migration history → read-only
RPC/RLS catalog → Management API project identity → exactly three
targeted function deployments → fresh deployed version/JWT inventory.

No step repairs migrations, applies SQL, creates secrets, triggers
webhooks, registers a schedule, activates workers, runs customer
records or deploys to production. The sequence stops on failure.
A partial failed staging deploy may require a reviewed staging-only
rollback; **do not** automatically retry or promote.

## What passing this phase does not prove

A successful function-deployment receipt does not prove actual staged
user authentication, tenant-bound RPC behavior, webhook signatures or
worker key correctness, decryption of pre-existing data, cron scheduling,
network callbacks, secrets availability, cross-tenant isolation, billing,
production safety or correct provenance of historical collisions.
Those require the existing two-account staging HTTP acceptance and
reviewed incident/rollback plan before any production release.

The current known blocker is still **a separate authorized staging
project and reliable, independently verified migration history**.

CLI v3 \`--remote\`, \`--yes\` and function deployment reference:
https://supabase.com/docs/guides/local-development/cli/migrating-to-v3
https://supabase.com/docs/guides/functions/examples/github-actions
