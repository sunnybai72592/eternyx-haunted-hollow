-- Applied ONLY inside a newly created disposable PG17 CI container.
-- Assertions are catalog-only; real Supabase managed migration history,
-- real account auth and RLS row isolation are NOT tested by this file.
DO $checks$
DECLARE
  v text;
  expected record;
BEGIN
  FOR v IN SELECT unnest(ARRAY[
      'service_requests','service_request_activity','service_request_triage',
      'service_scope_reviews','service_scope_responses','service_triage_history',
      'service_request_checks','service_clarification_questions',
      'service_clarification_answers','service_brief_amendments'
  ]) LOOP
    IF to_regclass('public.' || v) IS NULL THEN
      RAISE EXCEPTION 'missing Services source relation: %', v;
    END IF;
    IF NOT (SELECT c.relrowsecurity
        FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.' || v)) THEN
      RAISE EXCEPTION 'missing enabled Services RLS: %', v;
    END IF;
    IF has_table_privilege('anon','public.'||v,'SELECT') THEN
      RAISE EXCEPTION 'anonymous SELECT unexpectedly granted: %', v;
    END IF;
  END LOOP;

  FOR v IN SELECT unnest(ARRAY[
      'service_customer_amendment_queue','service_admin_amendment_queue',
      'service_request_journal','service_customer_followup_queue',
      'service_admin_followup_queue'
  ]) LOOP
    IF to_regclass('public.' || v) IS NULL THEN
      RAISE EXCEPTION 'missing Services invoker view: %', v;
    END IF;
    IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class c
       WHERE c.oid=to_regclass('public.'||v)
       AND c.relkind='v'
       AND 'security_invoker=true'=ANY(c.reloptions)
    ) THEN
      RAISE EXCEPTION 'not a security invoker view: %', v;
    END IF;
    IF has_table_privilege('anon','public.'||v,'SELECT') THEN
      RAISE EXCEPTION 'anonymous SELECT unexpectedly granted on view: %', v;
    END IF;
    IF NOT has_table_privilege('authenticated','public.'||v,'SELECT') THEN
      RAISE EXCEPTION 'authenticated participant cannot read view: %', v;
    END IF;
  END LOOP;

  FOR expected IN
    SELECT * FROM (VALUES
      ('service_brief_amendments','service_brief_amendment_stamp_review'),
      ('service_brief_amendments','service_brief_amendment_burst_guard'),
      ('service_clarification_questions','service_clarification_close_stamp'),
      ('service_clarification_questions','service_clarification_question_burst_guard'),
      ('service_requests','service_requests_delivery_gate')
    ) AS t(tablename, triggername)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=expected.tablename
        AND t.tgname=expected.triggername
        AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
    ) THEN
      RAISE EXCEPTION 'missing enabled source trigger: %', expected.triggername;
    END IF;
  END LOOP;

  IF (SELECT COUNT(*) FROM pg_catalog.pg_policies
      WHERE schemaname='public'
        AND tablename='service_brief_amendments'
        AND policyname IN (
          'service_brief_amendments_owner_insert',
          'service_brief_amendments_participant_read',
          'service_brief_amendments_admin_review'
        )) <> 3 THEN
    RAISE EXCEPTION 'incomplete Phase 13 amendment policy set';
  END IF;

  IF to_regprocedure('public.mark_service_request_checked(uuid)') IS NULL
     OR to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'missing required Service function';
  END IF;
END
$checks$;
SELECT 'PASS: disposable Services PG17 schema compilation and catalog checks (not live deployment evidence)' AS result;