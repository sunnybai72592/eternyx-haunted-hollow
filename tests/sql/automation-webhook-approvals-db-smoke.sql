-- Disposable PostgreSQL 17 security acceptance. Never run fixture users in prod.
-- Bootstrap auth roles, then apply manual, webhook, schedule, approval migrations.
DO $$
DECLARE
  alice uuid := '11111111-1111-4111-8111-111111111111';
  bob uuid := '22222222-2222-4222-8222-222222222222';
  wf uuid; bobwf uuid; trigger_id uuid; btrigger uuid;
  request_key uuid:=gen_random_uuid();
  approval_id uuid; expired_id uuid; paused_id uuid; rotated_id uuid;
  version_before integer; version_after integer;
  row jsonb; repeated jsonb; trace jsonb :=
    '[{"id":"x","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":3,"afterChars":3,"changed":false}]'::jsonb;
  work_steps jsonb := '[{"id":"x","kind":"trim"}]'::jsonb;
  i integer;
BEGIN
  SELECT public.automation_save_workflow(alice,'Owner workflow',work_steps,NULL) INTO row;
  wf := (row->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(bob,'Other workflow',work_steps,NULL) INTO row;
  bobwf := (row->>'workflow_id')::uuid;
  SELECT public.automation_register_webhook(alice,wf,repeat('a',96),repeat('b',24),false) INTO row;
  trigger_id := (row->>'trigger_id')::uuid;
  SELECT public.automation_register_webhook(bob,bobwf,repeat('c',96),repeat('d',24),false) INTO row;
  btrigger := (row->>'trigger_id')::uuid;
  SELECT credential_version INTO version_before FROM public.automation_webhook_triggers WHERE id=trigger_id;
  IF wf IS NULL OR trigger_id IS NULL THEN RAISE EXCEPTION 'Fixture creation failed'; END IF;

  -- Default direct mode does not accept queued requests, even when signed.
  PERFORM public.automation_set_webhook_enabled(alice,trigger_id,true);
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,1,version_before,request_key,repeat('a',64),
    repeat('f',38),repeat('c',24),3
  ) INTO row;
  IF row->>'reason' <> 'trigger_revoked' THEN
    RAISE EXCEPTION 'direct mode improperly accepted an approval queue request';
  END IF;
  SELECT public.automation_set_webhook_approval(bob,trigger_id,true) INTO row;
  IF row->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'cross-owner policy control accepted'; END IF;
  SELECT public.automation_set_webhook_approval(alice,trigger_id,true) INTO row;
  IF row->>'ok' <> 'true' OR row->>'approval_required' <> 'true' THEN
    RAISE EXCEPTION 'owner review mode refused';
  END IF;

  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,1,version_before,request_key,repeat('a',64),
    repeat('f',38),repeat('c',24),3
  ) INTO row;
  IF row->>'ok' <> 'true' OR row->>'status' <> 'pending'
     OR row->>'reused' <> 'false' THEN
    RAISE EXCEPTION 'valid signed request was not queued: %',row;
  END IF;
  approval_id := (row->>'approval_id')::uuid;
  IF (SELECT count(*) FROM public.automation_runs WHERE user_id=alice) <> 0 THEN
    RAISE EXCEPTION 'queue intake ran a workflow before approval';
  END IF;
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,1,version_before,request_key,repeat('a',64),
    repeat('f',38),repeat('c',24),3
  ) INTO repeated;
  IF repeated->>'reused' <> 'true' OR repeated->>'approval_id' <> approval_id::text THEN
    RAISE EXCEPTION 'signed event replay not idempotent';
  END IF;
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,1,version_before,request_key,repeat('e',64),
    repeat('f',38),repeat('c',24),3
  ) INTO row;
  IF row->>'reason' <> 'idempotency_conflict' THEN
    RAISE EXCEPTION 'changed payload with same request id accepted';
  END IF;

  -- Other accounts cannot reject or approve this user's request.
  SELECT public.automation_reject_webhook_approval(bob,approval_id) INTO row;
  IF row->>'reason' <> 'not_pending' THEN RAISE EXCEPTION 'cross-owner rejection accepted'; END IF;
  SELECT public.automation_approve_webhook_execution(
    bob,approval_id,1,1,1,3,3,trace
  ) INTO row;
  IF row->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'cross-owner approval accepted'; END IF;

  SELECT public.automation_approve_webhook_execution(
    alice,approval_id,1,1,1,3,3,trace
  ) INTO row;
  IF row->>'ok' <> 'true' OR row->>'status' <> 'approved' THEN
    RAISE EXCEPTION 'owner approval failed: %',row;
  END IF;
  IF (SELECT count(*) FROM public.automation_runs
      WHERE user_id=alice AND trigger_type='webhook' AND webhook_trigger_id=trigger_id)<>1 THEN
    RAISE EXCEPTION 'approved event did not produce authenticated webhook run metadata';
  END IF;
  SELECT public.automation_approve_webhook_execution(
    alice,approval_id,1,1,1,3,3,trace
  ) INTO row;
  IF row->>'reason' <> 'not_pending' THEN
    RAISE EXCEPTION 'approved event executed twice';
  END IF;

  -- After workflow revision changes, approval must fail without executing.
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,1,version_before,gen_random_uuid(),repeat('b',64),
    repeat('f',38),repeat('c',24),3
  ) INTO row;
  paused_id := (row->>'approval_id')::uuid;
  PERFORM public.automation_save_workflow(alice,'Changed workflow',work_steps,wf);
  SELECT public.automation_approve_webhook_execution(
    alice,paused_id,1,1,1,3,3,trace
  ) INTO row;
  IF row->>'reason' <> 'stale_workflow' THEN
    RAISE EXCEPTION 'stale workflow revision was approved';
  END IF;
  PERFORM public.automation_reject_webhook_approval(alice,paused_id);

  -- Queue new event on current revision, then rotate secret. Stale key events
  -- cannot be approved even if the trigger is immediately re-enabled.
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,2,version_before,gen_random_uuid(),repeat('c',64),
    repeat('f',38),repeat('c',24),3
  ) INTO row;
  rotated_id := (row->>'approval_id')::uuid;
  PERFORM public.automation_register_webhook(
    alice,wf,repeat('d',96),repeat('e',24),true
  );
  PERFORM public.automation_set_webhook_enabled(alice,trigger_id,true);
  SELECT credential_version INTO version_after FROM public.automation_webhook_triggers
    WHERE id=trigger_id;
  IF version_after<=version_before THEN RAISE EXCEPTION 'credential did not rotate'; END IF;
  SELECT public.automation_approve_webhook_execution(
    alice,rotated_id,2,1,1,3,3,trace
  ) INTO row;
  IF row->>'reason' <> 'trigger_revoked' THEN RAISE EXCEPTION 'old signing key request approved'; END IF;
  PERFORM public.automation_reject_webhook_approval(alice,rotated_id);

  -- Expiration automatically refuses approval and records an expired decision.
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,2,version_after,gen_random_uuid(),repeat('d',64),
    repeat('f',38),repeat('c',24),3
  ) INTO row;
  expired_id := (row->>'approval_id')::uuid;
  UPDATE public.automation_approval_requests
    SET created_at=now()-interval '23 hours',expires_at=now()-interval '1 second'
    WHERE id=expired_id;
  SELECT public.automation_approve_webhook_execution(
    alice,expired_id,2,1,1,3,3,trace
  ) INTO row;
  IF row->>'reason' <> 'expired' OR
      (SELECT status FROM public.automation_approval_requests WHERE id=expired_id)<>'expired' THEN
    RAISE EXCEPTION 'expired approval was not rejected';
  END IF;

  -- Cap pending events to ten: first nine accepted, tenth accepted,
  -- the next one denied. Reject decisions release pending capacity.
  FOR i IN 1..10 LOOP
    SELECT public.automation_enqueue_webhook_approval(
      alice,trigger_id,wf,2,version_after,gen_random_uuid(),repeat('a',64),
      repeat('f',38),repeat('c',24),3
    ) INTO row;
    IF row->>'ok'<>'true' THEN RAISE EXCEPTION 'valid pending event % rejected: %',i,row; END IF;
  END LOOP;
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,2,version_after,gen_random_uuid(),repeat('a',64),
    repeat('f',38),repeat('c',24),3
  ) INTO row;
  IF row->>'reason'<>'pending_limit' THEN RAISE EXCEPTION 'pending limit bypassed: %',row; END IF;
  IF (SELECT count(*) FROM public.automation_runs WHERE user_id=alice)<>1 THEN
    RAISE EXCEPTION 'unsigned/unapproved request consumed a cloud execution quota';
  END IF;

  UPDATE public.automation_approval_requests
    SET status='rejected', decided_at=pg_catalog.statement_timestamp()
    WHERE user_id=alice AND status='pending';

  -- Exactly 40 total submissions in 24 hours (including accepted and
  -- rejected events); the 41st must be rejected without a new row.
  -- Existing events in this transaction: 1 approved + 2 rejected + 1 expired
  -- + 10 rejected = 14. Add 26 more and reject each.
  FOR i IN 1..26 LOOP
    SELECT public.automation_enqueue_webhook_approval(
      alice,trigger_id,wf,2,version_after,gen_random_uuid(),repeat('a',64),
      repeat('f',38),repeat('c',24),3
    ) INTO row;
    IF row->>'ok'<>'true' THEN RAISE EXCEPTION 'accepted daily event % refused: %',i,row; END IF;
    PERFORM public.automation_reject_webhook_approval(alice,(row->>'approval_id')::uuid);
  END LOOP;
  IF (SELECT count(*) FROM public.automation_approval_requests WHERE user_id=alice)<>40 THEN
    RAISE EXCEPTION 'incorrect submission count for daily limit';
  END IF;
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,wf,2,version_after,gen_random_uuid(),repeat('a',64),
    repeat('f',38),repeat('c',24),3
  ) INTO row;
  IF row->>'reason'<>'daily_approval_limit' THEN
    RAISE EXCEPTION 'daily signed intake cap bypassed: %',row;
  END IF;
  RAISE NOTICE 'Signed owner approvals: replay, expiry, isolation, credential fencing, quotas verified';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_approval_requests','SELECT')
     OR has_table_privilege('anon','public.automation_approval_requests','SELECT')
     OR has_table_privilege('authenticated','public.automation_approval_requests','INSERT')
     OR has_function_privilege('authenticated',
       'public.automation_approve_webhook_execution(uuid,uuid,integer,integer,integer,integer,integer,jsonb)','EXECUTE')
     OR has_function_privilege('anon',
       'public.automation_enqueue_webhook_approval(uuid,uuid,uuid,integer,integer,uuid,text,text,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'client role gained ciphertext or private approval RPC access';
  END IF;
END;
$$;
