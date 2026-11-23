# ETERNYX Automation Phase 2X — Isolated Staging Execution Acceptance

## Objective

A green source build is not proof that the Automation API is deployed,
database migrations are applied, accounts are isolated, or manual executions
persist correctly. PR #508 introduced **read-only inventory** checks. This PR
adds an **operator-invoked and tightly fenced staging acceptance tool** that
can examine two existing test users, and — only with a *second explicit
execution consent* — perform a single deterministic manual run.

**This PR does not deploy anything, configure keys, alter production,
enable schedules/webhooks/agents or invoke a live staging endpoint on merge.**

## Ten improvements in one PR

1. **Exact project boundary:** constructs a fixed HTTPS endpoint from a
   twenty-letter Supabase staging ref and requires a different, explicitly
   supplied production ref.
2. **No privileged API credentials:** requires a publishable key and two
   distinct signed-in user JWTs, not a service-role or secret API key.
3. **Identity confirmation first:** checks both accounts through
   /auth/v1/user, rejects anonymous accounts and repeated identity.
4. **Read-only default:** --inspect only retrieves each owner's current
   workflow list and bounded completed-run history.
5. **Strict intent gate:** --execute requires --confirm-isolated-staging
   and the exact matching environment consent string; no background or CI
   execution is enabled.
6. **One disposable workflow:** creates a uniquely named, deterministic
   trim/dedupe/sort workflow under owner A; verifies it appears only for A.
7. **One real manual run:** requires measured expected output and a real
   persisted history receipt. It does not synthesize counts or execution.
8. **Idempotency and cross-account checks:** replays the exact same
   request UUID and verifies it is not duplicated; owner B cannot execute
   A's workflow and must receive 404.
9. **Privacy and cleanup:** rejects unexpected raw input/output fields in
   durable run history; deletes only the just-created workflow even when
   a later validation fails, and verifies the deletion.
10. **Safe results and regression tests:** reports only allowlisted,
    non-sensitive proof flags; network errors are sanitized. Mocked
    integration tests cover successful staging, read-only mode, transport
    failures, privacy violations, owner leakage, safeguards and cleanup.

## Prerequisites

This is **not currently an instruction to run against the connected
production project**. Earlier inspection did not find
automation-control, automation-webhook or automation-scheduler-worker in
the connected deployment, and the migration listing timed out. First,
verify a separately provisioned staging project and explicitly approve
any needed function/migration deployments through the normal rollout
process. The source test must not be used to waive these prerequisites.

The operator must establish a dedicated *non-production* Supabase project
with its own two throwaway signed-in, nonanonymous users and published
Edge Function/database migrations, and explicitly verify that the chosen
project cannot contain real customer data.

### Read-only staging inspection

Set these variables privately, outside the repository or CI logs:

- ETERNYX_STAGING_PROJECT_REF = 20-character staging project ref
- ETERNYX_PRODUCTION_PROJECT_REF = distinct known production project ref
- ETERNYX_STAGING_ENVIRONMENT_CLASS = isolated-test-project
- ETERNYX_STAGING_PUBLISHABLE_KEY = staging sb_publishable_ key
- ETERNYX_STAGING_OWNER_A_JWT = short-lived test user A access JWT
- ETERNYX_STAGING_OWNER_B_JWT = short-lived test user B access JWT

Then run:

\`\`\`sh
node scripts/automation-staging-acceptance.mjs --inspect
\`\`\`

This makes authenticated GETs to the staging Auth user endpoint and
read-only POST requests carrying *only* the existing \`list\` and
\`history\` actions. There is no anonymous public probe, arbitrary host,
provider scan, webhook dispatch or worker tick.

### One explicitly authorized staging test run

With exactly the same isolated project and users, manually set the
additional private variable:

\`\`\`sh
export ETERNYX_STAGING_EXECUTION_CONSENT=I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN
node scripts/automation-staging-acceptance.mjs --execute --confirm-isolated-staging
unset ETERNYX_STAGING_EXECUTION_CONSENT
\`\`\`

The script creates one ephemeral workflow, performs exactly one genuine
manual run, retries the same request key once for idempotency, verifies
foreign-owner denial, checks private history and deletes the workflow.
*One genuine run still consumes hosting resources and a run quota*. A
failure may leave a run receipt (expected append-only history) or, if
cleanup itself fails, a test workflow; inspect staging afterward.

Use only disposable test accounts with available workflow/run quotas and
no unrelated concurrent activity. Never reuse production JWTs or keys,
or enable this command in routine CI. The consent flags are operator
assertions, not cryptographic proof the project is staging.

## Required merge/rollout gates

1. Verify \`npm test\`, build, browser smoke and GitGuardian checks.
2. Confirm offline mocked tests never make a real network request.
3. Review the fixed endpoint, no service-role key, exact request parser,
   dual-user scope, no trigger/schedule commands and bounded output.
4. Confirm a separate staging project's backend migrations and function
   deployment before opting into any hosted operation.
5. Verify account isolation and actual persisted receipts with two genuine
   test users. If a 503 or missing database migration occurs, **stop**.
6. Record the staging result and any cleanup problem without copying JWTs,
   PII, raw text output, customer data or service credentials into issues.
7. Verify hosting spend, browser behavior, DB RLS, webhook/scheduler
   configuration and operational logs separately before considering
   Automation v1 release.
8. Make a separate explicit production change approval and go/no-go
   decision. **This PR alone is not a deployment or release permit.**

No external AI service, paid GPU, production mutation, scheduling,
webhook action or autonomous workflow is introduced.
