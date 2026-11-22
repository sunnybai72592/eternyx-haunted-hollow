# Docker Incident Containment & Operational Readiness

This milestone follows the Docker Incident Response PR #424. It is a **manual, authenticated operator safety workflow**, not automatic remote Docker incident detection or unattended container execution. The underlying signed lab dispatcher remains disabled by default and no production environments are altered by merging this code.

## What this PR adds

1. **Owner-scoped incident escalation** into a persisted `escalated` state, with a meaningful operator note (20–500 characters).
2. **Transactional incident hold** that disables Docker approval policy and cancels pending/approved requests with existing control audit events.
3. **Database re-enable fence:** while `docker_control_policies.incident_hold=true`, the existing `docker_set_control_policy` RPC refuses a request to turn approvals back on.
4. **Ordinary triage bypass prevention:** escalated cases cannot be marked Reviewed or Investigating through the old triage RPC. They require the explicit release endpoint.
5. **Typed confirmation** bound to the exact case: `SUSPEND <FIRST_8_CASE_ID>`. No generic YES button.
6. **Explicit case release** with separate `RELEASE <FIRST_8_CASE_ID>` phrase and another operator note. One case returns to Investigating, with an immutable `hold_released` audit event.
7. **Multiple escalation awareness:** releasing one case keeps the hold until all other escalated cases are independently released.
8. **No silent resumption:** after the last release, `incident_hold` is cleared but `enabled` remains false; the owner must separately opt in again.
9. **Owner-only operational checklist** computed from real, bounded records: incident hold, enabled review policy, escalated cases, signed heartbeat freshness and unresolved signed claims.
10. **New UI, contract tests and migration coverage** showing only last-refresh snapshots; no invented online signals or independently verified Docker execution.

## Critical limits and the in-flight permit race

Incident escalation prevents new Docker command **claims and authorizations** because those existing SQL RPCs require the owner's `enabled=true` policy. It cancels queued operation plans. **It cannot retract a permit already issued** by the server, which could remain valid for up to 15 seconds. An active container is not stopped and no remote process is killed.

The checklist classification `review_prerequisites_observed` is **not** permission to execute or an assurance a physical host is healthy. It only describes the bounded records returned at the last manual refresh. If those records are missing or stale, the view is attention-required/unknown.

## Staging deployment

Apply `supabase/migrations/20261123100000_docker_incident_containment.sql` after the prior Docker incident and control migrations. Deploy the updated authenticated `docker-control` Edge Function to staging after verifying the SQL migration, RLS and owner-scoped behavior. No new hosted Docker daemon, background cron, billing, GPU workers, or external AI providers are introduced.

Test at minimum:
- Anonymous callers rejected; owner A cannot escalate or release owner B's case.
- Escalation disables the correct owner's approval policy and cancels its pending/approved requests, but never changes claim receipts.
- A concurrent attempt to re-enable the policy is rejected while `incident_hold=true`.
- Ordinary triage fails for escalated cases.
- Duplicate escalation is idempotent and does not emit duplicate audit entries.
- Case release requires a 20+ character note and typed phrase.
- Two escalated cases: release of the first retains hold, releasing the second clears hold but keeps policy disabled.
- A newly authorized permit that predates escalation cannot be revoked; verify this documented race in isolated staging lab simulations.
- Readiness classification is never accepted by the server as an execution authorization.
- Original RLS owner read policies, composite ownership constraints, and service-role-only RPC permissions remain intact.

Node regression command: `node --test tests/docker-incident-containment.test.mjs`. Run the complete repository build/test CI and Supabase security advisors before deploying.

## Security/trust statement

All mutation requests are authenticated through Supabase Auth; the Edge Function supplies the owner UUID and invokes service-role-only, SECURITY INVOKER SQL functions. Browser clients cannot directly mutate incident holds or the policy database. Incident history records are administrative notes, not proof of independently verified Docker operations. Never enter tokens or sensitive Docker logs in incident notes.

Keep `DOCKER_REMOTE_LAB_ENABLED` and `ETERNYX_REMOTE_LAB_ENABLED` unset on public production infrastructure.
