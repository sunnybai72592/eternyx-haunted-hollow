-- Execute in a disposable PostgreSQL 17 container after:
-- tests/sql/ctf-range-db-bootstrap.sql and Automation migration.
-- Exceptions make CI fail; never run these fixture identities on production.
DO $$
DECLARE
  u1 uuid := '11111111-1111-4111-8111-111111111111';
  u2 uuid := '22222222-2222-4222-8222-222222222222';
  w1 uuid;
  w2 uuid;
  key1 uuid := gen_random_uuid();
  save_result jsonb;
  record_result jsonb;
  replay_result jsonb;
  wrong_result jsonb;
  trace_items jsonb := '[{"id":"a","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
  payload jsonb := '[{"id":"a","kind":"trim"}]'::jsonb;
  i integer;
BEGIN
  SELECT public.automation_save_workflow(u1, 'Private 1', payload, NULL) INTO save_result;
  IF save_result->>'ok' <> 'true' THEN RAISE EXCEPTION 'owner 1 save refused: %', save_result; END IF;
  w1 := (save_result->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(u2, 'Private 2', payload, NULL) INTO save_result;
  IF save_result->>'ok' <> 'true' THEN RAISE EXCEPTION 'owner 2 save refused'; END IF;
  w2 := (save_result->>'workflow_id')::uuid;

  -- A service client cannot change another owner's row with owner 1's identity.
  SELECT public.automation_save_workflow(u1, 'Hijack', payload, w2) INTO save_result;
  IF save_result->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'cross-owner save was allowed'; END IF;
  SELECT public.automation_toggle_workflow(u1, w2, false) INTO save_result;
  IF save_result->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'cross-owner pause was allowed'; END IF;
  SELECT public.automation_delete_workflow(u1, w2) INTO save_result;
  IF save_result->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'cross-owner delete was allowed'; END IF;

  -- Record a real completed metadata-only run and ensure retries are idempotent.
  SELECT public.automation_record_run(u1,w1,1,key1,repeat('a',64),1,1,4,4,trace_items) INTO record_result;
  IF record_result->>'ok' <> 'true' OR record_result->>'already_recorded' <> 'false' THEN
    RAISE EXCEPTION 'run recording failed: %',record_result; END IF;
  SELECT public.automation_record_run(u1,w1,1,key1,repeat('a',64),1,1,4,4,trace_items) INTO replay_result;
  IF replay_result->>'already_recorded' <> 'true'
     OR replay_result->>'run_id' <> record_result->>'run_id' THEN
    RAISE EXCEPTION 'idempotency failed'; END IF;
  SELECT public.automation_record_run(u1,w1,1,key1,repeat('b',64),1,1,4,4,trace_items) INTO wrong_result;
  IF wrong_result->>'reason' <> 'idempotency_conflict' THEN
    RAISE EXCEPTION 'conflicting replay accepted'; END IF;

  -- Disabling a workflow prevents fresh runs, even if client submits a valid ID.
  SELECT public.automation_toggle_workflow(u1,w1,false) INTO save_result;
  SELECT public.automation_record_run(u1,w1,1,gen_random_uuid(),repeat('c',64),1,1,4,4,trace_items) INTO wrong_result;
  IF wrong_result->>'reason' <> 'not_found_or_paused' THEN RAISE EXCEPTION 'paused run accepted'; END IF;
  PERFORM public.automation_toggle_workflow(u1,w1,true);

  SELECT public.automation_save_workflow(u1, 'Updated', payload, w1) INTO save_result;
  IF (save_result->>'revision')::integer <> 2 THEN RAISE EXCEPTION 'revision not advanced'; END IF;
  SELECT public.automation_record_run(u1,w1,1,gen_random_uuid(),repeat('a',64),1,1,4,4,trace_items) INTO wrong_result;
  IF wrong_result->>'reason' <> 'stale_workflow' THEN RAISE EXCEPTION 'stale version accepted'; END IF;

  -- A 24-hour user quota cannot be bypassed by adding a different request key.
  FOR i IN 1..29 LOOP
    SELECT public.automation_record_run(u1,w1,2,gen_random_uuid(),repeat('a',64),1,1,4,4,trace_items)
    INTO record_result;
    IF record_result->>'ok' <> 'true' THEN RAISE EXCEPTION 'legal run % refused',i; END IF;
  END LOOP;
  SELECT public.automation_record_run(u1,w1,2,gen_random_uuid(),repeat('a',64),1,1,4,4,trace_items)
  INTO wrong_result;
  IF wrong_result->>'reason' <> 'daily_run_limit' THEN RAISE EXCEPTION 'daily run quota bypass'; END IF;

  IF (SELECT count(*) FROM public.automation_runs WHERE user_id=u1) <> 30 THEN
    RAISE EXCEPTION 'duplicate or rejected run still inserted'; END IF;
  IF (SELECT count(*) FROM public.automation_runs WHERE user_id=u2) <> 0 THEN
    RAISE EXCEPTION 'foreign account history polluted'; END IF;

  -- Deleting a saved workflow preserves private audit history without dangling FK.
  SELECT public.automation_delete_workflow(u1,w1) INTO save_result;
  IF save_result->>'ok' <> 'true' OR
     (SELECT count(*) FROM public.automation_runs WHERE user_id=u1 AND workflow_id IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'deleted workflow retains reference or failed'; END IF;

  -- No command, URL, raw input, external target or untrusted output is stored.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='automation_runs'
               AND column_name IN ('input','output','raw_input','raw_output','webhook_url','command')) THEN
    RAISE EXCEPTION 'history table unexpectedly stores sensitive payload';
  END IF;
  RAISE NOTICE 'Automation owner-bound RPC, idempotency, quota and retention checks passed';
END;
$$;

-- Public callers have no write grants and no direct RPC execution.
DO $$
BEGIN
  IF has_table_privilege('anon','public.automation_runs','SELECT')
     OR has_table_privilege('authenticated','public.automation_runs','INSERT')
     OR has_table_privilege('authenticated','public.automation_workflows','UPDATE')
     OR has_function_privilege('authenticated',
       'public.automation_record_run(uuid,uuid,integer,uuid,text,integer,integer,integer,integer,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.automation_save_workflow(uuid,text,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'direct write or internal RPC privilege leaked';
  END IF;
END;
$$;

-- Owner-only authenticated RLS SELECT: user 1 sees own run history but not user 2's workflow.
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.automation_workflows) <> 0 OR
     (SELECT count(*) FROM public.automation_runs) <> 30 THEN
    RAISE EXCEPTION 'owner 1 RLS failed';
  END IF;
END; $$;
SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.automation_workflows) <> 1 OR
     (SELECT count(*) FROM public.automation_runs) <> 0 THEN
    RAISE EXCEPTION 'owner 2 RLS failed';
  END IF;
END; $$;
RESET ROLE;
RESET request.jwt.claim.sub;
