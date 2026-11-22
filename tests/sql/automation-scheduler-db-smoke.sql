-- Disposable PostgreSQL 17 acceptance, never production!
-- Bootstrap tests/sql/ctf-range-db-bootstrap.sql then Automation
-- manual, signed webhook, and scheduling migrations in that order.
DO $$
DECLARE
  alice uuid := '11111111-1111-4111-8111-111111111111';
  bob uuid := '22222222-2222-4222-8222-222222222222';
  wf uuid; wf2 uuid; wf3 uuid; wf4 uuid; bobwf uuid;
  sched uuid; sched2 uuid; bobsched uuid;
  lease uuid; lease2 uuid; rev integer;
  r jsonb; claim jsonb; completed jsonb;
  trace jsonb := '[{"id":"x","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":1,"afterChars":1,"changed":false}]'::jsonb;
  steps jsonb := '[{"id":"x","kind":"trim"}]'::jsonb;
  i integer;
BEGIN
  SELECT public.automation_save_workflow(alice,'A',steps,NULL) INTO r; wf := (r->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(alice,'B',steps,NULL) INTO r; wf2 := (r->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(alice,'C',steps,NULL) INTO r; wf3 := (r->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(alice,'D',steps,NULL) INTO r; wf4 := (r->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(bob,'B',steps,NULL) INTO r; bobwf := (r->>'workflow_id')::uuid;
  IF wf IS NULL OR bobwf IS NULL THEN RAISE EXCEPTION 'fixture workflow creation failed'; END IF;

  SELECT public.automation_claim_due_schedule() INTO r;
  IF r->>'reason'<>'disabled' THEN RAISE EXCEPTION 'scheduler not disabled by default: %',r; END IF;
  SELECT public.automation_save_schedule(alice,wf,60,repeat('a',34),repeat('b',24),NULL) INTO r;
  IF r->>'ok'<>'true' OR r->>'enabled'<>'false' THEN RAISE EXCEPTION 'created schedule must be disabled'; END IF;
  sched := (r->>'schedule_id')::uuid;
  SELECT public.automation_save_schedule(alice,wf2,1440,repeat('a',34),repeat('b',24),NULL) INTO r;
  sched2 := (r->>'schedule_id')::uuid;
  SELECT public.automation_save_schedule(alice,wf3,10080,repeat('a',34),repeat('b',24),NULL) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'third schedule refused'; END IF;
  SELECT public.automation_save_schedule(alice,wf4,60,repeat('a',34),repeat('b',24),NULL) INTO r;
  IF r->>'reason'<>'schedule_limit' THEN RAISE EXCEPTION 'schedule cap bypassed'; END IF;

  SELECT public.automation_save_schedule(bob,wf,60,repeat('a',34),repeat('b',24),NULL) INTO r;
  IF r->>'reason'<>'not_found' THEN RAISE EXCEPTION 'cross-owner schedule creation allowed'; END IF;
  SELECT public.automation_toggle_schedule(bob,sched,true) INTO r;
  IF r->>'reason'<>'not_found' THEN RAISE EXCEPTION 'cross-owner schedule toggle allowed'; END IF;
  SELECT public.automation_delete_schedule(bob,sched) INTO r;
  IF r->>'reason'<>'not_found' THEN RAISE EXCEPTION 'cross-owner schedule deletion allowed'; END IF;

  UPDATE public.automation_scheduler_config SET enabled=true WHERE singleton_id=1;
  SELECT public.automation_claim_due_schedule() INTO r;
  IF r->>'reason'<>'empty' THEN RAISE EXCEPTION 'disabled schedules were claimed'; END IF;

  SELECT public.automation_toggle_schedule(alice,sched,true) INTO r;
  IF r->>'enabled'<>'true' THEN RAISE EXCEPTION 'legitimate enable failed'; END IF;
  UPDATE public.automation_schedules SET next_run_at=now()-interval '1 minute' WHERE id=sched;

  SELECT public.automation_claim_due_schedule() INTO claim;
  IF claim->>'ok'<>'true' OR claim->>'schedule_id'<>sched::text THEN
    RAISE EXCEPTION 'due schedule not claimed: %',claim; END IF;
  lease := (claim->>'lease_token')::uuid;
  rev := (claim->>'revision')::integer;
  SELECT public.automation_claim_due_schedule() INTO r;
  IF r->>'reason'<>'empty' THEN RAISE EXCEPTION 'active lease was claimed twice'; END IF;

  SELECT public.automation_complete_scheduled_run(
    sched,gen_random_uuid(),rev,1,repeat('a',64),1,1,1,1,trace,repeat('c',34),repeat('d',24)
  ) INTO r;
  IF r->>'reason'<>'stale_lease' THEN RAISE EXCEPTION 'invalid lease accepted'; END IF;
  SELECT public.automation_fail_scheduled_run(sched,lease,rev) INTO r;
  IF r->>'ok'<>'true' OR r->>'retrying'<>'true' THEN RAISE EXCEPTION 'first retry not recorded'; END IF;
  UPDATE public.automation_schedules SET next_run_at=now()-interval '1 minute' WHERE id=sched;
  SELECT public.automation_claim_due_schedule() INTO claim;
  IF claim->>'ok'<>'true' THEN RAISE EXCEPTION 'retry not reclaimed'; END IF;
  lease2 := (claim->>'lease_token')::uuid;

  SELECT public.automation_complete_scheduled_run(
    sched,lease2,rev,1,repeat('a',64),1,1,1,1,trace,repeat('c',34),repeat('d',24)
  ) INTO completed;
  IF completed->>'ok'<>'true' OR completed->>'already_recorded'<>'false' THEN
    RAISE EXCEPTION 'completion not recorded: %',completed; END IF;
  IF (SELECT count(*) FROM public.automation_runs
      WHERE user_id=alice AND trigger_type='scheduled' AND schedule_id=sched)<>1 THEN
    RAISE EXCEPTION 'scheduled run provenance missing'; END IF;
  IF (SELECT count(*) FROM public.automation_schedule_outputs
      WHERE user_id=alice AND schedule_id=sched AND char_length(output_ciphertext)=34)<>1 THEN
    RAISE EXCEPTION 'encrypted result not retained'; END IF;
  IF (SELECT next_run_at<=now() FROM public.automation_schedules WHERE id=sched) THEN
    RAISE EXCEPTION 'schedule did not advance future interval'; END IF;

  SELECT public.automation_complete_scheduled_run(
    sched,lease2,rev,1,repeat('a',64),1,1,1,1,trace,repeat('c',34),repeat('d',24)
  ) INTO r;
  IF r->>'reason'<>'stale_lease' THEN RAISE EXCEPTION 'old lease was replayed'; END IF;

  -- Force the account to its 30 completed cloud-run daily quota.
  FOR i IN 1..29 LOOP
    SELECT public.automation_record_run(
      alice,wf,1,gen_random_uuid(),repeat('f',64),1,1,1,1,trace
    ) INTO r;
    IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'valid run refused at %: %',i,r; END IF;
  END LOOP;
  UPDATE public.automation_schedules SET next_run_at=now()-interval '1 minute' WHERE id=sched;
  SELECT public.automation_claim_due_schedule() INTO claim;
  SELECT public.automation_complete_scheduled_run(
    sched,(claim->>'lease_token')::uuid,(claim->>'revision')::integer,
    1,repeat('b',64),1,1,1,1,trace,repeat('c',34),repeat('d',24)
  ) INTO r;
  IF r->>'reason'<>'daily_run_limit' THEN RAISE EXCEPTION 'quota bypassed: %',r; END IF;
  SELECT public.automation_defer_scheduled_run(
    sched,(claim->>'lease_token')::uuid,(claim->>'revision')::integer
  ) INTO r;
  IF r->>'deferred'<>'true' OR
     (SELECT enabled IS DISTINCT FROM true OR attempt_count <> 0
      FROM public.automation_schedules WHERE id=sched) THEN
    RAISE EXCEPTION 'quota deferral incorrectly disabled schedule'; END IF;

  -- Pause cancels an in-flight lease and invalidates its revision.
  UPDATE public.automation_schedules SET next_run_at=now()-interval '1 minute' WHERE id=sched;
  SELECT public.automation_claim_due_schedule() INTO claim;
  PERFORM public.automation_toggle_schedule(alice,sched,false);
  SELECT public.automation_complete_scheduled_run(
    sched,(claim->>'lease_token')::uuid,(claim->>'revision')::integer,
    1,repeat('b',64),1,1,1,1,trace,repeat('c',34),repeat('d',24)
  ) INTO r;
  IF r->>'reason'<>'stale_lease' THEN RAISE EXCEPTION 'paused lease finalized'; END IF;

  -- Bound failed retries to three attempts and fail closed.
  PERFORM public.automation_toggle_schedule(alice,sched2,true);
  FOR i IN 1..3 LOOP
    UPDATE public.automation_schedules SET next_run_at=now()-interval '1 minute' WHERE id=sched2;
    SELECT public.automation_claim_due_schedule() INTO claim;
    IF claim->>'ok'<>'true' THEN RAISE EXCEPTION 'retry claim failed %: %',i,claim; END IF;
    SELECT public.automation_fail_scheduled_run(
      sched2,(claim->>'lease_token')::uuid,(claim->>'revision')::integer
    ) INTO r;
    IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'retry failure update rejected'; END IF;
  END LOOP;
  IF (SELECT enabled OR last_status<>'failed' OR attempt_count<>3
      FROM public.automation_schedules WHERE id=sched2) THEN
    RAISE EXCEPTION 'failed job was not disabled after three attempts'; END IF;

  SELECT public.automation_delete_schedule(alice,sched) INTO r;
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'legitimate delete failed'; END IF;
  IF (SELECT count(*) FROM public.automation_schedule_outputs
      WHERE user_id=alice AND schedule_id IS NULL)<>1 THEN
    RAISE EXCEPTION 'historical encrypted output not preserved after delete'; END IF;

  SELECT public.automation_save_schedule(bob,bobwf,60,repeat('a',34),repeat('b',24),NULL) INTO r;
  bobsched := (r->>'schedule_id')::uuid;
  IF bobsched IS NULL THEN RAISE EXCEPTION 'other account rejected'; END IF;

  IF (SELECT count(*) FROM public.automation_runs WHERE user_id=alice)<>30 THEN
    RAISE EXCEPTION 'quota or lease created unexpected runs'; END IF;
  RAISE NOTICE 'Automation scheduler isolation, leases, retention, quotas, retries passed';
END;
$$;

-- No browser role can select ciphertext or invoke service-role scheduling functions.
DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_schedules','SELECT')
     OR has_table_privilege('authenticated','public.automation_schedule_outputs','SELECT')
     OR has_table_privilege('anon','public.automation_schedules','SELECT')
     OR has_table_privilege('authenticated','public.automation_scheduler_config','UPDATE')
     OR has_function_privilege('authenticated',
       'public.automation_claim_due_schedule()','EXECUTE')
     OR has_function_privilege('anon',
       'public.automation_complete_scheduled_run(uuid,uuid,integer,integer,text,integer,integer,integer,integer,jsonb,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'scheduler configuration, ciphertext or worker privileges leaked';
  END IF;
END;
$$;
