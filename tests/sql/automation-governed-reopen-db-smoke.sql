-- Offline PostgreSQL 17 Phase 2Q acceptance: planned incident reopening must
-- be explicitly approved, evidence-linked and owner/revision-fenced, including
-- when older RPCs or SQL attempt to bypass the new owner controls.
DO $$
DECLARE
 alice uuid:='11111111-1111-4111-8111-111111111111';
 bob uuid:='22222222-2222-4222-8222-222222222222';
 wa uuid;wb uuid;ra uuid;rb uuid;inc uuid;other_inc uuid;
 plan uuid;evidence uuid;old_status text;old_revision integer;
 hold_key uuid:=gen_random_uuid();approval_key uuid:=gen_random_uuid();
 reopen_key uuid:=gen_random_uuid();
 output jsonb;pre jsonb;history jsonb;traceout jsonb;
 before_runs integer;after_runs integer;
 test_trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":3,"afterChars":3,"changed":false}]'::jsonb;
BEGIN
 SELECT public.automation_save_workflow(alice,'Alice run',
   '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO output;
 wa:=(output->>'workflow_id')::uuid;
 SELECT public.automation_save_workflow(bob,'Bob run',
   '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO output;
 wb:=(output->>'workflow_id')::uuid;
 SELECT public.automation_record_run(alice,wa,1,gen_random_uuid(),repeat('a',64),
   1,1,3,3,test_trace) INTO output;
 ra:=(output->>'run_id')::uuid;
 SELECT public.automation_record_run(bob,wb,1,gen_random_uuid(),repeat('b',64),
   1,1,3,3,test_trace) INTO output;
 rb:=(output->>'run_id')::uuid;
 SELECT count(*) INTO before_runs FROM public.automation_runs WHERE user_id=alice;
 IF ra IS NULL OR rb IS NULL THEN RAISE EXCEPTION 'Missing real run fixtures'; END IF;
 SELECT public.automation_open_incident(alice,'completed_run_review',ra,
   'Real completed run investigation','medium',
   'Manual source-review evidence was inspected',gen_random_uuid()) INTO output;
 inc:=(output->>'incidentId')::uuid;
 SELECT public.automation_open_incident(bob,'completed_run_review',rb,
   'Bob completed run investigation','low',
   'Bob has his own separate private review',gen_random_uuid()) INTO output;
 other_inc:=(output->>'incidentId')::uuid;
 SELECT public.automation_incident_reopen_preflight(bob,inc) INTO output;
 IF output->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Another owner read reopen preflight';
 END IF;
 SELECT public.automation_incident_reopen_history(bob,inc) INTO output;
 IF output->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Another owner read private reopen decisions';
 END IF;
 SELECT public.automation_incident_audit_trace(bob,inc) INTO output;
 IF output->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Another owner read private unified audit trace';
 END IF;
 SELECT public.automation_incident_reopen_preflight(alice,inc) INTO pre;
 IF pre->>'hasPlan'<>'false' OR pre->>'legacyNoPlanPath'<>'true' THEN
   RAISE EXCEPTION 'Unplanned owner case was not legacy compatible';
 END IF;
 SELECT public.automation_transition_incident(alice,inc,1,'investigating',
   'Start real owner investigation for completed run',gen_random_uuid()) INTO output;
 SELECT public.automation_capture_incident_evidence(alice,inc,'incident_origin',
   inc,gen_random_uuid()) INTO output;
 IF output->>'ok'<>'true' THEN RAISE EXCEPTION 'Could not capture actual evidence'; END IF;
 SELECT id INTO evidence FROM public.automation_incident_evidence
   WHERE user_id=alice AND incident_id=inc LIMIT 1;
 SELECT public.automation_create_investigation_plan(alice,inc,2,
   '["review_evidence"]'::jsonb,gen_random_uuid()) INTO output;
 plan:=(output->>'planId')::uuid;
 IF plan IS NULL THEN RAISE EXCEPTION 'Missing evidence-backed plan'; END IF;
 SELECT public.automation_acknowledge_investigation_step(alice,plan,1,
   'review_evidence','Owner reviewed the stored incident origin',gen_random_uuid()) INTO output;
 SELECT public.automation_transition_investigation_plan(alice,plan,2,
   'reviewed','Owner signed all required manual checks',gen_random_uuid()) INTO output;
 IF output->>'stage'<>'reviewed' OR output->>'revision'<>'3' THEN
   RAISE EXCEPTION 'Reviewed plan prerequisite failed: %',output;
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,inc,2,3,
   'approve','Complete reviewed plan before separate resolution',gen_random_uuid()) INTO output;
 SELECT public.automation_governed_incident_transition(alice,inc,2,'resolved',
   'Separate approved case resolution recorded',gen_random_uuid()) INTO output;
 IF output->>'ok'<>'true' OR output->>'revision'<>'3' THEN
   RAISE EXCEPTION 'Could not resolve genuine planned incident: %',output;
 END IF;

 SELECT public.automation_incident_reopen_preflight(alice,inc) INTO pre;
 IF pre->>'eligibleForReview'<>'true' OR pre->>'readyToReopen'<>'false' OR
    pre->>'incidentRevision'<>'3' OR pre->>'evidenceCount'<>'1' OR
    pre->>'planRevision'<>'3' THEN
   RAISE EXCEPTION 'Real resolved case preflight incorrect: %',pre;
 END IF;
 SELECT public.automation_record_incident_reopen_decision(alice,inc,3,3,
   gen_random_uuid(),'approve','recurrence',
   'Invented evidence ID should fail',gen_random_uuid()) INTO output;
 IF output->>'reason'<>'reopen_evidence_not_found' THEN
   RAISE EXCEPTION 'Unrelated or nonexistent evidence accepted';
 END IF;
 SELECT public.automation_record_incident_reopen_decision(bob,inc,3,3,
   evidence,'approve','recurrence','Cross-account approval should fail',
   gen_random_uuid()) INTO output;
 IF output->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Cross-account approval permitted';
 END IF;
 SELECT public.automation_record_incident_reopen_decision(alice,inc,2,3,
   evidence,'approve','recurrence',
   'Stale incident revision must not be accepted',gen_random_uuid()) INTO output;
 IF output->>'reason'<>'stale_reopen_review' THEN
   RAISE EXCEPTION 'Stale incident revision allowed';
 END IF;
 SELECT public.automation_record_incident_reopen_decision(alice,inc,3,2,
   evidence,'approve','recurrence',
   'Stale plan revision must not be accepted',gen_random_uuid()) INTO output;
 IF output->>'reason'<>'stale_reopen_review' THEN
   RAISE EXCEPTION 'Stale plan revision allowed';
 END IF;
 SELECT public.automation_governed_incident_transition(alice,inc,3,'investigating',
   'Unapproved reopening is prohibited',gen_random_uuid()) INTO output;
 IF output->>'reason'<>'reopen_approval_required' THEN
   RAISE EXCEPTION 'Governed old action permitted unapproved reopening: %',output;
 END IF;
 BEGIN
   PERFORM public.automation_transition_incident(alice,inc,3,'investigating',
     'Original old RPC should fail without approval',gen_random_uuid());
   RAISE EXCEPTION 'Direct old RPC bypassed reopened incident trigger';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
   UPDATE public.automation_incidents SET status='investigating'
     WHERE id=inc AND user_id=alice;
   RAISE EXCEPTION 'Direct SQL update bypassed reopening trigger';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT status FROM public.automation_incidents WHERE id=inc)<>'resolved' THEN
   RAISE EXCEPTION 'Denied reopening mutated status';
 END IF;

 SELECT public.automation_record_incident_reopen_decision(alice,inc,3,3,
   evidence,'hold','recurrence',
   'Manual reviewer requests further discussion',hold_key) INTO output;
 IF output->>'ok'<>'true' OR output->>'decision'<>'hold' OR
    output->>'automaticReopen'<>'false' THEN
   RAISE EXCEPTION 'Manual hold not recorded: %',output;
 END IF;
 SELECT public.automation_record_incident_reopen_decision(alice,inc,3,3,
   evidence,'hold','recurrence',
   'Manual reviewer requests further discussion',hold_key) INTO output;
 IF output->>'replayed'<>'true' THEN
   RAISE EXCEPTION 'Exact replay created another decision';
 END IF;
 SELECT public.automation_record_incident_reopen_decision(alice,inc,3,3,
   evidence,'approve','recurrence',
   'Manual reviewer requests further discussion',hold_key) INTO output;
 IF output->>'reason'<>'idempotency_conflict' THEN
   RAISE EXCEPTION 'Same UUID allowed a changed decision';
 END IF;
 SELECT public.automation_incident_reopen_preflight(alice,inc) INTO pre;
 IF pre->>'readyToReopen'<>'false' OR
    pre->'latestDecision'->>'decision'<>'hold' THEN
   RAISE EXCEPTION 'Hold did not block reopening: %',pre;
 END IF;
 SELECT public.automation_record_incident_reopen_decision(alice,inc,3,3,
   evidence,'approve','recurrence',
   'Manual reviewer approved a separate reopening',approval_key) INTO output;
 IF output->>'ok'<>'true' OR output->>'decision'<>'approve' THEN
   RAISE EXCEPTION 'Approved decision not stored: %',output;
 END IF;
 SELECT public.automation_incident_reopen_preflight(alice,inc) INTO pre;
 IF pre->>'readyToReopen'<>'true' OR pre->>'approvalCurrent'<>'true' OR
    pre->'latestDecision'->>'decision'<>'approve' THEN
   RAISE EXCEPTION 'Latest versioned approval did not enable separate reopening: %',pre;
 END IF;
 SELECT public.automation_incident_reopen_history(alice,inc) INTO history;
 IF history->>'total'<>'2' OR jsonb_array_length(history->'rows')<>2 OR
   history->'rows'->0->>'decision'<>'hold' OR
   history->'rows'->1->>'decision'<>'approve' OR
   history->'rows'->0 ? 'request_key' THEN
   RAISE EXCEPTION 'Private chronological reopening ledger incorrect: %',history;
 END IF;
 SELECT public.automation_governed_incident_transition(alice,inc,3,'investigating',
   'Reopen for separate manual investigation',reopen_key) INTO output;
 IF output->>'ok'<>'true' OR output->>'status'<>'investigating' OR
    output->>'revision'<>'4' THEN
   RAISE EXCEPTION 'Approved separate reopening did not work: %',output;
 END IF;
 SELECT public.automation_governed_incident_transition(alice,inc,3,'investigating',
   'Reopen for separate manual investigation',reopen_key) INTO output;
 IF output->>'replayed'<>'true' THEN
   RAISE EXCEPTION 'Previously successful reopening lost idempotency';
 END IF;
 SELECT public.automation_incident_reopen_preflight(alice,inc) INTO pre;
 IF pre->>'readyToReopen'<>'false' OR pre->>'approvalCurrent'<>'false' THEN
   RAISE EXCEPTION 'Already reopened case claims current reopening approval';
 END IF;
 SELECT public.automation_governed_incident_transition(alice,inc,4,'resolved',
   'Old closure approval must never resolve reopened case',gen_random_uuid()) INTO output;
 IF output->>'reason'<>'closure_approval_required' THEN
   RAISE EXCEPTION 'Old closure decision survived incident version change';
 END IF;

 SELECT public.automation_incident_audit_trace(alice,inc) INTO traceout;
 IF traceout->>'ok'<>'true' OR traceout->>'source'<>'owner_database_audit_trace' OR
    traceout->>'containsNotes'<>'false' OR
    traceout->>'containsCredentials'<>'false' OR
    traceout->>'truncated'<>'false' OR
    traceout->>'externalExecutionTriggered'<>'false' OR
    jsonb_array_length(traceout->'rows')<9 THEN
   RAISE EXCEPTION 'Factual owner audit trace incomplete: %',traceout;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(traceout->'rows') AS x(item)
   WHERE x.item ? 'note' OR x.item ? 'request_key' OR
     x.item->'metadata' ? 'note' OR x.item->'metadata' ? 'secret') THEN
   RAISE EXCEPTION 'Metadata trace exposed confidential note or token field';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(traceout->'rows') AS x(item)
   WHERE x.item->>'kind'='reopen_decision') OR
   NOT EXISTS(SELECT 1 FROM jsonb_array_elements(traceout->'rows') AS x(item)
   WHERE x.item->>'kind'='closure_decision') OR
   NOT EXISTS(SELECT 1 FROM jsonb_array_elements(traceout->'rows') AS x(item)
   WHERE x.item->>'kind'='evidence_capture') OR
   NOT EXISTS(SELECT 1 FROM jsonb_array_elements(traceout->'rows') AS x(item)
   WHERE x.item->>'kind'='plan_review') OR
   NOT EXISTS(SELECT 1 FROM jsonb_array_elements(traceout->'rows') AS x(item)
   WHERE x.item->>'kind'='incident_status') THEN
   RAISE EXCEPTION 'Unified trace omitted one of the five actual ledgers';
 END IF;
 SELECT count(*) INTO after_runs FROM public.automation_runs WHERE user_id=alice;
 IF before_runs<>after_runs THEN
   RAISE EXCEPTION 'Manual reopening/reporting executed a workflow';
 END IF;
 RAISE NOTICE 'Phase 2Q: owner evidence, hard reopening trigger, latest decision, idempotency and five-ledger audit passed';
END;
$$;
DO $$
BEGIN
 IF has_table_privilege('authenticated',
     'public.automation_incident_reopen_decisions','SELECT')
   OR has_table_privilege('anon',
     'public.automation_incident_reopen_decisions','INSERT')
   OR has_function_privilege('authenticated',
     'public.automation_record_incident_reopen_decision(uuid,uuid,integer,integer,uuid,text,text,text,uuid)','EXECUTE')
   OR has_function_privilege('anon',
     'public.automation_incident_reopen_preflight(uuid,uuid)','EXECUTE')
   OR has_function_privilege('authenticated',
     'public.automation_incident_audit_trace(uuid,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Browser roles can access privileged reopening or owner trace';
 END IF;
END;
$$;
