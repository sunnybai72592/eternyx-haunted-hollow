-- Disposable offline PostgreSQL 17 verification of real metadata-only
-- evidence capture, tenant binding, immutable retries, measured case
-- reporting and passive schedule recovery readiness.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  wa uuid;wa2 uuid;wb uuid;
  run_a uuid;run_a2 uuid;run_other uuid;run_b uuid;
  inc uuid;inc_b uuid;inc_other uuid;
  schedule_id uuid;quarantine_key uuid:=gen_random_uuid();
  created_key uuid:=gen_random_uuid();capture_key uuid:=gen_random_uuid();
  review_key uuid:=gen_random_uuid();rev integer;
  output jsonb;first jsonb;records jsonb;report jsonb;check_state jsonb;
  history jsonb;start_run_count integer;end_run_count integer;idx integer;
  trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
BEGIN
  SELECT public.automation_save_workflow(alice,'Alice workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO output;
  wa:=(output->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(alice,'Second Alice workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO output;
  wa2:=(output->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(bob,'Bob workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO output;
  wb:=(output->>'workflow_id')::uuid;

  SELECT public.automation_record_run(alice,wa,1,gen_random_uuid(),repeat('a',64),
    1,1,4,4,trace) INTO output;
  run_a:=(output->>'run_id')::uuid;
  SELECT public.automation_record_run(alice,wa,1,gen_random_uuid(),repeat('b',64),
    1,1,4,4,trace) INTO output;
  run_a2:=(output->>'run_id')::uuid;
  SELECT public.automation_record_run(alice,wa2,1,gen_random_uuid(),repeat('c',64),
    1,1,4,4,trace) INTO output;
  run_other:=(output->>'run_id')::uuid;
  SELECT public.automation_record_run(bob,wb,1,gen_random_uuid(),repeat('d',64),
    1,1,4,4,trace) INTO output;
  run_b:=(output->>'run_id')::uuid;
  IF run_a IS NULL OR run_b IS NULL OR run_other IS NULL THEN
    RAISE EXCEPTION 'Missing real run evidence fixtures';
  END IF;
  SELECT count(*) INTO start_run_count FROM public.automation_runs
    WHERE user_id=alice;

  SELECT public.automation_open_incident(alice,'completed_run_review',run_a,
    'Review completed run metrics','high','Record actual nonsecret evidence',created_key)
    INTO output;
  IF output->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner incident setup failed'; END IF;
  inc:=(output->>'incidentId')::uuid;
  SELECT public.automation_open_incident(alice,'completed_run_review',run_other,
    'Separate workflow case','low','Track another real run in separate workflow',
    gen_random_uuid()) INTO output;
  inc_other:=(output->>'incidentId')::uuid;
  SELECT public.automation_open_incident(bob,'completed_run_review',run_b,
    'Bob owned run review','medium','Private Bob evidence control',
    gen_random_uuid()) INTO output;
  inc_b:=(output->>'incidentId')::uuid;

  -- Foreign users and unrelated workflows must not be attachable evidence.
  SELECT public.automation_capture_incident_evidence(bob,inc,'incident_origin',
    inc,gen_random_uuid()) INTO output;
  IF output->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Bob attached evidence to Alice private incident';
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'completed_run',
    run_b,gen_random_uuid()) INTO output;
  IF output->>'reason'<>'evidence_not_found' THEN
    RAISE EXCEPTION 'Alice accessed foreign run evidence';
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'completed_run',
    run_other,gen_random_uuid()) INTO output;
  IF output->>'reason'<>'unrelated_evidence' THEN
    RAISE EXCEPTION 'Unrelated owner workflow source attached to this case';
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'incident_origin',
    inc_other,gen_random_uuid()) INTO output;
  IF output->>'reason'<>'unrelated_evidence' THEN
    RAISE EXCEPTION 'Incident origins were not fenced';
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'completed_run',
    gen_random_uuid(),gen_random_uuid()) INTO output;
  IF output->>'reason'<>'evidence_not_found' THEN
    RAISE EXCEPTION 'Nonexistent run accepted as evidence';
  END IF;

  SELECT public.automation_capture_incident_evidence(alice,inc,'incident_origin',
    inc,capture_key) INTO first;
  IF first->>'ok'<>'true' OR first->>'replayed'<>'false' OR
    first->>'externalExecutionTriggered'<>'false' OR
    first->'snapshot'->>'capturedFrom'<>'stored_incident_origin' THEN
    RAISE EXCEPTION 'Real origin metadata capture failed: %',first;
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'incident_origin',
    inc,capture_key) INTO output;
  IF output->>'replayed'<>'true' OR
    output->'snapshot' IS DISTINCT FROM first->'snapshot' THEN
    RAISE EXCEPTION 'Same-key replay recomputed evidence';
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'completed_run',
    run_a,capture_key) INTO output;
  IF output->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Source changed under same request key';
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'incident_origin',
    inc,gen_random_uuid()) INTO output;
  IF output->>'reason'<>'already_captured' THEN
    RAISE EXCEPTION 'Duplicate case/source capture was not deduplicated';
  END IF;

  SELECT public.automation_capture_incident_evidence(alice,inc,'completed_run',
    run_a,gen_random_uuid()) INTO output;
  IF output->>'ok'<>'true' OR
     output->'snapshot'->>'triggerType'<>'manual' OR
     output->'snapshot' ? 'input' OR
     output->'snapshot' ? 'output' OR
     output->'snapshot' ? 'request_fingerprint' THEN
    RAISE EXCEPTION 'Completed run evidence copied sensitive data: %',output;
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'completed_run',
    run_a2,gen_random_uuid()) INTO output;
  IF output->>'ok'<>'true' THEN
    RAISE EXCEPTION 'Second legitimate workflow run was rejected';
  END IF;
  SELECT public.automation_incident_evidence_list(alice,inc) INTO records;
  IF records->>'ok'<>'true' OR records->>'total'<>'3' OR
     jsonb_array_length(records->'rows')<>3 OR
     records->>'rawInputsIncluded'<>'false' OR
     records->>'rawOutputsIncluded'<>'false' OR
     records->>'liveWorkerVerified'<>'false' THEN
    RAISE EXCEPTION 'Owner ledger not grounded in three real snapshots: %',records;
  END IF;
  SELECT public.automation_incident_evidence_list(bob,inc) INTO output;
  IF output->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Bob accessed Alice private evidence ledger';
  END IF;
  SELECT public.automation_incident_evidence_list(bob,inc_b) INTO output;
  IF output->>'total'<>'0' THEN
    RAISE EXCEPTION 'Alice private evidence leaked into Bob ledger';
  END IF;

  SELECT public.automation_incident_operational_report(alice,7) INTO report;
  IF report->>'source'<>'database_incident_reporting' OR
     report->>'rangeDays'<>'7' OR
     report->>'casesOpenedInWindow'<>'2' OR
     report->>'currentOpen'<>'2' OR
     report->>'currentHighUnresolved'<>'1' OR
     report->>'capturedEvidenceInWindow'<>'3' OR
     report->>'currentUnresolvedWithEvidence'<>'1' OR
     report->>'currentUnresolvedWithoutEvidence'<>'1' OR
     report->'sourcesInWindow'->>'manualRunReview'<>'2' OR
     report->'severitiesInWindow'->>'high'<>'1' OR
     report->>'automaticDetectionEnabled'<>'false' OR
     report->>'allFailureAttemptsMeasured'<>'false' OR
     report->>'recoveryExecuted'<>'false' OR
     jsonb_array_length(report->'topUnresolvedWorkflows')<>2 THEN
    RAISE EXCEPTION 'Factual report metrics are wrong: %',report;
  END IF;
  SELECT public.automation_incident_operational_report(bob,30) INTO output;
  IF output->>'casesOpenedInWindow'<>'1' OR
     output->>'capturedEvidenceInWindow'<>'0' THEN
    RAISE EXCEPTION 'Cross-tenant report counts leaked';
  END IF;
  SELECT public.automation_incident_operational_report(alice,14) INTO output;
  IF output->>'reason'<>'invalid_request' THEN
    RAISE EXCEPTION 'Unsupported report period accepted';
  END IF;
  SELECT public.automation_transition_incident(alice,inc,1,'investigating',
    'Review the captured completion and source revisions',gen_random_uuid())
    INTO output;
  SELECT public.automation_transition_incident(alice,inc,2,'resolved',
    'Evidence reviewed without triggering a new run',gen_random_uuid())
    INTO output;
  SELECT public.automation_incident_operational_report(alice,7) INTO report;
  IF report->>'currentResolved'<>'1' OR
     report->>'currentOpen'<>'1' OR
     report->>'resolutionEventsInWindow'<>'1' OR
     report->>'currentUnresolvedWithEvidence'<>'0' THEN
    RAISE EXCEPTION 'Resolution decisions were not measured: %',report;
  END IF;

  SELECT public.automation_save_schedule(alice,wa,60,repeat('a',40),
    repeat('b',24),NULL) INTO output;
  schedule_id:=(output->>'schedule_id')::uuid;
  SELECT public.automation_toggle_schedule(alice,schedule_id,true) INTO output;
  SELECT revision INTO rev FROM public.automation_schedules WHERE id=schedule_id;
  SELECT public.automation_capture_incident_evidence(alice,inc,'schedule_state',
    schedule_id,gen_random_uuid()) INTO output;
  IF output->>'ok'<>'true' OR
     output->'snapshot'->>'capturedFrom'<>'scheduled_state_metadata' OR
     output->'snapshot' ? 'input_ciphertext' OR
     output->'snapshot' ? 'lease_token' THEN
    RAISE EXCEPTION 'Schedule snapshot leaked credentials: %',output;
  END IF;
  SELECT public.automation_incident_recovery_check(alice,quarantine_key) INTO output;
  IF output->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Fake quarantine key passed recovery check';
  END IF;
  SELECT public.automation_quarantine_schedule(alice,schedule_id,rev,
    'manual_safety_hold',quarantine_key) INTO output;
  IF output->>'ok'<>'true' THEN RAISE EXCEPTION 'Could not quarantine schedule'; END IF;
  SELECT public.automation_capture_incident_evidence(alice,inc,'quarantine_receipt',
    quarantine_key,gen_random_uuid()) INTO output;
  IF output->>'ok'<>'true' OR
     output->'snapshot'->>'reason'<>'manual_safety_hold' OR
     output->'snapshot' ? 'input_ciphertext' THEN
    RAISE EXCEPTION 'Related real quarantine receipt not captured safely: %',output;
  END IF;
  SELECT public.automation_incident_recovery_check(bob,quarantine_key) INTO output;
  IF output->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Bob inspected Alice quarantine safety check';
  END IF;
  SELECT public.automation_incident_recovery_check(alice,quarantine_key) INTO check_state;
  IF check_state->>'ok'<>'true' OR
     check_state->>'stillDisabled'<>'true' OR
     check_state->>'sameRevision'<>'true' OR
     check_state->>'noLease'<>'true' OR
     check_state->>'manualReviewEligible'<>'true' OR
     check_state->>'separateManualRestoreConsideration'<>'false' OR
     check_state->>'automaticRestore'<>'false' OR
     check_state->>'executed'<>'false' THEN
    RAISE EXCEPTION 'Pre-review quarantine safety state incorrect: %',check_state;
  END IF;
  SELECT public.automation_review_quarantine(alice,quarantine_key,
    'reviewed_for_manual_restore','Separate manual restore reviewed; no execution',
    review_key) INTO output;
  IF output->>'ok'<>'true' THEN RAISE EXCEPTION 'Owner review failed'; END IF;
  SELECT public.automation_incident_recovery_check(alice,quarantine_key) INTO check_state;
  IF check_state->>'reviewExists'<>'true' OR
     check_state->>'reviewDecision'<>'reviewed_for_manual_restore' OR
     check_state->>'manualReviewEligible'<>'false' OR
     check_state->>'separateManualRestoreConsideration'<>'true' THEN
    RAISE EXCEPTION 'Post-review safety flags were not factual: %',check_state;
  END IF;
  IF (SELECT enabled FROM public.automation_schedules WHERE id=schedule_id)<>false THEN
    RAISE EXCEPTION 'Passive safety check re-enabled quarantined schedule';
  END IF;
  SELECT count(*) INTO end_run_count FROM public.automation_runs
    WHERE user_id=alice;
  IF end_run_count<>start_run_count THEN
    RAISE EXCEPTION 'Evidence/report/review actions executed a workflow';
  END IF;
  RAISE NOTICE 'Owner evidence capture, no-secret snapshots, reporting, review and nonexecution pass';
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.automation_incident_evidence','SELECT')
    OR has_table_privilege('anon','public.automation_incident_evidence','INSERT')
    OR has_function_privilege('authenticated',
      'public.automation_capture_incident_evidence(uuid,uuid,text,uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon',
      'public.automation_incident_operational_report(uuid,integer)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.automation_incident_recovery_check(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Incident evidence/report API leaked to browser role';
  END IF;
END;
$$;
