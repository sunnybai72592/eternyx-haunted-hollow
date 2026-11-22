-- Isolated PostgreSQL 17 acceptance: actual owner-only counters, immutable
-- metadata-only audit snapshots, quotas, no-retry quarantine and live leases.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  wa uuid;wb uuid;wc uuid;sa uuid;sb uuid;
  export_key uuid:=gen_random_uuid();quarantine_key uuid:=gen_random_uuid();
  observation jsonb;result jsonb;first jsonb;next_rev integer;
  i integer;
  trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
BEGIN
  SELECT public.automation_save_workflow(alice,'Source one',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO result;
  wa:=(result->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(alice,'Source two',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO result;
  wb:=(result->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(bob,'Owner two',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO result;
  wc:=(result->>'workflow_id')::uuid;

  SELECT public.automation_record_run(alice,wa,1,gen_random_uuid(),repeat('a',64),
    1,1,4,4,trace) INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Real owner run missing'; END IF;
  SELECT public.automation_record_run(alice,wb,1,gen_random_uuid(),repeat('b',64),
    1,1,4,4,trace) INTO result;
  SELECT public.automation_record_run(bob,wc,1,gen_random_uuid(),repeat('c',64),
    1,1,4,4,trace) INTO result;

  SELECT public.automation_observability_snapshot(alice) INTO observation;
  IF observation->>'source'<>'measured_database_metadata' OR
     observation->>'runs24h'<>'2' OR observation->>'manual24h'<>'2' OR
     observation->>'webhook24h'<>'0' OR observation->>'scheduled24h'<>'0' OR
     observation->>'successfulExecutionsOnly'<>'true' OR
     observation->>'allAttemptFailuresMeasured'<>'false' OR
     observation->>'liveWorkerVerified'<>'false' OR
     observation->>'externalDeliveryVerified'<>'false' THEN
    RAISE EXCEPTION 'Unsupported live metrics: %',observation;
  END IF;
  SELECT public.automation_observability_snapshot(bob) INTO observation;
  IF observation->>'runs24h'<>'1' THEN RAISE EXCEPTION 'Tenant metrics leaked'; END IF;

  SELECT public.automation_prepare_audit_export(bob,gen_random_uuid(),wa,NULL)
    INTO result;
  IF result->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Cross-owner export allowed'; END IF;
  SELECT public.automation_prepare_audit_export(alice,export_key,wa,'manual')
    INTO first;
  IF first->>'ok'<>'true' OR first->>'replayed'<>'false' OR
     first->'snapshot'->>'included'<>'1' OR
     first->'snapshot'->>'totalMatching'<>'1' OR
     first->'snapshot'->>'truncated'<>'false' OR
     first->'snapshot'->>'rawInputsIncluded'<>'false' OR
     first->'snapshot'->>'rawOutputsIncluded'<>'false' THEN
    RAISE EXCEPTION 'Real audited export invalid: %',first;
  END IF;
  IF first->'snapshot'->'rows'->0 ? 'request_key' OR
     first->'snapshot'->'rows'->0 ? 'request_fingerprint' OR
     first->'snapshot'->'rows'->0 ? 'input' OR
     first->'snapshot'->'rows'->0 ? 'output' THEN
    RAISE EXCEPTION 'Sensitive run fields were exported';
  END IF;
  SELECT public.automation_prepare_audit_export(alice,export_key,wa,'manual')
    INTO result;
  IF result->>'replayed'<>'true' OR
     result->'snapshot' IS DISTINCT FROM first->'snapshot' THEN
    RAISE EXCEPTION 'Same-key snapshot was recomputed or changed';
  END IF;
  SELECT public.automation_prepare_audit_export(alice,export_key,wb,'manual')
    INTO result;
  IF result->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Export key can change scope';
  END IF;

  -- Synthetic test fixtures are inserted as real completed rows solely to
  -- exercise the 100-row hard cap without spending app-level run quota.
  INSERT INTO public.automation_runs(user_id,workflow_id,workflow_revision,
    request_key,request_fingerprint,input_lines,output_lines,
    input_characters,output_characters,trace,created_at)
  SELECT alice,wa,1,gen_random_uuid(),repeat('a',64),1,1,4,4,trace,
    pg_catalog.statement_timestamp()-interval '1 day'-
      pg_catalog.make_interval(mins=>v)
  FROM generate_series(1,101) AS v;
  SELECT public.automation_prepare_audit_export(alice,gen_random_uuid(),NULL,NULL)
    INTO result;
  IF result->>'ok'<>'true' OR
     result->'snapshot'->>'included'<>'100' OR
     result->'snapshot'->>'totalMatching'<>'103' OR
     result->'snapshot'->>'truncated'<>'true' OR
     jsonb_array_length(result->'snapshot'->'rows')<>100 THEN
    RAISE EXCEPTION '100-run cap or truthful truncation failed: %',result;
  END IF;
  FOR i IN 1..3 LOOP
    SELECT public.automation_prepare_audit_export(alice,gen_random_uuid(),NULL,'scheduled')
      INTO result;
    IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Export #% hit quota early',i+2; END IF;
  END LOOP;
  SELECT public.automation_prepare_audit_export(alice,gen_random_uuid(),NULL,NULL)
    INTO result;
  IF result->>'reason'<>'daily_export_limit' THEN
    RAISE EXCEPTION 'Export cap bypassed';
  END IF;
  SELECT public.automation_prepare_audit_export(alice,export_key,wa,'manual')
    INTO result;
  IF result->>'replayed'<>'true' OR
     result->'snapshot' IS DISTINCT FROM first->'snapshot' THEN
    RAISE EXCEPTION 'Old snapshot changed after quota exhausted';
  END IF;
  SELECT public.automation_observability_snapshot(alice) INTO observation;
  IF observation->>'auditExports24h'<>'5' OR
     observation->>'auditExportLimit24h'<>'5' THEN
    RAISE EXCEPTION 'Factual audit quota wrong';
  END IF;

  SELECT public.automation_save_schedule(alice,wa,60,repeat('a',40),
    repeat('b',24),NULL) INTO result;
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner schedule missing'; END IF;
  sa:=(result->>'schedule_id')::uuid;
  SELECT public.automation_save_schedule(bob,wc,60,repeat('a',40),
    repeat('b',24),NULL) INTO result;
  sb:=(result->>'schedule_id')::uuid;
  SELECT public.automation_toggle_schedule(alice,sa,true) INTO result;
  SELECT revision INTO next_rev FROM public.automation_schedules WHERE id=sa;

  SELECT public.automation_quarantine_schedule(bob,sa,next_rev,
    'manual_safety_hold',gen_random_uuid()) INTO result;
  IF result->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Bob quarantined Alice schedule';
  END IF;
  SELECT public.automation_quarantine_schedule(alice,sa,next_rev-1,
    'manual_safety_hold',gen_random_uuid()) INTO result;
  IF result->>'reason'<>'stale_schedule' THEN
    RAISE EXCEPTION 'Stale schedule revision allowed';
  END IF;
  UPDATE public.automation_schedules SET
    lease_token=gen_random_uuid(),
    lease_expires_at=pg_catalog.statement_timestamp()+interval '90 seconds',
    last_status='processing',attempt_count=1
  WHERE id=sa;
  SELECT public.automation_quarantine_schedule(alice,sa,next_rev,
    'stale_lease',quarantine_key) INTO result;
  IF result->>'reason'<>'lease_active' THEN
    RAISE EXCEPTION 'Unexpired worker lease was interrupted';
  END IF;
  UPDATE public.automation_schedules SET
    lease_expires_at=pg_catalog.statement_timestamp()-interval '2 seconds'
  WHERE id=sa;
  SELECT public.automation_observability_snapshot(alice) INTO observation;
  IF observation->>'expiredScheduleLeases'<>'1' OR
     observation->>'activeScheduleLeases'<>'0' THEN
    RAISE EXCEPTION 'Stale lease metrics invented';
  END IF;
  SELECT public.automation_quarantine_schedule(alice,sa,next_rev,
    'stale_lease',quarantine_key) INTO result;
  IF result->>'ok'<>'true' OR result->>'replayed'<>'false' OR
     result->>'enabled'<>'false' OR
     result->>'automaticRetryQueued'<>'false' OR
     result->>'externalExecutionTriggered'<>'false' THEN
    RAISE EXCEPTION 'Lease-expired quarantine failed: %',result;
  END IF;
  IF EXISTS(SELECT 1 FROM public.automation_schedules
    WHERE id=sa AND (enabled<>false OR lease_token IS NOT NULL OR
      lease_expires_at IS NOT NULL OR last_status<>'failed')) THEN
    RAISE EXCEPTION 'Quarantine did not stop future schedule claims';
  END IF;
  SELECT public.automation_quarantine_schedule(alice,sa,next_rev,
    'stale_lease',quarantine_key) INTO result;
  IF result->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'Quarantine replay not idempotent';
  END IF;
  SELECT public.automation_quarantine_schedule(alice,sa,next_rev,
    'unexpected_behavior',quarantine_key) INTO result;
  IF result->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Quarantine request key can change reasons';
  END IF;

  FOR i IN 2..5 LOOP
    SELECT public.automation_toggle_schedule(alice,sa,true) INTO result;
    SELECT revision INTO next_rev FROM public.automation_schedules WHERE id=sa;
    SELECT public.automation_quarantine_schedule(alice,sa,next_rev,
      'manual_safety_hold',gen_random_uuid()) INTO result;
    IF result->>'ok'<>'true' OR result->>'enabled'<>'false' THEN
      RAISE EXCEPTION 'Allowed quarantine #% failed: %',i,result;
    END IF;
  END LOOP;
  SELECT public.automation_toggle_schedule(alice,sa,true) INTO result;
  SELECT revision INTO next_rev FROM public.automation_schedules WHERE id=sa;
  SELECT public.automation_quarantine_schedule(alice,sa,next_rev,
    'manual_safety_hold',gen_random_uuid()) INTO result;
  IF result->>'reason'<>'daily_quarantine_limit' THEN
    RAISE EXCEPTION 'Quarantine daily cap bypassed';
  END IF;
  IF (SELECT enabled FROM public.automation_schedules WHERE id=sa)<>true THEN
    RAISE EXCEPTION 'Rejected quarantine changed schedule state';
  END IF;
  -- Put the test fixture into a safe disabled state.
  SELECT public.automation_toggle_schedule(alice,sa,false) INTO result;
  SELECT public.automation_observability_snapshot(alice) INTO observation;
  IF observation->>'quarantines24h'<>'5' OR
     observation->>'quarantineLimit24h'<>'5' THEN
    RAISE EXCEPTION 'Quarantine counters are not factual';
  END IF;
  SELECT public.automation_prune_audit_recovery(bob) INTO result;
  IF result->>'exports'<>'0' OR result->>'quarantines'<>'0' THEN
    RAISE EXCEPTION 'Bob erased Alice audit metadata';
  END IF;
  UPDATE public.automation_audit_exports
    SET created_at=pg_catalog.statement_timestamp()-interval '8 days'
    WHERE user_id=alice AND request_key=export_key;
  UPDATE public.automation_schedule_quarantines
    SET created_at=pg_catalog.statement_timestamp()-interval '8 days'
    WHERE user_id=alice AND request_key=quarantine_key;
  SELECT public.automation_prune_audit_recovery(alice) INTO result;
  IF (result->>'exports')::integer<1 OR
     (result->>'quarantines')::integer<1 THEN
    RAISE EXCEPTION 'Expired metadata not owner-pruned';
  END IF;
  RAISE NOTICE 'Live counters, immutable capped exports, guarded lease quarantine, quotas and owner isolation passed';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_audit_exports','SELECT')
     OR has_table_privilege('anon','public.automation_schedule_quarantines','INSERT')
     OR has_function_privilege('authenticated',
       'public.automation_prepare_audit_export(uuid,uuid,uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated',
       'public.automation_quarantine_schedule(uuid,uuid,integer,text,uuid)','EXECUTE')
     OR has_function_privilege('anon',
       'public.automation_observability_snapshot(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Audit/recovery privileged object is browser-accessible';
  END IF;
END;
$$;
