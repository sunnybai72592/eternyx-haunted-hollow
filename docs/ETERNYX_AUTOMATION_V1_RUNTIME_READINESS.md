# ETERNYX Automation v1 — Runtime Inventory and Release Gates

## Scope

This is a **read-only, explicitly requested preflight**, not a deployer,
migration runner, worker launcher, cron installer, webhook client, secret
reader, or production safety certification.

The core Automation source contains manual signed-in workflows, signed public
webhooks, a server-to-server scheduler worker, signed-in schedule management
and two distinct GitHub provider surfaces.

The linked Supabase project's latest management inventory observed that
\`automation-control\`, \`automation-webhook\` and
\`automation-scheduler-worker\` were **not present**. This may change later;
always collect fresh evidence for the exact target project. Some other
Automation functions are deployed, but that does not mean these core
functions are available. Merged GitHub PRs do **not** apply SQL migrations
or publish updated Edge Functions.

## New safeguards

1. **Explicit JWT policy** for \`automation-control\`, in addition to
   existing dedicated policies for signed webhooks and internal worker.
2. **Source inventory gate** checks the handler files, explicit JWT
   config and at least 20 real Automation migration source files, including
   mandatory foundation and later package/review migrations.
3. **Optional read-only live inventory** queries ONLY the documented
   management API GET /v1/projects/{ref}/functions on operator request.
   No API token is logged, persisted or placed in the frontend.
4. **Actual availability and auth mismatch detection** flags each absent,
   inactive, unversioned or mismatched \`verify_jwt\` deployed function.
5. **Database evidence separation** requires explicit recent, project-bound
   operator-provided applied migration-version records. Local SQL files are
   never described as applied to production.
6. **Bounded, source-identifiable reports** list missing function slugs,
   missing migrations and reason codes, while excluding arbitrary response
   data or secrets.
7. **Fail-closed diagnostics** distinguish source-only, operator snapshot
   and authenticated management-API evidence.
8. **CI & tests** enforce source/config consistency without network,
   database writes or any requirement to configure GitHub production secrets.
9. **Non-deployment guarantee:** No code in this PR invokes workflows,
   schedules, webhooks, provider calls, SQL mutations or Supabase deployments.
10. **Truthful release gate:** Even with all inventory checks green,
    \`productionReady\` and \`liveExecutionVerified\` remain false until
    independent, authenticated staging and security checks pass.

## Commands

### CI / local static source check (no credentials)

\`\`\`sh
node scripts/automation-runtime-readiness.mjs --source-check
npm test
npm run build
\`\`\`

This only validates checked-in files and intended gateway policy.
It cannot check whether the hosted deployment works.

### Inspect a saved function inventory (offline)

Export the real JSON array returned from the Supabase Functions management
inventory or another trusted operator-controlled listing to a **private local
file**. Do NOT commit it.

\`\`\`sh
node scripts/automation-runtime-readiness.mjs \
  --snapshot /private/path/functions.json \
  --project-ref YOUR_20_CHARACTER_PROJECT_REF --json
\`\`\`

### Optional live Supabase Management API inspection

The management API uses a personal/fine-grained **read-only** access token
with \`edge_functions:read\`; never use a service-role key in browser code.

\`\`\`sh
export SUPABASE_PROJECT_REF=YOUR_20_CHARACTER_PROJECT_REF
export SUPABASE_ACCESS_TOKEN=YOUR_PRIVATE_READ_TOKEN
node scripts/automation-runtime-readiness.mjs --live --json
unset SUPABASE_ACCESS_TOKEN
\`\`\`

The script makes one GET against the fixed Supabase API host. This call
does not inspect the deployed function body, prove backend consistency,
authenticate an ETERNYX user, or exercise a workflow. A 401/403/timeout
returns a blocked/unknown diagnostic, **not** a claim that a function is
missing.

### Add recent operator migration evidence

The database migration list must come from a fresh **trusted read-only**
check of the exact project's migration history (e.g. \`supabase migration
list\`, after verifying the command in the installed CLI's \`--help\`).
If the connected database times out, do **not** fabricate a successful
migration list or use source filenames as proof.

An operator can normalize the verified applied version entries into a private
file (never commit the file or any credentials):

\`\`\`json
{
  "projectRef": "YOUR_20_CHARACTER_PROJECT_REF",
  "source": "operator_supplied_migration_list",
  "capturedAt": "2026-11-23T15:00:00Z",
  "appliedVersions": ["20261122220000", "20261122230000"]
}
\`\`\`

These two versions are an **incomplete illustrative excerpt**; the checker
compares all current checked-in Automation migrations and will report the
remaining versions as not evidenced.

\`\`\`sh
node scripts/automation-runtime-readiness.mjs --live \
  --migration-receipt /private/path/automation-migrations.json --json
\`\`\`

A fresh *operator-provided* receipt is not independently authenticated:
the tool deliberately sets \`migrationReceiptIsIndependentProof=false\`.
Do not use this as a substitute for checking real database connectivity.

## Controlled remediation checklist (separate approval required)

1. Identify the correct environment, project reference, owner, rollback
   strategy and service costs. Obtain explicit production deployment
   authorization **before** any mutation.
2. Establish a working **read-only** database/migration connection and
   reconcile migrations in chronological order. If it times out, stop.
3. Verify the relevant Supabase CLI command syntax using
   \`supabase functions deploy --help\`, \`supabase migration list --help\`
   and \`supabase db --help\`. Do not guess CLI flags.
4. Confirm necessary server-only keys already exist or get explicit
   permission for a separate secret-configuration action. Never print, log,
   commit or embed them in the client.
5. Plan the core functions \`automation-control\`,
   \`automation-webhook\`, \`automation-scheduler-worker\` and
   \`automation-schedule-control\` as separate deployment targets.
   Do not change their JWT policies to suppress auth errors.
6. Do **not** enable global scheduling, register cron, accept public
   webhooks at scale or perform automatic retries as part of diagnostics.
7. After approved deployment, refresh the GET function inventory; verify
   versions, ACTIVE state, JWT policy, current source compatibility and
   the correct project.
8. In an **isolated staging account**, run an authenticated manual workflow
   end-to-end; verify one real persisted run, owner isolation, idempotency,
   and a denied cross-account request.
9. Verify signed webhook rejection and approvals with legitimate test keys
   and controlled requests. Keep worker ticks and scheduled execution OFF
   unless independently approved for staging.
10. Run PostgreSQL acceptance, real browser/device tests, RLS checks,
    security review and rollback practice. Document a separate owner go/no-go.

**Release rule:** An inventory is not uptime monitoring, live execution proof,
a successful CI run, independent reviewer approval, deployment authorization,
or production readiness. This PR never mutates the hosted project.
