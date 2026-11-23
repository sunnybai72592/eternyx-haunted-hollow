# Eternyx Services — Phase 24: conclusive staging privacy evidence and database recovery gate

**Status: blocked for production and live acceptance until independently verified.** This phase introduces **no new migration**, deploys no Edge Function, creates no service records and runs no remote database write.

## Why this patch exists

On November 23, 2026 the linked Eternyx Supabase project reported `ACTIVE_HEALTHY`, but the management SQL `SELECT 1` probe and managed migration-history listing both returned `Connection terminated due to connection timeout`. Project status and a healthy advisory result are not proof of a working database. These requests were not rerun indefinitely and the root cause is **unverified**. **This PR does not restore database connectivity.**

The Phase 20 staging test had an evidence gap: if the anonymous `service_requests` or `service_request_journal` REST query returned an error, code previously checked only that no rows had been returned. A 404 missing view, network failure, or null payload could therefore look like an anonymous-privacy PASS.

## Six connected changes

1. **Conclusive anonymous checks.** Each anonymous probe must return HTTP 200/206 with a *real empty array*, or a clearly coded PostgreSQL `42501` permission denial with HTTP 401/403 and no data. Anything else fails closed.
2. **Phase 13/14 coverage.** Probe private base requests, customer/admin amendment queues, brief amendments, journal, and internal triage separately, without reading bulk data.
3. **No misleading empty result.** An authenticated `SELECT` success with null, malformed, or overlong rows fails the gate, rather than being coerced to `[]`.
4. **Persisted workflow shape validation.** Owner responses and clarification answers must be real arrays with usable foreign keys.
5. **Safe failure output.** Unrecognized transport or SDK exceptions produce a generic operator message instead of printing a raw exception that may contain secrets or fixture identifiers.
6. **Executable regressions.** Test valid empty success, legitimate explicit permission denial, missing resources, network failures, malformed responses, leaked rows, and multi-resource anonymous coverage.

The permitted permission-denied result demonstrates denied access by grants; it **does not independently prove RLS**. RLS must still be verified using the customer A/customer B/admin matrix and the independent SQL catalog audit.

## Operational recovery — required before staging release

1. Verify project identity, nonproduction/prod separation and metrics in Supabase Dashboard. Review database CPU, RAM, swap, disk IO, connection counts and recent Postgres/PostgREST logs. Do not interpret a health label as a successful SQL round trip.
2. In **SQL Editor** run only `SELECT 1 AS connected;`. If this still times out, stop schema work, review resource pressure/connection management and contact Supabase Support with the sanitized connection timeout, a UTC timestamp and project reference. Never kill random sessions, restart production or resize resources without separate operator assessment and approval.
3. Once SQL works, run `docs/sql/eternyx/services-phase20-readonly-schema-check.sql` and inspect every expected object, grant, trigger, policy and security-invoker flag. Independently retrieve the **actual** managed migration history. Repository history is not deployment proof.
4. Pay special attention to migration timestamp collisions in the repository. Do **not** run a blanket remote `db push`, `migration repair`, raw DDL replay or history-table edit from this PR. Reconcile each migration by applied history, actual catalog, source SQL and operator review first. If and only if missing, plan Phase 13 `20261123040000_service_brief_amendments.sql` before Phase 14 `20261123050000_service_request_journal.sql`, using approved staging procedures and a tested rollback/recovery plan.
5. On a **separate** approved staging project with its own real, saved fixtures, configure the protected GitHub `services-staging` environment as specified in `docs/ETERNYX_SERVICES_RELEASE_GATE_PHASE20.md`. Manually dispatch `Services staging acceptance (manual, real accounts)` with `READ_ONLY_STAGING_ACCEPTANCE`. This creates Auth sessions but **does not write Service business records**.
6. Require the live three-account test, catalog audit, migration-history reconciliation, and signed-in desktop/mobile browser review all to pass. An isolated green mocked unit test or GitHub PR merge is not sufficient to approve production.

## Evidence required for release sign-off

- [ ] Production and staging project refs confirmed to be different
- [ ] Basic SQL connection works; incident/connection health independently assessed
- [ ] Applied migration history reconciled without source/version collision ambiguity
- [ ] Phase 13 amendment table, queues, policies and triggers verified
- [ ] Phase 14 journal security-invoker view, grants and cross-owner isolation verified
- [ ] Independent catalog audit completed and reviewed
- [ ] Real customer A/customer B/admin/anonymous staging acceptance passed
- [ ] Signed-in desktop/mobile feature journeys manually verified
- [ ] Secrets protected, no privileged keys exposed, no unexplained skipped checks

Until every relevant item is checked with real evidence, **Services production-readiness remains blocked**.

Official guidance:
- [Supabase — connection timeout troubleshooting](https://supabase.com/kb/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout)
- [Supabase — connection management](https://supabase.com/docs/guides/database/connection-management)
- [Supabase — migration management](https://supabase.com/docs/guides/deployment/database-migrations)
