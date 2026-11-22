# Docker live PostgreSQL acceptance (isolated CI)

This milestone follows merged PR #442. It runs the actual ETERNYX Docker database migrations on a throwaway PostgreSQL 17 instance in GitHub Actions. The PostgreSQL container uses --network none, publishes no ports, and is removed after each run. No production Supabase, Docker lab agent or hosted customer resource is contacted.

## Acceptance coverage

1. Applies every existing Docker workspace, signed report, operation review, dispatch, receipt, incident and containment migration in order.
2. Creates two real synthetic database owners and separately enrolled agents with latest signed-report fixture rows.
3. Rejects cross-owner agent use, request decisions, permit authorization, receipt completion, incident creation and triage.
4. Executes authenticated SELECT queries under SET ROLE authenticated with owner A and owner B JWT claim contexts, checking actual RLS results for workspaces, agents, requests, claims, incidents and events.
5. Checks actual PostgreSQL function grants so only service_role can execute privileged Docker RPC functions, and browser roles have no table write grants.
6. Validates nonce consumption, duplicate replay rejection and an expired action timestamp.
7. Validates one request/one claim/one permit, and confirms plan approval is not mistaken for actual Docker execution.
8. Validates a signed-agent reported receipt, a same-outcome idempotent replay, contradictory-outcome rejection and cross-owner refusal.
9. Rejects false incident creation for completed receipts, accepts real reported failures and prevents duplicate incident records.
10. Escalates an incident transactionally, cancels queued plans and preserves recorded signed receipts while leaving the other owner's plans untouched.
11. Verifies that ordinary policy enable/triage cannot bypass a hold, and explicit release never automatically enables policy.
12. Verifies revoked agent records no longer consume signed-action nonces, and audit notes remain owner-isolated.

## CI

The check is defined in .github/workflows/docker-lab-postgres-acceptance.yml. It runs on Docker SQL changes and can be dispatched manually. All SQL tests in tests/sql/docker-lab-db-acceptance.sql fail the job immediately on the first broken invariant. Re-running CI always starts with a new empty PostgreSQL instance and two synthetic users.

## Strict limits

The fixture exercises the real database authorization and lifecycle rules, but it does not verify Ed25519 cryptography or JWT parsing at the Edge Function, nor does it inspect an actual Docker Engine. Server/operator opt-in remains off by default. Real staging deployments, remote endpoint isolation, physical agent host identity, signature validation, and existing browser acceptance require separate independent reviews. No new permissions, customer secrets, cloud costs or production execution pathways are introduced by this PR.