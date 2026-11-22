# Education CBT — concurrent transaction acceptance (staging only)

**Status: source and disposable CI only. Not deployed or production approved.**

The baseline and adversarial SQL tests in PRs #344, #348 and #350 exercise
individual roles, permissions and the exam lifecycle. They did **not**
prove behavior when competing database transactions overlap.

This follow-up patches only
`scripts/sql/staging-education-cbt-atomic-security.sql` (not production):
a `start_cbt_attempt` call now resolves simultaneous first-start inserts
using `ON CONFLICT (user_id,test_id) DO NOTHING`, then reads the winner
under `FOR UPDATE` and rechecks status/deadline using the database clock.
A completed or expired exam is not restarted.

The CI job now runs `scripts/staging/verifyEducationConcurrency.mjs`
against its existing **isolated network-disabled PostgreSQL 17** container,
*after* the exact staged migrations and previous SQL acceptance scripts.
Only synthetic Auth IDs are inserted and no Supabase services are contacted.

## Five deterministic, independent transaction races

1. **Concurrent duplicate start:** Transaction A holds an uncommitted attempt.
   Transaction B tries to start the same enrolled exam and must block.
   Once A commits, both calls must resolve to exactly one identical attempt ID.
2. **Revoke before start:** An admin deletes an enrollment in a transaction
   while the student tries to start. The student must wait, then be denied
   after the revocation commits. No attempt may exist.
3. **Start before revoke:** A student starts while holding the enrollment
   row lock. Admin revocation must wait, then fail because an attempt exists.
4. **Save before submit:** An option save holds the attempt lock. A concurrent
   submit waits, then succeeds; the saved answer must remain present.
5. **Submit before save:** A final submit holds the attempt lock. A concurrent
   answer save waits, then receives `already_submitted`, without new answers.

Every contested operation is proven to have entered an actual PostgreSQL
`Lock` wait through `pg_stat_activity`; tests do not merely sleep and
hope two requests overlap. Session wait times are bounded, unexpected SQL
failures stop CI, and child sessions are terminated even on failure.

## Security and release limitations

- This is **PostgreSQL READ COMMITTED fixture acceptance**, not a proof
  of performance or correctness for all possible concurrent loads.
- The real Supabase Auth/PostgREST integration, function owners, grants,
  RLS policies, legacy client compatibility and migration dependencies
  must still be tested in an authorized *isolated staging project*.
- Require backups, operational rollback, real-JWT browser and direct-REST
  tests, grading-worker tests and review before deploying the staged SQL.
- Keep all production Education flags OFF until the separate release gate
  is explicitly satisfied; no paid infrastructure is required by this PR.

## CI

The PR must pass **Education CBT PostgreSQL Security Acceptance** plus
normal application CI. A passing isolated test alone does not authorize
production deployment.
