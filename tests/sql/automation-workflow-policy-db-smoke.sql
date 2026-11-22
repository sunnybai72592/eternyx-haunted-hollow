-- Disposable Postgres 17 acceptance: one policy controls all recorded runs,
-- owner only, and channel reclassification cannot bypass a deny decision.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  alice_w uuid;bob_w uuid;first_key uuid:=gen_random_uuid();
  first_run uuid;record jsonb;policy jsonb;before_count integer;
  trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
  denied boolean:=false;
BEGIN
  SELECT public.automation_save_workflow(alice,'Owner automation',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO record;
  IF record->>'ok'<>'true' THEN RAISE EXCEPTION 'Could not create Alice workflow: %',record; END IF;
  alice_w:=(record->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(bob,'Bob automation',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO record;
  bob_w:=(record->>'workflow_id')::uuid;

  SELECT public.automation_workflow_policy_status(alice,alice_w) INTO policy;
  IF policy->>'ok'<>'true' OR policy->>'maxInputCharacters'<>'12000'
    OR policy->>'maxOutputCharacters'<>'30000'
    OR policy->>'dailyRunLimit'<>'30'
    OR policy->>'active'<>'true'
    OR policy->>'schedulerConfigEnabled'<>'false'
    OR policy->>'webhookPolicyReady'<>'false'
    OR policy->>'deploymentVerified'<>'false' THEN
    RAISE EXCEPTION 'Default existing-workflow readiness is not factual: %',policy;
  END IF;
  SELECT public.automation_workflow_policy_status(bob,alice_w) INTO policy;
  IF policy->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Bob read Alice execution policy'; END IF;
  SELECT public.automation_set_workflow_policy(bob,alice_w,4,6,2,false,false) INTO policy;
  IF policy->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Bob changed Alice execution policy'; END IF;

  SELECT public.automation_set_workflow_policy(alice,alice_w,-1,6,2,false,false) INTO policy;
  IF policy->>'reason'<>'invalid_policy' THEN RAISE EXCEPTION 'Negative input size accepted'; END IF;
  SELECT public.automation_set_workflow_policy(alice,alice_w,4,30001,2,false,false) INTO policy;
  IF policy->>'reason'<>'invalid_policy' THEN RAISE EXCEPTION 'Oversized output accepted'; END IF;
  SELECT public.automation_set_workflow_policy(alice,alice_w,4,6,0,false,false) INTO policy;
  IF policy->>'reason'<>'invalid_policy' THEN RAISE EXCEPTION 'Zero daily limit accepted'; END IF;
  SELECT public.automation_set_workflow_policy(alice,alice_w,4,6,2,false,false) INTO policy;
  IF policy->>'ok'<>'true' OR policy->>'allowWebhook'<>'false' OR
    policy->>'allowSchedule'<>'false' THEN
    RAISE EXCEPTION 'Owner policy save failed: %',policy;
  END IF;

  SELECT public.automation_workflow_preflight(alice,alice_w,'manual',5,NULL) INTO policy;
  IF policy->>'allowed'<>'false' OR policy->>'reason'<>'policy_input_limit' THEN
    RAISE EXCEPTION 'Preflight failed to block larger input: %',policy;
  END IF;
  SELECT public.automation_workflow_preflight(alice,alice_w,'manual',4,7) INTO policy;
  IF policy->>'reason'<>'policy_output_limit' THEN RAISE EXCEPTION 'Larger output preflight accepted'; END IF;
  SELECT public.automation_workflow_preflight(alice,alice_w,'webhook',4,6) INTO policy;
  IF policy->>'reason'<>'policy_webhook_disabled' THEN
    RAISE EXCEPTION 'Disabled webhook channel preflight accepted: %',policy; END IF;
  SELECT public.automation_workflow_preflight(alice,alice_w,'scheduled',4,6) INTO policy;
  IF policy->>'reason'<>'policy_schedule_disabled' THEN
    RAISE EXCEPTION 'Disabled scheduler channel preflight accepted'; END IF;
  SELECT public.automation_workflow_preflight(alice,alice_w,'manual',4,NULL) INTO policy;
  IF policy->>'allowed'<>'true' OR policy->>'inputChecked'<>'true'
    OR policy->>'outputChecked'<>'false' OR policy->>'policyIsSnapshot'<>'true' THEN
    RAISE EXCEPTION 'Allowed manual preflight claimed output verification: %',policy; END IF;
  SELECT count(*) INTO before_count FROM public.automation_runs WHERE user_id=alice;
  IF before_count<>0 THEN RAISE EXCEPTION 'Preflight executed or recorded run'; END IF;

  SELECT public.automation_record_run(alice,alice_w,1,gen_random_uuid(),repeat('a',64),
    1,1,5,5,trace) INTO record;
  IF record->>'reason'<>'policy_input_limit' THEN
    RAISE EXCEPTION 'Shared record_run did not enforce input cap: %',record; END IF;
  SELECT public.automation_record_run(alice,alice_w,1,gen_random_uuid(),repeat('a',64),
    1,1,4,7,trace) INTO record;
  IF record->>'reason'<>'policy_output_limit' THEN
    RAISE EXCEPTION 'Shared record_run did not enforce output cap'; END IF;

  SELECT public.automation_record_run(alice,alice_w,1,first_key,repeat('a',64),
    1,1,4,6,trace) INTO record;
  IF record->>'ok'<>'true' OR record->>'already_recorded'<>'false' THEN
    RAISE EXCEPTION 'First allowed run failed: %',record; END IF;
  first_run:=(record->>'run_id')::uuid;
  SELECT public.automation_record_run(alice,alice_w,1,first_key,repeat('a',64),
    1,1,4,6,trace) INTO record;
  IF record->>'already_recorded'<>'true' OR record->>'run_id'<>first_run::text THEN
    RAISE EXCEPTION 'Same-key replay created a duplicate run'; END IF;
  SELECT public.automation_record_run(alice,alice_w,1,gen_random_uuid(),repeat('a',64),
    1,1,4,6,trace) INTO record;
  IF record->>'ok'<>'true' THEN RAISE EXCEPTION 'Second allowed run failed'; END IF;
  SELECT public.automation_record_run(alice,alice_w,1,gen_random_uuid(),repeat('a',64),
    1,1,4,6,trace) INTO record;
  IF record->>'reason'<>'policy_daily_limit' THEN
    RAISE EXCEPTION 'Third run bypassed owner daily cap: %',record; END IF;
  SELECT public.automation_workflow_policy_status(alice,alice_w) INTO policy;
  IF policy->>'runsLast24h'<>'2' OR policy->>'manualReady'<>'false' THEN
    RAISE EXCEPTION 'Measured run usage not reflected in readiness'; END IF;
  SELECT public.automation_workflow_policy_status(bob,bob_w) INTO policy;
  IF policy->>'runsLast24h'<>'0' OR policy->>'manualReady'<>'true' THEN
    RAISE EXCEPTION 'Alice limits leaked into Bob account'; END IF;

  -- A webhook/scheduler wrapper first inserts a manual-classified record and
  -- then classifies it, so the database trigger must deny channel changes.
  BEGIN
    UPDATE public.automation_runs SET trigger_type='webhook' WHERE id=first_run;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN denied:=true;
  END;
  IF denied IS NOT TRUE THEN
    RAISE EXCEPTION 'Denied webhook reclassification was accepted'; END IF;
  denied:=false;
  BEGIN
    UPDATE public.automation_runs SET trigger_type='scheduled' WHERE id=first_run;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN denied:=true;
  END;
  IF denied IS NOT TRUE THEN
    RAISE EXCEPTION 'Denied scheduled reclassification was accepted'; END IF;
  IF (SELECT trigger_type FROM public.automation_runs WHERE id=first_run)<>'manual' THEN
    RAISE EXCEPTION 'Blocked channel still modified run history'; END IF;

  -- Owner can relax limits; policy changes do not erase previous real runs.
  SELECT public.automation_set_workflow_policy(alice,alice_w,12000,30000,30,true,true) INTO policy;
  IF policy->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner could not relax policy'; END IF;
  SELECT public.automation_workflow_preflight(alice,alice_w,'webhook',4,6) INTO policy;
  IF policy->>'reason'<>'no_enabled_webhook' THEN
    RAISE EXCEPTION 'Preflight fabricated enabled webhook readiness: %',policy; END IF;
  SELECT public.automation_workflow_preflight(alice,alice_w,'scheduled',4,6) INTO policy;
  IF policy->>'reason'<>'schedule_not_ready' THEN
    RAISE EXCEPTION 'Preflight fabricated a running schedule'; END IF;
  SELECT public.automation_toggle_workflow(alice,alice_w,false) INTO record;
  SELECT public.automation_workflow_preflight(alice,alice_w,'manual',4,6) INTO policy;
  IF policy->>'reason'<>'workflow_paused' THEN
    RAISE EXCEPTION 'Paused workflow falsely approved in preflight'; END IF;
  SELECT public.automation_record_run(alice,alice_w,1,gen_random_uuid(),repeat('a',64),
    1,1,4,6,trace) INTO record;
  IF record->>'reason'<>'not_found_or_paused' THEN
    RAISE EXCEPTION 'Paused workflow unexpectedly wrote a run'; END IF;

  SELECT public.automation_delete_workflow(alice,alice_w) INTO record;
  IF (SELECT count(*) FROM public.automation_workflow_policies WHERE workflow_id=alice_w)<>0 THEN
    RAISE EXCEPTION 'Workflow delete did not cascade private policy'; END IF;
  RAISE NOTICE 'Owner policy input/output caps, daily quotas, deny channels and factual trigger readiness verified';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_workflow_policies','SELECT')
    OR has_table_privilege('anon','public.automation_workflow_policies','INSERT')
    OR has_function_privilege('authenticated',
      'public.automation_set_workflow_policy(uuid,uuid,integer,integer,integer,boolean,boolean)','EXECUTE')
    OR has_function_privilege('anon',
      'public.automation_workflow_policy_status(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.automation_workflow_preflight(uuid,uuid,text,integer,integer)','EXECUTE')
  THEN RAISE EXCEPTION 'Browser gained privileged policy access'; END IF;
END;
$$;
