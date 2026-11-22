-- Disposable Postgres 17 only. Apply after:
-- tests/sql/ctf-range-db-bootstrap.sql
-- 20261122220000_automation_manual_control_plane.sql
-- 20261122230000_automation_signed_webhook_triggers.sql

DO $$
DECLARE
  alice uuid := '11111111-1111-4111-8111-111111111111';
  bob uuid := '22222222-2222-4222-8222-222222222222';
  a_workflow uuid;
  b_workflow uuid;
  trigger_id uuid;
  b_trigger uuid;
  previous_rotated_at timestamptz;
  fresh_rotated_at timestamptz;
  request_id uuid := gen_random_uuid();
  result jsonb;
  replay jsonb;
  trace_steps jsonb := '[{"id":"a","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
  steps jsonb := '[{"id":"a","kind":"trim"}]'::jsonb;
BEGIN
  SELECT public.automation_save_workflow(alice,'Alice workflow',steps,NULL) INTO result;
  a_workflow := (result->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(bob,'Bob workflow',steps,NULL) INTO result;
  b_workflow := (result->>'workflow_id')::uuid;
  IF a_workflow IS NULL OR b_workflow IS NULL THEN RAISE EXCEPTION 'setup failed'; END IF;

  SELECT public.automation_register_webhook(alice,a_workflow,repeat('a',96),repeat('b',24),false) INTO result;
  IF result->>'ok' <> 'true' OR result->>'enabled' <> 'false' THEN RAISE EXCEPTION 'trigger must start disabled'; END IF;
  trigger_id := (result->>'trigger_id')::uuid;
  SELECT rotated_at INTO previous_rotated_at FROM public.automation_webhook_triggers WHERE id=trigger_id;

  SELECT public.automation_register_webhook(bob,a_workflow,repeat('c',96),repeat('d',24),false) INTO result;
  IF result->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'cross-owner registration allowed'; END IF;
  SELECT public.automation_register_webhook(alice,a_workflow,repeat('a',96),repeat('b',24),false) INTO result;
  IF result->>'reason' <> 'already_exists' THEN RAISE EXCEPTION 'duplicate registration allowed'; END IF;

  SELECT public.automation_record_webhook_run(
    trigger_id,alice,a_workflow,1,request_id,repeat('a',64),
    1,1,4,4,trace_steps,previous_rotated_at
  ) INTO result;
  IF result->>'reason' <> 'trigger_revoked' THEN RAISE EXCEPTION 'disabled webhook still executed'; END IF;

  SELECT public.automation_set_webhook_enabled(bob,trigger_id,true) INTO result;
  IF result->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'cross-owner enable allowed'; END IF;
  SELECT public.automation_set_webhook_enabled(alice,trigger_id,true) INTO result;
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'legitimate enable failed'; END IF;

  SELECT public.automation_record_webhook_run(
    trigger_id,alice,a_workflow,1,request_id,repeat('a',64),
    1,1,4,4,trace_steps,previous_rotated_at
  ) INTO result;
  IF result->>'ok' <> 'true' OR result->>'already_recorded' <> 'false' THEN
    RAISE EXCEPTION 'verified execution not recorded: %',result; END IF;
  IF (SELECT count(*) FROM public.automation_runs
      WHERE user_id=alice AND webhook_trigger_id=trigger_id AND trigger_type='webhook') <> 1 THEN
    RAISE EXCEPTION 'signed provenance missing'; END IF;
  SELECT public.automation_record_webhook_run(
    trigger_id,alice,a_workflow,1,request_id,repeat('a',64),
    1,1,4,4,trace_steps,previous_rotated_at
  ) INTO replay;
  IF replay->>'already_recorded' <> 'true' OR replay->>'run_id' <> result->>'run_id' THEN
    RAISE EXCEPTION 'same signed event was not deduplicated'; END IF;
  SELECT public.automation_record_webhook_run(
    trigger_id,alice,a_workflow,1,request_id,repeat('c',64),
    1,1,4,4,trace_steps,previous_rotated_at
  ) INTO result;
  IF result->>'reason' <> 'idempotency_conflict' THEN RAISE EXCEPTION 'reused request ID with changed body accepted'; END IF;

  SELECT public.automation_register_webhook(alice,a_workflow,repeat('f',96),repeat('e',24),true) INTO result;
  IF result->>'ok' <> 'true' OR result->>'enabled' <> 'false' THEN RAISE EXCEPTION 'rotation must disable trigger'; END IF;
  SELECT rotated_at INTO fresh_rotated_at FROM public.automation_webhook_triggers WHERE id=trigger_id;
  IF fresh_rotated_at < previous_rotated_at THEN RAISE EXCEPTION 'rotation time regressed'; END IF;
  -- A pre-rotation in-flight request must be denied after rotation and re-enable.
  PERFORM public.automation_set_webhook_enabled(alice,trigger_id,true);
  SELECT public.automation_record_webhook_run(
    trigger_id,alice,a_workflow,1,gen_random_uuid(),repeat('a',64),
    1,1,4,4,trace_steps,previous_rotated_at - interval '1 second'
  ) INTO result;
  IF result->>'reason' <> 'trigger_revoked' THEN RAISE EXCEPTION 'stale key request accepted'; END IF;

  SELECT public.automation_register_webhook(bob,b_workflow,repeat('a',96),repeat('b',24),false) INTO result;
  b_trigger := (result->>'trigger_id')::uuid;
  SELECT public.automation_delete_webhook(alice,b_trigger) INTO result;
  IF result->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'cross-owner deletion allowed'; END IF;
  SELECT public.automation_delete_webhook(alice,trigger_id) INTO result;
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'legitimate deletion refused'; END IF;
  IF (SELECT count(*) FROM public.automation_runs WHERE user_id=alice AND
      trigger_type='webhook' AND webhook_trigger_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'deleted trigger did not preserve private run history'; END IF;
  RAISE NOTICE 'Webhook ownership, disabled defaults, encryption metadata, replay and revocation validated';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_webhook_triggers','SELECT')
     OR has_table_privilege('anon','public.automation_webhook_triggers','SELECT')
     OR has_table_privilege('authenticated','public.automation_webhook_triggers','INSERT')
     OR has_function_privilege('authenticated',
         'public.automation_register_webhook(uuid,uuid,text,text,boolean)','EXECUTE')
     OR has_function_privilege('anon',
         'public.automation_record_webhook_run(uuid,uuid,uuid,integer,uuid,text,integer,integer,integer,integer,jsonb,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'webhook credential or write privilege leaked to browser roles';
  END IF;
END;
$$;
