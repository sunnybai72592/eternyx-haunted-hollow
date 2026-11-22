-- Disposable offline PostgreSQL 17 acceptance: factual evidence-gated,
-- owner-scoped, human-attested investigation planning with no auto execution.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  wf_a uuid;wf_b uuid;run_a uuid;run_b uuid;
  incident_a uuid;incident_b uuid;plan_a uuid;
  create_key uuid:=gen_random_uuid();ack_key uuid:=gen_random_uuid();
  review_key uuid:=gen_random_uuid();close_key uuid:=gen_random_uuid();
  out jsonb;old jsonb;details jsonb;trend jsonb;
  run_count_before integer;run_count_after integer;
  steps jsonb:='["review_evidence","document_outcome"]'::jsonb;
  trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
BEGIN
  SELECT public.automation_save_workflow(alice,'Real Alice workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO out;
  wf_a:=(out->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(bob,'Real Bob workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO out;
  wf_b:=(out->>'workflow_id')::uuid;
  SELECT public.automation_record_run(alice,wf_a,1,gen_random_uuid(),
    repeat('a',64),1,1,4,4,trace) INTO out;
  run_a:=(out->>'run_id')::uuid;
  SELECT public.automation_record_run(bob,wf_b,1,gen_random_uuid(),
    repeat('b',64),1,1,4,4,trace) INTO out;
  run_b:=(out->>'run_id')::uuid;
  IF run_a IS NULL OR run_b IS NULL THEN
    RAISE EXCEPTION 'Could not create real run source';
  END IF;
  SELECT public.automation_open_incident(alice,'completed_run_review',run_a,
    'Review real completion','medium','Investigate actual existing run metadata',
    gen_random_uuid()) INTO out;
  incident_a:=(out->>'incidentId')::uuid;
  SELECT public.automation_open_incident(bob,'completed_run_review',run_b,
    'Review private completion','high','Bob has a private incident metadata record',
    gen_random_uuid()) INTO out;
  incident_b:=(out->>'incidentId')::uuid;
  SELECT count(*) INTO run_count_before FROM public.automation_runs
    WHERE user_id=alice;

  SELECT public.automation_create_investigation_plan(alice,incident_a,1,steps,
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'requires_investigating' THEN
    RAISE EXCEPTION 'Plan was created before case investigation';
  END IF;
  SELECT public.automation_transition_incident(alice,incident_a,1,
    'investigating','Investigating actual run and its source record',
    gen_random_uuid()) INTO out;
  IF out->>'ok'<>'true' OR out->>'revision'<>'2' THEN
    RAISE EXCEPTION 'Could not start verified case investigation';
  END IF;
  SELECT public.automation_create_investigation_plan(alice,incident_a,2,steps,
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'missing_captured_evidence' THEN
    RAISE EXCEPTION 'Evidence-free investigation plan was created';
  END IF;
  SELECT public.automation_capture_incident_evidence(alice,incident_a,
    'incident_origin',incident_a,gen_random_uuid()) INTO out;
  IF out->>'ok'<>'true' THEN
    RAISE EXCEPTION 'Could not capture actual source evidence';
  END IF;
  SELECT public.automation_create_investigation_plan(bob,incident_a,2,steps,
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Bob created an Alice incident plan';
  END IF;
  SELECT public.automation_create_investigation_plan(alice,incident_a,1,steps,
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'stale_incident' THEN
    RAISE EXCEPTION 'Stale incident revision bypassed';
  END IF;
  SELECT public.automation_create_investigation_plan(alice,incident_a,2,
    '["review_evidence","review_evidence"]'::jsonb,gen_random_uuid()) INTO out;
  IF out->>'reason'<>'invalid_steps' THEN
    RAISE EXCEPTION 'Duplicate review steps accepted';
  END IF;
  SELECT public.automation_create_investigation_plan(alice,incident_a,2,
    '["run_arbitrary_code"]'::jsonb,gen_random_uuid()) INTO out;
  IF out->>'reason'<>'invalid_steps' THEN
    RAISE EXCEPTION 'Arbitrary remediation step was accepted';
  END IF;
  SELECT public.automation_create_investigation_plan(alice,incident_a,2,steps,
    create_key) INTO out;
  IF out->>'ok'<>'true' OR out->>'replayed'<>'false' OR
     out->>'stage'<>'draft' OR out->>'noExternalExecution'<>'true' THEN
    RAISE EXCEPTION 'Actual evidence-gated plan creation failed: %',out;
  END IF;
  plan_a:=(out->>'planId')::uuid;
  SELECT public.automation_create_investigation_plan(alice,incident_a,2,steps,
    create_key) INTO out;
  IF out->>'replayed'<>'true' OR out->>'planId'<>plan_a::text THEN
    RAISE EXCEPTION 'Plan create replay was not idempotent';
  END IF;
  SELECT public.automation_create_investigation_plan(alice,incident_a,2,
    '["document_outcome"]'::jsonb,create_key) INTO out;
  IF out->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Plan creation key changed steps';
  END IF;
  SELECT public.automation_create_investigation_plan(alice,incident_a,2,steps,
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'already_exists' THEN
    RAISE EXCEPTION 'Owner incident received duplicate investigation plans';
  END IF;

  SELECT public.automation_read_investigation_plan(bob,incident_a) INTO out;
  IF out->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Cross-tenant investigation plan readable';
  END IF;
  SELECT public.automation_read_investigation_plan(alice,incident_a) INTO details;
  IF details->>'ok'<>'true' OR details->>'evidenceCount'<>'1' OR
     details->'plan'->>'revision'<>'1' OR
     details->'plan'->>'acknowledged'<>'0' OR
     jsonb_array_length(details->'events')<>0 OR
     details->>'externalExecutionTriggered'<>'false' THEN
    RAISE EXCEPTION 'Initial owner investigation detail incorrect: %',details;
  END IF;
  SELECT public.automation_acknowledge_investigation_step(bob,plan_a,1,
    'review_evidence','Not my incident and not my attestation',
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Foreign account acknowledged owner review';
  END IF;
  SELECT public.automation_acknowledge_investigation_step(alice,plan_a,1,
    'verify_schedule_state','Cannot acknowledge an unselected review step',
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'step_not_planned' THEN
    RAISE EXCEPTION 'Unselected manual step was acknowledged';
  END IF;
  SELECT public.automation_transition_investigation_plan(alice,plan_a,1,
    'reviewed','Must not review an incomplete manual checklist',
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'unreviewed_steps' THEN
    RAISE EXCEPTION 'Incomplete plan was approved';
  END IF;
  SELECT public.automation_transition_investigation_plan(alice,plan_a,1,
    'closed','Cannot close plan directly from draft',
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'invalid_plan_transition' THEN
    RAISE EXCEPTION 'Plan was closed without reviewed state';
  END IF;
  SELECT public.automation_acknowledge_investigation_step(alice,plan_a,1,
    'review_evidence','Human reviewed real case evidence receipt',ack_key) INTO out;
  IF out->>'ok'<>'true' OR out->>'replayed'<>'false' OR
     out->>'revision'<>'2' OR out->>'userAttestationOnly'<>'true' THEN
    RAISE EXCEPTION 'Recorded human acknowledgment failed: %',out;
  END IF;
  SELECT public.automation_acknowledge_investigation_step(alice,plan_a,1,
    'review_evidence','Human reviewed real case evidence receipt',ack_key) INTO out;
  IF out->>'replayed'<>'true' OR out->>'revision'<>'2' THEN
    RAISE EXCEPTION 'Human acknowledgment replay duplicated revision';
  END IF;
  SELECT public.automation_acknowledge_investigation_step(alice,plan_a,2,
    'review_evidence','Human reviewed real case evidence receipt',ack_key) INTO out;
  IF out->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Same key accepted a changed expected revision';
  END IF;
  SELECT public.automation_acknowledge_investigation_step(alice,plan_a,1,
    'document_outcome','Stale review should be rejected',
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'stale_plan' THEN
    RAISE EXCEPTION 'Stale review modified plan';
  END IF;
  SELECT public.automation_acknowledge_investigation_step(alice,plan_a,2,
    'review_evidence','The same review cannot be acknowledged twice',
    gen_random_uuid()) INTO out;
  IF out->>'reason'<>'already_acknowledged' THEN
    RAISE EXCEPTION 'Duplicate manual review acknowledgment accepted';
  END IF;
  SELECT public.automation_acknowledge_investigation_step(alice,plan_a,2,
    'document_outcome','Human documented an observation; no job was executed',
    gen_random_uuid()) INTO out;
  IF out->>'ok'<>'true' OR out->>'revision'<>'3' THEN
    RAISE EXCEPTION 'Second planned review step not acknowledged';
  END IF;
  SELECT public.automation_read_investigation_plan(alice,incident_a) INTO details;
  IF details->'plan'->>'acknowledged'<>'2' OR
     jsonb_array_length(details->'events')<>2 THEN
    RAISE EXCEPTION 'Real review timeline did not reflect both notes';
  END IF;
  SELECT public.automation_transition_investigation_plan(alice,plan_a,3,
    'reviewed','All steps manually acknowledged and reviewed',review_key) INTO out;
  IF out->>'ok'<>'true' OR out->>'revision'<>'4' OR
     out->>'stage'<>'reviewed' OR out->>'noExternalExecution'<>'true' THEN
    RAISE EXCEPTION 'Plan reviewed stage was not recorded: %',out;
  END IF;
  SELECT public.automation_transition_investigation_plan(alice,plan_a,3,
    'reviewed','All steps manually acknowledged and reviewed',review_key) INTO out;
  IF out->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'Plan signoff replay was not idempotent';
  END IF;
  SELECT public.automation_transition_investigation_plan(alice,plan_a,4,
    'reviewed','All steps manually acknowledged and reviewed',review_key) INTO out;
  IF out->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Same signoff UUID could change expected revision';
  END IF;
  SELECT public.automation_acknowledge_investigation_step(alice,plan_a,4,
    'review_evidence','Cannot change an already reviewed plan',gen_random_uuid()) INTO out;
  IF out->>'reason'<>'plan_not_draft' THEN
    RAISE EXCEPTION 'Reviewed plan accepted a new step';
  END IF;
  SELECT public.automation_transition_investigation_plan(alice,plan_a,4,
    'closed','Incident not yet resolved separately',close_key) INTO out;
  IF out->>'reason'<>'invalid_plan_transition' THEN
    RAISE EXCEPTION 'Plan closed without case resolution';
  END IF;
  SELECT public.automation_transition_incident(alice,incident_a,2,'resolved',
    'Separate incident resolution after documented manual review',
    gen_random_uuid()) INTO out;
  IF out->>'ok'<>'true' THEN RAISE EXCEPTION 'Incident resolution fixture failed'; END IF;
  SELECT public.automation_transition_investigation_plan(alice,plan_a,4,
    'closed','Incident is resolved after documented review',close_key) INTO out;
  IF out->>'ok'<>'true' OR out->>'stage'<>'closed' OR
     out->>'revision'<>'5' THEN
    RAISE EXCEPTION 'Separate case-gated plan closure failed: %',out;
  END IF;
  SELECT public.automation_read_investigation_plan(alice,incident_a) INTO details;
  IF details->'plan'->>'stage'<>'closed' OR
     jsonb_array_length(details->'events')<>4 OR
     details->'events'->3->>'kind'<>'closed' OR
     details->>'incidentStatus'<>'resolved' THEN
    RAISE EXCEPTION 'Final timeline or case closure inaccurate: %',details;
  END IF;

  SELECT public.automation_incident_daily_trend(alice,7) INTO trend;
  IF trend->>'ok'<>'true' OR trend->>'source'<>'recorded_incident_activity' OR
     trend->>'timezone'<>'UTC' OR trend->>'rangeDays'<>'7' OR
     trend->>'casesOpened'<>'1' OR trend->>'resolutionEvents'<>'1' OR
     jsonb_array_length(trend->'days')<>7 OR
     trend->>'automatedFailureDetection'<>'false' OR
     trend->>'actualWorkerUptimeMeasured'<>'false' OR
     trend->>'externalExecutionTriggered'<>'false' THEN
    RAISE EXCEPTION 'Factual UTC daily trend inaccurate: %',trend;
  END IF;
  SELECT public.automation_incident_daily_trend(alice,30) INTO trend;
  IF jsonb_array_length(trend->'days')<>30 OR
     trend->>'casesOpened'<>'1' OR trend->>'resolutionEvents'<>'1' THEN
    RAISE EXCEPTION '30-day UTC trend did not count real cases';
  END IF;
  SELECT public.automation_incident_daily_trend(bob,7) INTO trend;
  IF trend->>'casesOpened'<>'1' OR trend->>'resolutionEvents'<>'0' THEN
    RAISE EXCEPTION 'Another tenant trend counts leaked';
  END IF;
  SELECT public.automation_incident_daily_trend(alice,14) INTO trend;
  IF trend->>'reason'<>'invalid_request' THEN
    RAISE EXCEPTION 'Unsupported trend period accepted';
  END IF;

  SELECT count(*) INTO run_count_after FROM public.automation_runs
    WHERE user_id=alice;
  IF run_count_after<>run_count_before THEN
    RAISE EXCEPTION 'Review created actual execution receipts';
  END IF;
  RAISE NOTICE 'Incident plans: evidence, owner fencing, immutable review audit, closure and UTC trends pass';
END;
$$;
DO $$
BEGIN
 IF has_table_privilege('authenticated','public.automation_investigation_plans','SELECT')
   OR has_table_privilege('anon','public.automation_investigation_plans','INSERT')
   OR has_table_privilege('authenticated','public.automation_investigation_events','SELECT')
   OR has_function_privilege('authenticated',
      'public.automation_create_investigation_plan(uuid,uuid,integer,jsonb,uuid)','EXECUTE')
   OR has_function_privilege('anon',
      'public.automation_acknowledge_investigation_step(uuid,uuid,integer,text,text,uuid)','EXECUTE')
   OR has_function_privilege('authenticated',
      'public.automation_incident_daily_trend(uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Browser role can call service-only incident review RPC'; END IF;
END;
$$;
