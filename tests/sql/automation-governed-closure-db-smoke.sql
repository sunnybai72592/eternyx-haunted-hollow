-- ETERNYX Phase 2P: offline PostgreSQL 17 acceptance for versioned manual
-- closure decisions and fail-closed legacy endpoint / direct SQL resolution.
DO $$
DECLARE
 alice uuid:='11111111-1111-4111-8111-111111111111';
 bob uuid:='22222222-2222-4222-8222-222222222222';
 wa uuid;wb uuid;run_a uuid;run_b uuid;
 incident uuid;legacy_case uuid;plan uuid;
 out jsonb;pre jsonb;hist jsonb;
 decision_key uuid:=gen_random_uuid();approve_key uuid:=gen_random_uuid();
 resolve_key uuid:=gen_random_uuid();new_rev integer;plan_rev integer;
 runs_before integer;runs_after integer;
 trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
BEGIN
 SELECT public.automation_save_workflow(alice,'Real owner workflow',
   '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO out;
 wa:=(out->>'workflow_id')::uuid;
 SELECT public.automation_save_workflow(bob,'Other owner workflow',
   '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO out;
 wb:=(out->>'workflow_id')::uuid;
 SELECT public.automation_record_run(alice,wa,1,gen_random_uuid(),repeat('a',64),
    1,1,4,4,trace) INTO out;
 run_a:=(out->>'run_id')::uuid;
 SELECT public.automation_record_run(bob,wb,1,gen_random_uuid(),repeat('b',64),
    1,1,4,4,trace) INTO out;
 run_b:=(out->>'run_id')::uuid;
 SELECT public.automation_open_incident(alice,'completed_run_review',run_a,
    'Investigate actual completed run','high','Review the real output metadata safely',
    gen_random_uuid()) INTO out;
 incident:=(out->>'incidentId')::uuid;
 SELECT public.automation_open_incident(bob,'completed_run_review',run_b,
    'Private Bob completed run','low','Separate account controls case',
    gen_random_uuid()) INTO out;
 SELECT count(*) INTO runs_before FROM public.automation_runs WHERE user_id=alice;

 SELECT public.automation_incident_closure_preflight(bob,incident) INTO out;
 IF out->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Cross-tenant closure preflight leaked incident';
 END IF;
 SELECT public.automation_incident_closure_preflight(alice,incident) INTO pre;
 IF pre->>'hasPlan'<>'false' OR pre->>'legacyNoPlanPath'<>'true' OR
    pre->>'readyToResolve'<>'false' THEN
   RAISE EXCEPTION 'Legacy no-plan path mislabeled';
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,1,1,
    'approve','Approval without an investigation plan',gen_random_uuid()) INTO out;
 IF out->>'reason'<>'plan_not_found' THEN
   RAISE EXCEPTION 'Approved nonexistent plan';
 END IF;
 SELECT public.automation_transition_incident(alice,incident,1,'investigating',
    'Manual investigation of stored run metadata',gen_random_uuid()) INTO out;
 IF out->>'ok'<>'true' OR out->>'revision'<>'2' THEN
   RAISE EXCEPTION 'Incident not investigating';
 END IF;
 SELECT public.automation_capture_incident_evidence(alice,incident,
    'incident_origin',incident,gen_random_uuid()) INTO out;
 IF out->>'ok'<>'true' THEN
   RAISE EXCEPTION 'Missing actual evidence';
 END IF;
 SELECT public.automation_create_investigation_plan(alice,incident,2,
   '["review_evidence","document_outcome"]'::jsonb,gen_random_uuid()) INTO out;
 plan:=(out->>'planId')::uuid;
 IF plan IS NULL THEN RAISE EXCEPTION 'No evidence-gated plan created'; END IF;
 SELECT public.automation_incident_closure_preflight(alice,incident) INTO pre;
 IF pre->>'hasPlan'<>'true' OR pre->>'planStage'<>'draft' OR
    pre->>'capturedEvidence'<>'1' OR pre->>'eligibleForApproval'<>'false' THEN
   RAISE EXCEPTION 'Premature closure preflight allowed: %',pre;
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,2,1,
    'approve','Cannot approve a draft investigation',gen_random_uuid()) INTO out;
 IF out->>'reason'<>'closure_not_ready' THEN
   RAISE EXCEPTION 'Draft plan was approved';
 END IF;
 SELECT public.automation_governed_incident_transition(alice,incident,2,'resolved',
    'Closure before manual approval must fail',gen_random_uuid()) INTO out;
 IF out->>'reason'<>'closure_approval_required' THEN
   RAISE EXCEPTION 'Old incident endpoint bypassed unapproved plan';
 END IF;
 -- Even direct use of the older RPC must fail at the table trigger.
 BEGIN
   PERFORM public.automation_transition_incident(alice,incident,2,'resolved',
     'Direct older RPC cannot bypass review',gen_random_uuid());
   RAISE EXCEPTION 'Old RPC bypassed planned resolution trigger';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT status FROM public.automation_incidents WHERE id=incident)<>'investigating' THEN
   RAISE EXCEPTION 'Blocked resolution changed persisted status';
 END IF;
 SELECT public.automation_acknowledge_investigation_step(alice,plan,1,
   'review_evidence','Owner inspected actual evidence snapshot',gen_random_uuid()) INTO out;
 SELECT public.automation_acknowledge_investigation_step(alice,plan,2,
   'document_outcome','Owner documented independent manual findings',
   gen_random_uuid()) INTO out;
 SELECT public.automation_transition_investigation_plan(alice,plan,3,'reviewed',
   'Both manual checklist steps are acknowledged',gen_random_uuid()) INTO out;
 IF out->>'stage'<>'reviewed' OR out->>'revision'<>'4' THEN
   RAISE EXCEPTION 'Manual plan review was not saved';
 END IF;
 SELECT public.automation_incident_closure_preflight(alice,incident) INTO pre;
 IF pre->>'eligibleForApproval'<>'true' OR pre->>'readyToResolve'<>'false' OR
    pre->>'acknowledgedSteps'<>'2' OR pre->>'plannedSteps'<>'2' THEN
   RAISE EXCEPTION 'Incorrect approval eligibility: %',pre;
 END IF;
 SELECT public.automation_record_incident_closure_decision(bob,incident,2,4,
   'approve','Other owner cannot approve incident',gen_random_uuid()) INTO out;
 IF out->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Foreign account approved incident';
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,1,4,
   'approve','Stale incident revision must fail',gen_random_uuid()) INTO out;
 IF out->>'reason'<>'stale_closure_review' THEN
   RAISE EXCEPTION 'Stale incident revision approved';
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,2,3,
   'approve','Stale plan revision must fail',gen_random_uuid()) INTO out;
 IF out->>'reason'<>'stale_closure_review' THEN
   RAISE EXCEPTION 'Stale plan version approved';
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,2,4,
   'defer','Hold until manual review discussion finishes',decision_key) INTO out;
 IF out->>'ok'<>'true' OR out->>'replayed'<>'false' OR
    out->>'automaticallyResolved'<>'false' OR
    out->>'externalExecutionTriggered'<>'false' THEN
   RAISE EXCEPTION 'Deferral receipt invalid: %',out;
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,2,4,
   'defer','Hold until manual review discussion finishes',decision_key) INTO out;
 IF out->>'replayed'<>'true' THEN
   RAISE EXCEPTION 'Deferral UUID replay is not idempotent';
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,2,4,
   'approve','Hold until manual review discussion finishes',decision_key) INTO out;
 IF out->>'reason'<>'idempotency_conflict' THEN
   RAISE EXCEPTION 'Changed decision reused request key';
 END IF;
 SELECT public.automation_incident_closure_preflight(alice,incident) INTO pre;
 IF pre->>'latestDecision' IS NULL OR pre->>'readyToResolve'<>'false' OR
    pre->'latestDecision'->>'decision'<>'defer' THEN
   RAISE EXCEPTION 'Deferral did not block closure: %',pre;
 END IF;
 SELECT public.automation_governed_incident_transition(alice,incident,2,'resolved',
   'Deferral must block separate resolution',gen_random_uuid()) INTO out;
 IF out->>'reason'<>'closure_approval_required' THEN
   RAISE EXCEPTION 'Deferred incident resolved';
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,2,4,
   'approve','Manual closure approved after real plan review',approve_key) INTO out;
 IF out->>'ok'<>'true' OR out->>'decision'<>'approve' THEN
   RAISE EXCEPTION 'Explicit manual approval not stored';
 END IF;
 SELECT public.automation_incident_closure_preflight(alice,incident) INTO pre;
 IF pre->>'readyToResolve'<>'true' OR pre->>'approvalCurrent'<>'true' OR
   pre->'latestDecision'->>'decision'<>'approve' THEN
   RAISE EXCEPTION 'Current approval did not enable separate resolution: %',pre;
 END IF;
 SELECT public.automation_incident_closure_history(bob,incident) INTO out;
 IF out->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Bob read private review decisions'; END IF;
 SELECT public.automation_incident_closure_history(alice,incident) INTO hist;
 IF hist->>'total'<>'2' OR jsonb_array_length(hist->'rows')<>2 OR
    hist->'rows'->0->>'decision'<>'defer' OR
    hist->'rows'->1->>'decision'<>'approve' OR
    hist->'rows'->0 ? 'request_key' THEN
   RAISE EXCEPTION 'Immutable owner review timeline missing/unsafe: %',hist;
 END IF;
 SELECT public.automation_governed_incident_transition(alice,incident,2,'resolved',
   'Resolve separately with current owner approval',resolve_key) INTO out;
 IF out->>'ok'<>'true' OR out->>'status'<>'resolved' OR
    out->>'revision'<>'3' THEN
   RAISE EXCEPTION 'Valid approved resolution failed: %',out;
 END IF;
 SELECT public.automation_governed_incident_transition(alice,incident,2,'resolved',
   'Resolve separately with current owner approval',resolve_key) INTO out;
 IF out->>'replayed'<>'true' THEN
   RAISE EXCEPTION 'Approved resolution replay was not preserved';
 END IF;
 -- Reopened cases need an approval bound to the NEW case revision, not the
 -- old decision. Historical reviewed plan remains immutable, not rerun.
 SELECT public.automation_governed_incident_transition(alice,incident,3,'investigating',
    'Reopen case after new manual evidence concern',gen_random_uuid()) INTO out;
 IF out->>'ok'<>'true' OR out->>'revision'<>'4' THEN
   RAISE EXCEPTION 'Cannot reopen a resolved incident for manual review';
 END IF;
 SELECT public.automation_incident_closure_preflight(alice,incident) INTO pre;
 IF pre->>'readyToResolve'<>'false' OR pre->>'approvalCurrent'<>'false' OR
    pre->'latestDecision'->>'decision'<>'approve' THEN
   RAISE EXCEPTION 'Prior version approval mistakenly authorizes reopened case';
 END IF;
 SELECT public.automation_governed_incident_transition(alice,incident,4,'resolved',
   'Old approval must not close reopened case',gen_random_uuid()) INTO out;
 IF out->>'reason'<>'closure_approval_required' THEN
   RAISE EXCEPTION 'Reopened case bypassed version guard';
 END IF;
 SELECT public.automation_record_incident_closure_decision(alice,incident,4,4,
   'approve','Fresh manual approval after reopening the case',gen_random_uuid()) INTO out;
 IF out->>'ok'<>'true' THEN
   RAISE EXCEPTION 'Fresh approval on reviewed plan rejected';
 END IF;
 SELECT public.automation_governed_incident_transition(alice,incident,4,'resolved',
    'Resolved reopened incident only after fresh review',gen_random_uuid()) INTO out;
 IF out->>'ok'<>'true' OR out->>'revision'<>'5' THEN
   RAISE EXCEPTION 'Freshly approved reopened case could not resolve';
 END IF;
 SELECT count(*) INTO runs_after FROM public.automation_runs WHERE user_id=alice;
 IF runs_after<>runs_before THEN
   RAISE EXCEPTION 'Manual incident closure created execution receipts';
 END IF;
 RAISE NOTICE 'Owner closure preflight, approvals/deferrals, old API trigger, stale fencing, replay and no execution passed';
END;
$$;

DO $$
BEGIN
 IF has_table_privilege('authenticated','public.automation_incident_closure_decisions','SELECT')
  OR has_table_privilege('anon','public.automation_incident_closure_decisions','INSERT')
  OR has_function_privilege('authenticated',
     'public.automation_record_incident_closure_decision(uuid,uuid,integer,integer,text,text,uuid)','EXECUTE')
  OR has_function_privilege('anon',
     'public.automation_incident_closure_preflight(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated',
     'public.automation_governed_incident_transition(uuid,uuid,integer,text,text,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Browser role can access closure governance directly';
 END IF;
END;
$$;
