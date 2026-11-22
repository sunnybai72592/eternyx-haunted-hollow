-- Disposable networkless PostgreSQL 17 acceptance for Automation Phase 2K.
-- Bulk pause/resume must be atomic, owner-only, capped and replay safe.
-- Keyset history must include only real runs and no raw inputs or outputs.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  a uuid; b uuid; c uuid; other uuid;
  ar integer;br integer;cr integer;
  batch jsonb;receipt jsonb;key1 uuid:=gen_random_uuid();
  run1 uuid;run2 uuid;item jsonb;count_before integer;i integer;
  first_history jsonb;next_history jsonb;
  trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
BEGIN
  SELECT public.automation_save_workflow(alice,'First workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO receipt;
  a:=(receipt->>'workflow_id')::uuid;
  ar:=(receipt->>'revision')::int;
  SELECT public.automation_save_workflow(alice,'Second workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO receipt;
  b:=(receipt->>'workflow_id')::uuid;
  br:=(receipt->>'revision')::int;
  SELECT public.automation_save_workflow(alice,'Third workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO receipt;
  c:=(receipt->>'workflow_id')::uuid;
  cr:=(receipt->>'revision')::int;
  SELECT public.automation_save_workflow(bob,'Bob workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO receipt;
  other:=(receipt->>'workflow_id')::uuid;
  batch:=jsonb_build_array(
    jsonb_build_object('id',a,'revision',ar,'active',true),
    jsonb_build_object('id',b,'revision',br,'active',true));

  -- A foreign workflow makes the ENTIRE request fail with no partial writes.
  SELECT public.automation_bulk_toggle_workflows(alice,gen_random_uuid(),
    batch||jsonb_build_array(jsonb_build_object(
       'id',other,'revision',1,'active',true)),false) INTO receipt;
  IF receipt->>'reason'<>'not_found' OR
     EXISTS(SELECT 1 FROM public.automation_workflows WHERE id=a AND active=false) THEN
    RAISE EXCEPTION 'Foreign workflow caused a partial owner bulk update';
  END IF;

  -- State drift must be detected before any member is toggled.
  SELECT public.automation_bulk_toggle_workflows(alice,gen_random_uuid(),
    batch||jsonb_build_array(jsonb_build_object(
      'id',c,'revision',2,'active',true)),false) INTO receipt;
  IF receipt->>'reason'<>'stale_workflow' OR
     EXISTS(SELECT 1 FROM public.automation_workflows WHERE id=a AND active=false) THEN
    RAISE EXCEPTION 'Stale member caused partial bulk update';
  END IF;
  SELECT public.automation_bulk_toggle_workflows(alice,gen_random_uuid(),
    batch||jsonb_build_array(jsonb_build_object(
      'id',a,'revision',ar,'active',true)),false) INTO receipt;
  IF receipt->>'reason'<>'duplicate_workflow' THEN
    RAISE EXCEPTION 'Duplicate ID accepted';
  END IF;

  SELECT public.automation_bulk_toggle_workflows(alice,key1,batch,false) INTO receipt;
  IF receipt->>'ok'<>'true' OR receipt->>'replayed'<>'false'
     OR (receipt->>'count')::int<>2 THEN
    RAISE EXCEPTION 'Valid atomic bulk pause failed: %',receipt;
  END IF;
  IF (SELECT count(*) FROM public.automation_workflows
    WHERE id IN (a,b) AND active=false)<>2 THEN
    RAISE EXCEPTION 'Bulk pause did not update exact two workflows';
  END IF;
  IF (SELECT active FROM public.automation_workflows WHERE id=c) IS DISTINCT FROM true
    OR (SELECT active FROM public.automation_workflows WHERE id=other) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Bulk touched unrelated workflows';
  END IF;
  SELECT public.automation_bulk_toggle_workflows(alice,key1,batch,false) INTO receipt;
  IF receipt->>'ok'<>'true' OR receipt->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'Idempotent replay double-applied state';
  END IF;
  SELECT public.automation_bulk_toggle_workflows(alice,key1,batch,true) INTO receipt;
  IF receipt->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Same UUID allowed changed action';
  END IF;
  SELECT public.automation_bulk_operation_usage(alice) INTO receipt;
  IF receipt->>'used'<>'1' OR receipt->>'limit'<>'10' THEN
    RAISE EXCEPTION 'Real owner bulk quota incorrect: %',receipt;
  END IF;
  SELECT public.automation_bulk_operation_usage(bob) INTO receipt;
  IF receipt->>'used'<>'0' THEN
    RAISE EXCEPTION 'Cross-account quota bleed';
  END IF;

  -- Manual execution of an active workflow produces genuine DB receipts.
  SELECT public.automation_record_run(alice,c,1,gen_random_uuid(),repeat('a',64),
    1,1,4,4,trace) INTO receipt;
  IF receipt->>'ok'<>'true' THEN RAISE EXCEPTION 'Real run fixture 1 rejected: %',receipt; END IF;
  run1:=(receipt->>'run_id')::uuid;
  SELECT public.automation_record_run(alice,c,1,gen_random_uuid(),repeat('b',64),
    1,1,4,4,trace) INTO receipt;
  IF receipt->>'ok'<>'true' THEN RAISE EXCEPTION 'Real run fixture 2 rejected'; END IF;
  run2:=(receipt->>'run_id')::uuid;
  SELECT public.automation_record_run(bob,other,1,gen_random_uuid(),repeat('c',64),
    1,1,4,4,trace) INTO receipt;
  IF receipt->>'ok'<>'true' THEN RAISE EXCEPTION 'Bob real run failed'; END IF;

  SELECT public.automation_query_run_history(alice,NULL,NULL,NULL,NULL,1) INTO first_history;
  IF first_history->>'ok'<>'true' OR
     jsonb_array_length(first_history->'rows')<>1 OR
     first_history->>'hasMore'<>'true' OR
     first_history->>'totalMatching'<>'2' OR
     first_history->>'rawInputsStored'<>'false' OR
     first_history->>'rawOutputsStored'<>'false' THEN
    RAISE EXCEPTION 'First actual history page malformed: %',first_history;
  END IF;
  SELECT public.automation_query_run_history(alice,NULL,NULL,
    (first_history->>'nextBeforeTime')::timestamptz,
    (first_history->>'nextBeforeId')::uuid,1) INTO next_history;
  IF next_history->>'ok'<>'true' OR
     jsonb_array_length(next_history->'rows')<>1 OR
     next_history->>'hasMore'<>'false' OR
     next_history->>'totalMatching'<>'2' OR
     next_history->'rows'->0->>'id'=first_history->'rows'->0->>'id' THEN
    RAISE EXCEPTION 'Keyset history repeated or dropped a real run: %',next_history;
  END IF;
  IF first_history->'rows'->0 ? 'input' OR
     first_history->'rows'->0 ? 'output' OR
     first_history->'rows'->0 ? 'request_fingerprint' THEN
    RAISE EXCEPTION 'Sensitive run source leaked into history';
  END IF;
  SELECT public.automation_query_run_history(alice,c,'webhook',NULL,NULL,20)
    INTO receipt;
  IF receipt->>'totalMatching'<>'0' THEN
    RAISE EXCEPTION 'Channel filter fabricated webhook history';
  END IF;
  SELECT public.automation_query_run_history(alice,c,'manual',NULL,NULL,20)
    INTO receipt;
  IF receipt->>'totalMatching'<>'2' THEN
    RAISE EXCEPTION 'Actual workflow/channel filter returned wrong count';
  END IF;
  SELECT public.automation_query_run_history(bob,c,NULL,NULL,NULL,20)
    INTO receipt;
  IF receipt->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Bob can query Alice private workflow history';
  END IF;
  SELECT public.automation_query_run_history(bob,NULL,NULL,NULL,NULL,20)
    INTO receipt;
  IF receipt->>'totalMatching'<>'1' OR
     receipt->'rows'->0->>'workflow_id'<>other::text THEN
    RAISE EXCEPTION 'Bob can see Alice private run metadata';
  END IF;

  -- Exhaust only Alice's rolling 24-hour bulk operation budget.
  FOR i IN 1..9 LOOP
    SELECT public.automation_bulk_toggle_workflows(alice,gen_random_uuid(),
      jsonb_build_array(jsonb_build_object(
        'id',c,'revision',cr,'active',(SELECT active FROM public.automation_workflows WHERE id=c))),
      (i%2=0)) INTO receipt;
    IF receipt->>'ok'<>'true' THEN
      RAISE EXCEPTION 'Bulk request % rejected before quota: %',i,receipt;
    END IF;
  END LOOP;
  SELECT public.automation_bulk_toggle_workflows(alice,gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('id',a,'revision',ar,'active',false)),
    true) INTO receipt;
  IF receipt->>'reason'<>'daily_bulk_limit' THEN
    RAISE EXCEPTION 'Bulk daily quota bypassed: %',receipt;
  END IF;
  SELECT public.automation_bulk_toggle_workflows(alice,key1,batch,false)
    INTO receipt;
  IF receipt->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'Receipt replay was billed after quota reached';
  END IF;

  -- Owner-operated housekeeping cannot delete another account's receipts.
  UPDATE public.automation_bulk_workflow_receipts
    SET created_at=pg_catalog.statement_timestamp()-interval '8 days'
    WHERE user_id=alice AND request_key=key1;
  SELECT public.automation_prune_bulk_receipts(bob) INTO receipt;
  IF receipt->>'deleted'<>'0' THEN
    RAISE EXCEPTION 'Bob pruned Alice receipts';
  END IF;
  SELECT public.automation_prune_bulk_receipts(alice) INTO receipt;
  IF (receipt->>'deleted')::int<1 THEN
    RAISE EXCEPTION 'Old owner receipt not pruned';
  END IF;
  RAISE NOTICE 'Real bulk actions, owner quota, replay, keyset history and privacy all pass';
END;
$$;
DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_bulk_workflow_receipts','SELECT')
    OR has_table_privilege('anon','public.automation_bulk_workflow_receipts','INSERT')
    OR has_function_privilege('authenticated',
      'public.automation_bulk_toggle_workflows(uuid,uuid,jsonb,boolean)','EXECUTE')
    OR has_function_privilege('anon',
      'public.automation_query_run_history(uuid,uuid,text,timestamptz,uuid,integer)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.automation_prune_bulk_receipts(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Privileged Automation operation accessible to browser';
  END IF;
END;
$$;