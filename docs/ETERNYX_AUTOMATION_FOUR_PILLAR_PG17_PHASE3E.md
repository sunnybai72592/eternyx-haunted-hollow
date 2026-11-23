# ETERNYX Automation Phase 3E — Four-pillar real PostgreSQL rehearsal

This phase expands the verified, network-isolated PostgreSQL 17 replay
from **Automation + Docker + Workspace (46 migrations)** to add all
checked-in **Services** migrations in the same disposable database.

The added acceptance uses three synthetic Auth identities: customer A,
customer B, and a *fixture-only* administrator C. No actual administrator
IDs, service records, payment credentials, or cloud projects are used.

## What changes in this PR

The existing migration replay planner retains its two- and three-pillar
modes. A new explicitly selected fourth scope, \`--include-services\`,
requires \`--include-workspace\` and includes the complete Services chain,
including \`_services_\` and \`_service_\` filename variants.

All included SQL is copied **byte-for-byte** from the source-locked,
historically reviewed local mirror. Any new/modified collision group,
duplicate version, invalid manifest, suspicious path, missing pillar
prerequisite, or unexpected SQL error aborts the test. Historical
migrations are never renamed in the repository.

The new GitHub Action applies Automation, Docker, Workspace and Services
migrations in timestamp order with \`ON_ERROR_STOP=1\` in one container.
It then runs the pre-existing Automation and Docker owner-isolation tests,
Workspace private revision and notification tests, and new Services tests
that verify customer A/B RLS, synthetic admin review permissions, private
journal boundaries and blocking of false service completion.

Services' production \`admin_users\` and role system are **not replaced**
by the synthetic admin fixture. That fixture exists solely in disposable
PostgreSQL CI. Its sole synthetic user is distinct from real admin IDs.
The actual trusted-admin migration remains a separate integration
dependency requiring Supabase Auth/profile infrastructure in a full
staging environment.

## Acceptance evidence and limitations

Review the GitHub Action **"Automation + Docker + Workspace + Services
isolated PostgreSQL 17 integration"**. A green result establishes a
real SQL + RLS rehearsal using that specific offline PostgreSQL fixture.
It does not establish hosted Supabase migration history, third-party
integrations, production account authorization, or financial readiness.

The connected ETERNYX Supabase project still reports \`ACTIVE_HEALTHY\`
while read-only migration/table queries time out; the Edge Function
inventory lacks \`automation-control\`, \`automation-webhook\` and
\`automation-scheduler-worker\`. A separate staging branch is not
configured. The offline replay cannot fix or certify those conditions.

No production database writes, migration repairs, deployment, schedule
activation, webhook traffic, Docker agent actions, live account login,
or new paid Supabase staging project are performed by this PR.

**Next critical path**: restore read-only database access; reconcile
the 11 collided historical versions against real applied history;
create/approve a separately isolated staging project if needed (with
explicit cost consent); deploy the three missing Automation functions
only after migrations are verified; then run the actual two-user
staging HTTP acceptance.
