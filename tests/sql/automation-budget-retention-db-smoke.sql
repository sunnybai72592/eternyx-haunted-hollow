-- Disposable PostgreSQL 17 acceptance: budgeted signed webhooks and private
-- approval cleanup. Apply after all prior Automation migrations and both 2E migrations.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  workflow_id uuid;
  trigger_id uuid;
  old_version integer;
  first_request uuid:=gen_random_uuid();
  second_request uuid:=gen_random_uuid();
  approve_request uuid:=gen_random_uuid();
  reject_id uuid;
  approved_id uuid;
  expired_id uuid;
  result jsonb;
  steps jsonb:='[{"id":"x","kind":"trim"}]'::jsonb;
  trace jsonb:='[{"id":"x","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":3,"afterChars":3,"changed":false}]'::jsonb;
BEGIN
  SELECT public.automation_save_workflow(alice,'Budget test',steps,NULL) INTO result;
  workflow_id:=(result->>'workflow_id')::uuid;
  SELECT public.automation_register_webhook(alice,workflow_id,repeat('a',96),repeat('b',24),false) INTO result;
  trigger_id:=(result->>'trigger_id')::uuid;
  SELECT credential_version INTO old_version FROM public.automation_webhook_triggers WHERE id=trigger_id;
  IF workflow_id IS NULL OR trigger_id IS NULL THEN RAISE EXCEPTION 'fixture setup failed'; END IF;
  IF (SELECT daily_execution_limit<>30 OR daily_submission_limit<>40
      OR allowed_scope<>'text_transform' FROM public.automation_webhook_triggers WHERE id=trigger_id) THEN
    RAISE EXCEPTION 'unexpected default usage/permission limits';
  END IF;
  SELECT public.automation_set_webhook_limits(bob,trigger_id,1,1) INTO result;
  IF result->>'reason'<>'not_found' THEN RAISE EXCEPTION 'cross-owner budgets modified'; END IF;
  SELECT public.automation_set_webhook_limits(alice,trigger_id,0,1) INTO result;
  IF result->>'reason'<>'invalid_request' THEN RAISE EXCEPTION 'zero execution budget accepted'; END IF;
  SELECT public.automation_set_webhook_limits(alice,trigger_id,31,1) INTO result;
  IF result->>'reason'<>'invalid_request' THEN RAISE EXCEPTION 'out-of-range execution budget accepted'; END IF;
  SELECT public.automation_set_webhook_limits(alice,trigger_id,1,0) INTO result;
  IF result->>'reason'<>'invalid_request' THEN RAISE EXCEPTION 'zero submission budget accepted'; END IF;
  SELECT public.automation_set_webhook_limits(alice,trigger_id,1,1) INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'owner budget edit failed'; END IF;
  PERFORM public.automation_set_webhook_enabled(alice,trigger_id,true);
  SELECT public.automation_record_webhook_run(
    trigger_id,alice,workflow_id,1,first_request,repeat('a',64),
    1,1,3,3,trace,old_version
  ) INTO result;
  IF result->>'ok'<>'true' OR result->>'already_recorded'<>'false' THEN
    RAISE EXCEPTION 'first signed execution refused: %',result;
  END IF;
  SELECT public.automation_record_webhook_run(
    trigger_id,alice,workflow_id,1,first_request,repeat('a',64),
    1,1,3,3,trace,old_version
  ) INTO result;
  IF result->>'already_recorded'<>'true' THEN
    RAISE EXCEPTION 'identical replay incorrectly consumed quota: %',result;
  END IF;
  SELECT public.automation_record_webhook_run(
    trigger_id,alice,workflow_id,1,second_request,repeat('b',64),
    1,1,3,3,trace,old_version
  ) INTO result;
  IF result->>'reason'<>'trigger_run_limit' THEN
    RAISE EXCEPTION 'per-webhook direct execution budget bypassed: %',result;
  END IF;

  -- Independent intake cap on the signed approval queue.
  PERFORM public.automation_set_webhook_approval(alice,trigger_id,true);
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,workflow_id,1,old_version,gen_random_uuid(),repeat('c',64),
    repeat('f',38),repeat('e',24),3
  ) INTO result;
  reject_id:=(result->>'approval_id')::uuid;
  IF result->>'ok'<>'true' OR reject_id IS NULL THEN
    RAISE EXCEPTION 'valid signed approval rejected: %',result;
  END IF;
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,workflow_id,1,old_version,gen_random_uuid(),repeat('c',64),
    repeat('f',38),repeat('e',24),3
  ) INTO result;
  IF result->>'reason'<>'trigger_submission_limit' THEN
    RAISE EXCEPTION 'trigger signed intake budget bypassed: %',result;
  END IF;
  SELECT public.automation_reject_webhook_approval(alice,reject_id) INTO result;
  IF result->>'status'<>'rejected' THEN RAISE EXCEPTION 'owner rejection failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.automation_approval_requests
    WHERE id=reject_id AND (input_ciphertext IS NOT NULL OR input_nonce IS NOT NULL)) THEN
    RAISE EXCEPTION 'rejected sensitive input not scrubbed';
  END IF;
  SELECT public.automation_set_webhook_limits(alice,trigger_id,2,3) INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'limit increase failed'; END IF;

  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,workflow_id,1,old_version,approve_request,repeat('d',64),
    repeat('f',38),repeat('e',24),3
  ) INTO result;
  approved_id:=(result->>'approval_id')::uuid;
  SELECT public.automation_approve_webhook_execution(
    alice,approved_id,1,1,1,3,3,trace
  ) INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'approval under raised execution cap failed: %',result; END IF;
  IF EXISTS (SELECT 1 FROM public.automation_approval_requests
    WHERE id=approved_id AND (input_ciphertext IS NOT NULL OR input_nonce IS NOT NULL)) THEN
    RAISE EXCEPTION 'approved sensitive input not scrubbed';
  END IF;
  SELECT public.automation_enqueue_webhook_approval(
    alice,trigger_id,workflow_id,1,old_version,gen_random_uuid(),repeat('e',64),
    repeat('f',38),repeat('e',24),3
  ) INTO result;
  expired_id:=(result->>'approval_id')::uuid;
  IF expired_id IS NULL THEN RAISE EXCEPTION 'third queue event should be within intake cap'; END IF;
  SELECT public.automation_approve_webhook_execution(
    alice,expired_id,1,1,1,3,3,trace
  ) INTO result;
  IF result->>'reason'<>'trigger_run_limit' THEN
    RAISE EXCEPTION 'approval execution bypassed trigger budget: %',result;
  END IF;
  IF (SELECT status FROM public.automation_approval_requests WHERE id=expired_id)<>'pending' THEN
    RAISE EXCEPTION 'quota refusal changed pending approval status';
  END IF;
  -- Existing pending encrypted data stays private until its 24-hour expiry.
  UPDATE public.automation_approval_requests SET
    created_at=now()-interval '23 hours',
    expires_at=now()-interval '1 second'
  WHERE id=expired_id;
  SELECT public.automation_housekeep_approval_inbox(alice) INTO result;
  IF result->>'ok'<>'true' OR (result->>'expired')::integer<1 THEN
    RAISE EXCEPTION 'expired pending event not scrubbed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.automation_approval_requests
    WHERE id=expired_id AND (status<>'expired' OR input_ciphertext IS NOT NULL OR input_nonce IS NOT NULL)) THEN
    RAISE EXCEPTION 'expired event still retains ciphertext or incorrect status';
  END IF;
  -- Seven-day metadata cleanup happens on a signed intake or owner inbox read,
  -- not by a phantom background task.
  UPDATE public.automation_approval_requests SET
    created_at=now()-interval '8 days',
    expires_at=now()-interval '7 days'
  WHERE id=reject_id;
  SELECT public.automation_housekeep_approval_inbox(bob) INTO result;
  IF result->>'deleted'<>'0' THEN RAISE EXCEPTION 'another owner could purge Alice records'; END IF;
  SELECT public.automation_housekeep_approval_inbox(alice) INTO result;
  IF (result->>'deleted')::integer<1 OR EXISTS (
    SELECT 1 FROM public.automation_approval_requests WHERE id=reject_id
  ) THEN RAISE EXCEPTION 'owner retention cleanup did not prune old metadata'; END IF;
  SELECT public.automation_webhook_usage(bob) INTO result;
  IF result <> '[]'::jsonb THEN RAISE EXCEPTION 'usage exposed another account'; END IF;
  SELECT public.automation_webhook_usage(alice) INTO result;
  IF jsonb_array_length(result)<>1 OR
    (result->0->>'executions_24h')::integer<>2 THEN
    RAISE EXCEPTION 'database usage counts do not match real completed runs: %',result;
  END IF;
  SELECT public.automation_clear_resolved_approvals(bob) INTO result;
  IF result->>'deleted'<>'0' THEN RAISE EXCEPTION 'other user cleared owner history'; END IF;
  SELECT public.automation_clear_resolved_approvals(alice) INTO result;
  IF (result->>'deleted')::integer<2 THEN RAISE EXCEPTION 'owner could not clear resolved/expired audit'; END IF;
  IF (SELECT count(*) FROM public.automation_runs
    WHERE user_id=alice AND webhook_trigger_id=trigger_id)<>2 THEN
    RAISE EXCEPTION 'approval audit deletion wrongly removed completed run history';
  END IF;
  RAISE NOTICE 'Webhook text scopes, 24h budgets, replay, erasure and owner cleanup verified';
END;
$$;

DO $$
BEGIN
 IF has_table_privilege('authenticated','public.automation_approval_requests','SELECT')
 OR has_table_privilege('anon','public.automation_approval_requests','SELECT')
 OR has_function_privilege('authenticated',
   'public.automation_set_webhook_limits(uuid,uuid,integer,integer)','EXECUTE')
 OR has_function_privilege('anon',
   'public.automation_clear_resolved_approvals(uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.automation_webhook_usage(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'browser roles must not have direct budget, cleanup or usage RPC access';
 END IF;
END;
$$;
