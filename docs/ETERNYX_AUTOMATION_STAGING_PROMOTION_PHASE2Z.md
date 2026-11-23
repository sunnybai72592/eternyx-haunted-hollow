# ETERNYX Automation Phase 2Z — Staging Deployment Handoff (no execution)

## Verified context

- PR #521 merged, improving the browser-side truthful cloud availability state.
- The connected ETERNYX Supabase function inventory listed
  \`automation-github-public\`, \`automation-github-issues\` and
  \`automation-schedule-control\` as active, but not
  \`automation-control\`, \`automation-webhook\` or
  \`automation-scheduler-worker\`.
- A connected read-only database query timed out. This **does not** prove
  that every migration is absent or that the database is permanently down.
- PR #515 added a separate opt-in staging execution acceptance runner.
  It cannot pass until the actual backend is available in staging.

**A GitHub merge is not a Supabase migration, deployment or live acceptance.**
This phase adds a source-anchored, reviewable **nonexecuting** rollout plan,
not an automated production deployer.

## What's delivered

1. One reproducible SHA-256 fingerprint per checked-in Automation migration
   file, in sorted migration order.
2. A full-repository migration count: Supabase \`db push\` may apply
   *non-Automation* migrations, too. Never assume only Automation SQL runs.
3. Duplicate timestamp and out-of-order Automation migration checks.
4. SHA-256 fingerprints of the six actual Automation Edge Function
   handler sources.
5. Exact JWT gateway-policy expectations from the existing source manifest:
   the signed webhook and internal worker deliberately use \`verify_jwt=false\`,
   but perform their own authentication. Never disable those checks.
6. Server-only secret **names**, not values, collected into an explicit
   per-function operator checklist.
7. Explicit staging-versus-production ref validation (20 lowercase letters,
   refs must differ) before generating target-specific commands.
8. Supabase CLI **v3** syntax: read-only \`migration list --remote=<ref>\`
   and remote \`db push --dry-run --remote=<ref>\`; bare \`db push\` in v3
   targets local by default.
9. Optional *operator-supplied* function-inventory and migration-version
   evidence; absent, invalid, mismatched or stale evidence remains a
   blocker, never a pass.
10. Mandatory independent sign-offs for dry-run review, server-only secrets
    and a separately approved staging deployment — even if all inventory
    checks look green.
11. CI/source regressions for refs, missing functions, unknown migrations,
    host isolation, fingerprints, order and safe CLI arguments.
12. A machine-readable report with \`commandsExecuted=false\`,
    \`stagingProjectChanged=false\`, \`productionProjectChanged=false\`,
    \`productionReady=false\`, and \`releaseAuthorized=false\`.

## Local/CI source-only preview (no credentials)

\`\`\`sh
npm run automation:staging:plan
\`\`\`

Outputs the source hashes, relative migration count, declared function
auth configuration, secret names, and release blockers. There are **no**
network calls or cloud mutations, and it cannot prove the staging or
production environment is healthy.

## Optional operator staging review

A deployment owner must first obtain a *separate isolated Supabase staging
project* with no real user data. For a target-specific plan:

\`\`\`sh
node scripts/automation-staging-deployment-plan.mjs \
  --staging-ref YOUR_20_LETTER_STAGING_REF \
  --production-ref YOUR_DIFFERENT_20_LETTER_PRODUCTION_REF
\`\`\`

This still only **prints** two approved read-only/dry-run command arrays.
It does not run them. Confirm the Supabase CLI version and supported
flags with:

\`\`\`sh
supabase --version
supabase migration list --help
supabase db push --help
supabase functions deploy --help
\`\`\`

CLI v3 documentation:
- https://supabase.com/docs/guides/local-development/cli/migrating-to-v3
- https://supabase.com/docs/reference/cli/supabase-db-remote

Read-only remote migration inventory should be checked **for the actual
staging ref**. If access times out, stop and investigate connection,
project lifecycle, credentials and network instead of guessing that all
migrations are applied. Review a remote migration **dry-run**, including
every pending migration and its SQL/privileges, not merely timestamp
counts. A dry-run is not permission to run a real push.

An operator can provide a private local JSON snapshot from the function
management list (array or \`{"functions":[...]}\`) via
\`--functions-inventory /private/path/functions.json\`. Likewise, an
already independently verified migration-list receipt in the strict
format documented in \`ETERNYX_AUTOMATION_V1_RUNTIME_READINESS.md\`
can be supplied via \`--migration-evidence /private/path/migrations.json\`.
These private files must not be committed, logged, uploaded as artifacts,
or treated as independently authenticated.

## Staged deployment procedure (requires separate approval)

1. **Stop gate:** choose an isolated staging project and verify its owner,
   billing/hosting budget, data-classification boundary and backup plan.
   Ensure it is not the existing live ETERNYX project.
2. **Database connectivity:** establish a successful read-only migration
   history query, reconcile missing migrations, and review all pending
   SQL and the v3 remote dry-run. A connection timeout blocks deployment.
3. **SQL security review:** validate RLS, role grants, private records and
   cross-owner enforcement; do not use \`migration repair\` just to make
   histories match.
4. **Secrets review:** confirm the relevant existing server-only secrets
   for each function, without copying secret values into chat, GitHub,
   logs, browser \`VITE_*\` variables or the plan.
5. **Deployment target review:** ensure the source commit and SHA-256
   handler/migration hashes match the reviewed release candidate.
6. **Explicit change approval:** only then may an authorized operator
   apply the SQL migrations and deploy the Edge functions to staging.
   This PR provides **no mutating command and no automatic execution**.
7. **Functions to inspect:** \`automation-control\` (authenticated manual API),
   \`automation-schedule-control\` (authenticated management),
   \`automation-webhook\` (HMAC-gated), \`automation-scheduler-worker\`
   (dedicated server key), and both GitHub integration functions.
   Verify each function's intended \`verify_jwt\` policy after deployment.
8. **Do not activate** global scheduler flags, cron ticks, inbound public
   webhook traffic, GitHub issue writes or automatic retries through this
   handoff. Activation needs its own authorization.
9. **Verify staging:** rerun actual function inventory, recheck migration
   history, then use \`scripts/automation-staging-acceptance.mjs --inspect\`
   with two real disposable staging accounts.
10. **Separate manual-run consent:** only after inspect is green and a
    new explicit approval should the two-account staging runner use
    \`--execute --confirm-isolated-staging\`. It consumes resources and
    writes a run receipt; it is not a free or read-only test.
11. **Document outcome:** include the environment, reviewed code SHA,
    migrations, tests, deleted temporary workflow status and live RLS
    acceptance. Keep JWTs, credentials and private inputs out of reports.
12. **Production go/no-go is separate.** No staging success automatically
    grants any production migration, paid service activation, scheduler
    execution or release permission.

## Honest boundaries

Passing the offline CI source plan establishes only that the checked-in
release *looks internally consistent*; it cannot verify successful SQL
application, a deployed function's actual source, cloud database
connectivity, billing safety, independent auth, or uptime. The planner
cannot itself deploy services or apply SQL. Its generated evidence and
operator-provided migration receipts are **not independent cryptographic
attestations**.
