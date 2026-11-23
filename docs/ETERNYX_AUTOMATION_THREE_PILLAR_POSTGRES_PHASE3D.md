# ETERNYX Automation Phase 3D — Three-Pillar PostgreSQL Integration

## Real test, not another deployment-ready badge

Phase 3C successfully applied **32 actual Automation + Docker SQL migrations** and
ran two existing ownership/security smoke suites in a disposable,
network-isolated PostgreSQL 17 instance. This next phase includes all
checked-in Workspace migrations in the **same** database, then runs the
real Workspace ownership/revision and latest team-notification tests.
It verifies coexistence across three pillars without modifying production.

## Improvements bundled together

1. Keep the existing two-pillar replay behavior backward-compatible.
2. Add explicit \`--include-workspace\` selection; no implicit scope expansion.
3. Require the complete available Workspace chain (minimum twelve files)
   in addition to the full Automation and Docker chains.
4. Use the checked-in historical-collision Git hash baseline to prohibit
   silent edits before creating the temporary SQL mirror.
5. Retain unique, validated local migration version names and SQL bytes.
6. Bootstrap a synthetic two-user Auth environment and local Storage
   schema using existing test-only fixtures.
7. Apply the mixed Automation, Docker and Workspace migration chain in
   timestamp order with \`psql -v ON_ERROR_STOP=1\`.
8. Fail on the first SQL error and report the original local migration
   label, rather than skipping a failure or fabricating readiness.
9. Execute existing Automation quota, idempotent replay and private RLS
   tests after all migrations.
10. Execute existing Docker permit, signed receipt, idempotency and
    owner-isolation tests in the **same** database.
11. Verify Workspace owner-only projects, private revisions, archived
    behavior, and latest team notification snapshot/outsider protections.
12. Use GitHub-hosted disposable \`postgres:17-alpine\` with \`--network none\`,
    fixed local test identities, no Supabase secrets, and forced cleanup;
    automated regressions enforce these boundaries.

## How to verify

In the PR checks, inspect the new job
**"Verify Automation Docker Workspace SQL integration in networkless PG17"**.
It creates a fresh temporary local mirror, starts a disposable PostgreSQL,
executes the selected real SQL, then runs three independent pillar smoke
suites. Green means those specific checks passed **on an offline fixture**.

This cannot verify all Services or AI SQL, the complete 100+ migration
source repository, real Supabase Auth/RLS infrastructure, live Edge
Function revisions, production deployment, or outbound integrations.
It must not be used as evidence that a hosted project is migrated.

## Actual current hosting blockers

The connected ETERNYX Supabase project still reports ACTIVE_HEALTHY, but
its migration history and even compact read-only table lists failed with
**connection terminated due to connection timeout**. Recent PostgreSQL
log metadata includes SQLSTATE \`08006\` (connection exception) and
\`08P01\` (protocol violation), but this alone does **not** establish
the root cause or justify restarting a live database.

Management inventory continues to list only three Automation-related
Edge Functions, **not** the main \`automation-control\`, public
\`automation-webhook\`, or private \`automation-scheduler-worker\`.
There is no configured isolated staging branch in the connected project.

Before any real deployment: restore authorized read-only access and
investigate database connection errors, identify a truly isolated staging
project and approve any hosting spend, reconcile the 11 historical
collision versions, then deploy and run the previously implemented
two-account HTTP acceptance against staging. **No automatic hosted
changes, retries, secret rotation, migration repair, scheduler tick, paid
provider action, or production work are enabled by this PR.**
