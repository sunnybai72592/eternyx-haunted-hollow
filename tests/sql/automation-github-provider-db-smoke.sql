-- Disposable PostgreSQL 17 acceptance for real public GitHub provider.
-- Runs only after minimal auth fixture and Automation Phase 2F migration.
DO $$
DECLARE
  alice uuid := '11111111-1111-4111-8111-111111111111';
  bob uuid := '22222222-2222-4222-8222-222222222222';
  key1 uuid:=gen_random_uuid();key2 uuid:=gen_random_uuid();
  first_id uuid;second_id uuid;row jsonb;
  metadata jsonb:=jsonb_build_object(
    'name','eternyx-haunted-hollow',
    'fullName','sunnybai72592/eternyx-haunted-hollow',
    'description','Read-only public repository',
    'stars',3,'forks',2,'openIssues',1,'language','TypeScript',
    'archived',false,'defaultBranch','main',
    'url','https://github.com/sunnybai72592/eternyx-haunted-hollow'
  );
BEGIN
  SELECT public.automation_reserve_github_read(
    alice,'sunnybai72592','eternyx-haunted-hollow',key1) INTO row;
  IF row->>'reason'<>'disabled' THEN
    RAISE EXCEPTION 'provider not disabled by default: %',row;
  END IF;
  SELECT public.automation_set_github_read_policy(alice,true,2) INTO row;
  IF row->>'ok'<>'true' OR row->>'daily_limit'<>'2' THEN
    RAISE EXCEPTION 'owner policy rejected: %',row;
  END IF;
  SELECT public.automation_reserve_github_read(
    alice,'sunnybai72592','eternyx-haunted-hollow',key1) INTO row;
  IF row->>'ok'<>'true' OR row->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'valid reservation refused: %',row;
  END IF;
  first_id:=(row->>'call_id')::uuid;
  SELECT public.automation_reserve_github_read(
    alice,'SUNNYBAI72592','eternyx-haunted-hollow',key1) INTO row;
  IF row->>'replayed'<>'true' OR row->>'call_id'<>first_id::text THEN
    RAISE EXCEPTION 'same-key replay not idempotent: %',row;
  END IF;
  SELECT public.automation_reserve_github_read(
    alice,'octocat','Hello-World',key1) INTO row;
  IF row->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'reused request key for a different repo was accepted';
  END IF;
  SELECT public.automation_reserve_github_read(
    alice,'octocat','Hello-World',key2) INTO row;
  IF row->>'reason'<>'request_in_flight' THEN
    RAISE EXCEPTION 'second concurrent provider call accepted';
  END IF;
  SELECT public.automation_finish_github_read(bob,first_id,true,200,metadata,NULL) INTO row;
  IF row->>'reason'<>'stale_call' THEN
    RAISE EXCEPTION 'other owner completed Alice request';
  END IF;
  SELECT public.automation_finish_github_read(alice,first_id,true,200,
    metadata||jsonb_build_object('token','bad'),NULL) INTO row;
  IF row->>'reason'<>'invalid_result' THEN
    RAISE EXCEPTION 'unallowlisted credential field was accepted: %',row;
  END IF;
  SELECT public.automation_finish_github_read(alice,first_id,true,200,metadata,NULL) INTO row;
  IF row->>'ok'<>'true' OR row->>'state'<>'succeeded' THEN
    RAISE EXCEPTION 'valid public metadata not completed: %',row;
  END IF;
  SELECT public.automation_finish_github_read(alice,first_id,true,200,metadata,NULL) INTO row;
  IF row->>'reason'<>'stale_call' THEN
    RAISE EXCEPTION 'completed call was modified by replay';
  END IF;

  SELECT public.automation_reserve_github_read(
    alice,'octocat','Hello-World',key2) INTO row;
  IF row->>'ok'<>'true' OR row->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'second genuine read refused';
  END IF;
  second_id:=(row->>'call_id')::uuid;
  SELECT public.automation_finish_github_read(
    alice,second_id,false,429,NULL,'provider_rate_limited') INTO row;
  IF row->>'ok'<>'true' OR row->>'state'<>'failed' THEN
    RAISE EXCEPTION 'provider rate limit not metered as a failed call';
  END IF;
  SELECT public.automation_reserve_github_read(
    alice,'octocat','Hello-World',gen_random_uuid()) INTO row;
  IF row->>'reason'<>'daily_limit' THEN
    RAISE EXCEPTION 'rolling daily provider budget bypassed: %',row;
  END IF;
  SELECT public.automation_set_github_read_policy(alice,false,2) INTO row;
  SELECT public.automation_reserve_github_read(
    alice,'octocat','Hello-World',gen_random_uuid()) INTO row;
  IF row->>'reason'<>'disabled' THEN
    RAISE EXCEPTION 'disabled integration was still reservable';
  END IF;
  IF (SELECT count(*) FROM public.automation_provider_calls
    WHERE user_id=bob)<>0 THEN
    RAISE EXCEPTION 'Alice calls leaked into Bob account';
  END IF;

  -- Owner-only housekeeping: sanitized output expires after 24 hours;
  -- private attempt history survives up to seven days.
  UPDATE public.automation_provider_calls
    SET created_at=now()-interval '26 hours'
    WHERE id=first_id;
  SELECT public.automation_prune_github_reads(bob) INTO row;
  IF row->>'results_scrubbed'<>'0' THEN
    RAISE EXCEPTION 'Bob scrubbed a different account';
  END IF;
  SELECT public.automation_prune_github_reads(alice) INTO row;
  IF (row->>'results_scrubbed')::int<1 OR
    (SELECT result IS NOT NULL FROM public.automation_provider_calls WHERE id=first_id) THEN
    RAISE EXCEPTION '24-hour result privacy scrubbing failed: %',row;
  END IF;

  UPDATE public.automation_provider_calls
    SET created_at=now()-interval '8 days'
    WHERE id=first_id;
  SELECT public.automation_prune_github_reads(alice) INTO row;
  IF row->>'audit_deleted'<>'1' OR
    EXISTS(SELECT 1 FROM public.automation_provider_calls WHERE id=first_id) THEN
    RAISE EXCEPTION 'seven-day audit pruning failed';
  END IF;
  IF (SELECT count(*) FROM public.automation_provider_calls
    WHERE user_id=alice AND state='failed')<>1 THEN
    RAISE EXCEPTION 'recent failed GitHub call lost its audit';
  END IF;

  PERFORM public.automation_set_github_read_policy(bob,true,1);
  SELECT public.automation_reserve_github_read(
    bob,'octocat','Hello-World',gen_random_uuid()) INTO row;
  IF row->>'ok'<>'true' THEN
    RAISE EXCEPTION 'Bob could not independently reserve a provider read';
  END IF;
  RAISE NOTICE 'GitHub read-only policy, owner isolation, idempotency, quotas and retention verified';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_provider_policies','SELECT')
    OR has_table_privilege('authenticated','public.automation_provider_calls','SELECT')
    OR has_table_privilege('anon','public.automation_provider_calls','INSERT')
    OR has_function_privilege('authenticated',
      'public.automation_reserve_github_read(uuid,text,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.automation_set_github_read_policy(uuid,boolean,integer)','EXECUTE')
    OR has_function_privilege('anon',
      'public.automation_finish_github_read(uuid,uuid,boolean,integer,jsonb,text)','EXECUTE')
  THEN RAISE EXCEPTION 'provider role separation is unsafe'; END IF;
END;
$$;
