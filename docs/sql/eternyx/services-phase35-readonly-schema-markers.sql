-- ETERNYX Services Phase 35: strictly SELECT-only schema marker snapshot.
-- Execute only with operator-approved READ-ONLY access to the target project.
-- It does not read customer rows or any secret. It does not certify
-- permissions, policy semantics, managed history, or production readiness.
SELECT
  to_regclass('public.service_requests') IS NOT NULL AS phase1_requests,
  to_regclass('public.service_customer_followup_queue') IS NOT NULL
    AS phase12_customer_followup_queue,
  to_regclass('public.service_brief_amendments') IS NOT NULL AS phase13_amendments,
  to_regclass('public.service_customer_amendment_queue') IS NOT NULL
    AS phase13_customer_queue,
  to_regclass('public.service_admin_amendment_queue') IS NOT NULL AS phase13_admin_queue,
  to_regclass('public.service_request_journal') IS NOT NULL AS phase14_journal;
