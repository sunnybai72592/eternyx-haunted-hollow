-- ETERNYX Services Phase 21: operator-only, read-only database pressure audit.
-- Run in the SQL Editor ONLY AFTER connectivity is restored.
-- No active-query text, account IDs, customer records or credentials are returned.
-- An unhealthy result is diagnostic evidence, not authorization to kill
-- connections, disable RLS, increase compute, or deploy migrations blindly.

SELECT current_database() AS connected_database, now() AS checked_at;

-- Snapshot concurrent requests and waits without exposing SQL/user content.
SELECT coalesce(state, 'unknown') AS state,
       coalesce(wait_event_type, 'none') AS wait_event_type,
       count(*) AS backend_connections
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type
ORDER BY backend_connections DESC, state;

-- Counters are cumulative since stats_reset, not single-request timings.
SELECT datname, numbackends, xact_commit, xact_rollback,
       deadlocks, conflicts, temp_files, temp_bytes,
       blk_read_time, blk_write_time, stats_reset
FROM pg_catalog.pg_stat_database
WHERE datname = current_database();

-- Verify source-table indexes used by the layered Services views.
-- This is metadata only; absence indicates a performance review task,
-- not permission to create indexes without evaluating lock/size costs.
SELECT tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'service_requests', 'service_request_activity',
    'service_scope_reviews', 'service_scope_responses',
    'service_request_triage', 'service_brief_amendments',
    'service_clarification_questions', 'service_clarification_answers'
  )
ORDER BY tablename, indexname;

-- Presence of Phase 13/14 resources, not proof that migrations were logged.
SELECT to_regclass('public.service_brief_amendments') IS NOT NULL AS phase13_amendments_present,
       to_regclass('public.service_customer_amendment_queue') IS NOT NULL AS phase13_owner_queue_present,
       to_regclass('public.service_admin_amendment_queue') IS NOT NULL AS phase13_admin_queue_present,
       to_regclass('public.service_request_journal') IS NOT NULL AS phase14_journal_present;
