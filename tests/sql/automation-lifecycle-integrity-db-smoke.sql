-- Disposable PostgreSQL 17 Phase 2R acceptance:
-- real owner case/event/plan/audit records; deliberate fixture drift to
-- verify checks are not fabricated. No runtime job execution is performed.
DO $$
DECLARE
 alice uuid:='11111111-1111-4111-8111-111111111111';
 bob uuid:='22222222-2222-4222-8222-222222222222';
 wa uuid;wb uuid;run_a uuid;run_a2 uuid;run_b uuid;
 inc uuid;inc_other uuid;bob_inc uuid;plan uuid;evidence uuid;
 r jsonb;check_a jsonb;check_other jsonb;report jsonb;
 runs_before integer;runs_after integer;original_plan_revision integer;
 trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
BEGIN
 SELECT public.automation_save_workflow(alice,'Alice real workflow',
   '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO r;
 wa:=(r->>'workflow_id')::uuid;
 SELECT public.automation_save_workflow(bob,'Bob private workflow',
   '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO r;
 wb:=(r->>'workflow_id')::uuid;
 SELECT public.automation_record_run(alice,wa,1,gen_random_uuid(),
   repeat('a',64),1,1,4,4,trace) INTO r;
 run_a:=(r->>'run_id')::uuid;
 SELECT public.automation_record_run(alice,wa,1,gen_random_uuid(),
   repeat('b',64),1,1,4,4,trace) INTO r;
 run_a2:=(r->>'run_id')::uuid;
 SELECT public.automation_record_run(bob,wb,1,gen_random_uuid(),
   repeat('c',64),1,1,4,4,trace) INTO r;
 run_b:=(r->>'run_id')::uuid;
 IF run_a IS NULL OR run_a2 IS NULL OR run_b IS NULL THEN
   RAISE EXCEPTION 'Missing real owner run records';
 END IF;
 SELECT count(*) INTO runs_before FROM public.automation_runs WHERE user_id=alice;
 SELECT public.automation_open_incident(alice,'completed_run_review',run_a,
   'Alice first actual incident','high','Owner recorded a real case review',
   gen_random_uuid()) INTO r;
 inc:=(r->>'incidentId')::uuid;
 SELECT public.automation_open_incident(alice,'completed_run_review',run_a2,
   'Alice second actual incident','low','Second persisted run is separately reviewed',
   gen_random_uuid()) INTO r;
 inc_other:=(r->>'incidentId')::uuid;
 SELECT public.automation_open_incident(bob,'completed_run_review',run_b,
   'Bob private actual incident','medium','Another tenant real private record',
   gen_random_uuid()) INTO r;
 bob_inc:=(r->>'incidentId')::uuid;
 IF inc IS NULL OR inc_other IS NULL OR bob_inc IS NULL THEN
   RAISE EXCEPTION 'Actual incident sources missing';
 END IF;
 SELECT public.automation_incident_lifecycle_check(bob,inc) INTO r;
 IF r->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Cross-account case consistency data leaked';
 END IF;
 SELECT public.automation_incident_lifecycle_check(alice,inc_other) INTO check_other;
 IF check_other->>'consistent'<>'true' OR
    check_other->>'incidentEventCount'<>'1' OR
    check_other->>'incidentRevision'<>'1' OR
    check_other->>'hasPlan'<>'false' OR
    check_other->>'auditLedgerCount'<>'1' OR
    jsonb_array_length(check_other->'findings')<>0 THEN
   RAISE EXCEPTION 'Valid unplanned event chain flagged incorrectly: %',check_other;
 END IF;
 SELECT public.automation_transition_incident(alice,inc,1,'investigating',
   'Human starts real evidence-backed investigation',gen_random_uuid()) INTO r;
 SELECT public.automation_capture_incident_evidence(alice,inc,'incident_origin',
   inc,gen_random_uuid()) INTO r;
 SELECT id INTO evidence FROM public.automation_incident_evidence
   WHERE user_id=alice AND incident_id=inc LIMIT 1;
 SELECT public.automation_create_investigation_plan(alice,inc,2,
   '["review_evidence"]'::jsonb,gen_random_uuid()) INTO r;
 plan:=(r->>'planId')::uuid;
 SELECT public.automation_acknowledge_investigation_step(alice,plan,1,
   'review_evidence','Owner read actual stored incident evidence',
   gen_random_uuid()) INTO r;
 SELECT public.automation_transition_investigation_plan(alice,plan,2,
   'reviewed','Owner completed the only selected review step',
   gen_random_uuid()) INTO r;
 SELECT public.automation_record_incident_closure_decision(alice,inc,2,3,
   'approve','Manual closure is approved after evidence review',
   gen_random_uuid()) INTO r;
 SELECT public.automation_governed_incident_transition(alice,inc,2,'resolved',
   'Separate owner case resolution was approved',
   gen_random_uuid()) INTO r;
 IF r->>'status'<>'resolved' THEN
   RAISE EXCEPTION 'Owner planned case resolution failed';
 END IF;
 SELECT public.automation_transition_investigation_plan(alice,plan,3,
   'closed','Plan formally closed following separate case resolution',
   gen_random_uuid()) INTO r;
 IF r->>'stage'<>'closed' OR r->>'revision'<>'4' THEN
   RAISE EXCEPTION 'Owner closed plan did not match persisted events';
 END IF;
 SELECT public.automation_record_incident_reopen_decision(alice,inc,3,4,
   evidence,'approve','recurrence',
   'Owner saw a recurrence and approves separate case reopening',
   gen_random_uuid()) INTO r;
 SELECT public.automation_governed_incident_transition(alice,inc,3,
   'investigating','Manual follow-up required for newly reported recurrence',
   gen_random_uuid()) INTO r;
 IF r->>'status'<>'investigating' OR r->>'revision'<>'4' THEN
   RAISE EXCEPTION 'Reopened case fixture failed';
 END IF;
 SELECT public.automation_incident_lifecycle_check(alice,inc) INTO check_a;
 IF check_a->>'ok'<>'true' OR check_a->>'source'<>'owner_case_ledger_consistency'
  OR check_a->>'consistent'<>'true' OR
    check_a->>'incidentEventCount'<>'4' OR
    check_a->>'incidentRevision'<>'4' OR
    check_a->>'capturedEvidenceCount'<>'1' OR
    check_a->>'planRevision'<>'4' OR
    check_a->>'planEventCount'<>'3' OR
    check_a->>'plannedSteps'<>'1' OR
    check_a->>'acknowledgedSteps'<>'1' OR
    check_a->>'historicalClosedPlanAfterReopen'<>'true' OR
    check_a->>'closureApprovalCurrent'<>'false' OR
    check_a->>'reopenApprovalCurrent'<>'false' OR
    check_a->>'cryptographicIntegrityVerified'<>'false' OR
    check_a->>'workerLivenessVerified'<>'false' OR
    check_a->>'externalExecutionTriggered'<>'false' OR
    check_a->'auditProjectionCount' IS DISTINCT FROM
       check_a->'auditLedgerCount' THEN
   RAISE EXCEPTION 'Reopened case review consistency inaccurate: %',check_a;
 END IF;
 SELECT public.automation_incident_readiness_report(alice) INTO report;
 IF report->>'ok'<>'true' OR report->>'source'<>'owner_actual_case_readiness'
   OR report->>'totalOwnerCases'<>'2' OR
    report->>'currentOpen'<>'1' OR
    report->>'currentInvestigating'<>'1' OR
    report->>'currentResolved'<>'0' OR
    report->>'currentHighUnresolved'<>'1' OR
    report->>'currentUnresolvedWithEvidence'<>'1' OR
    report->>'currentUnresolvedWithoutEvidence'<>'1' OR
    report->>'planClosed'<>'1' OR
    report->>'recentCasesScanned'<>'2' OR
    report->>'recentSampleTruncated'<>'false' OR
    report->>'inconsistentCasesInRecentSample'<>'0' OR
    report->>'historicallyClosedPlansInRecentSample'<>'1' OR
    report->>'allCasesIntegrityChecked'<>'true' OR
    jsonb_array_length(report->'recentCases')<>2 OR
    report->>'automaticFailuresMeasured'<>'false' OR
    report->>'cryptographicIntegrityVerified'<>'false' THEN
   RAISE EXCEPTION 'Exact owner-readiness aggregates or sample incorrect: %',report;
 END IF;
 SELECT public.automation_incident_readiness_report(bob) INTO report;
 IF report->>'totalOwnerCases'<>'1' OR report->>'currentOpen'<>'1' OR
    report->>'currentUnresolvedWithoutEvidence'<>'1' OR
    report->>'planClosed'<>'0' OR
    jsonb_array_length(report->'recentCases')<>1 THEN
   RAISE EXCEPTION 'Bob readiness mixed Alice private cases: %',report;
 END IF;
 -- Deliberately corrupt disposable fixture metadata, prove the case checker
 -- detects it and the sample reflects it; then restore the exact fixture.
 UPDATE public.automation_incidents SET revision=99
   WHERE user_id=alice AND id=inc_other;
 SELECT public.automation_incident_lifecycle_check(alice,inc_other) INTO r;
 IF r->>'consistent'<>'false' OR
   NOT (r->'findings' ? 'incident_revision_mismatch') THEN
   RAISE EXCEPTION 'Tampered case revision was not detected: %',r;
 END IF;
 SELECT public.automation_incident_readiness_report(alice) INTO report;
 IF report->>'inconsistentCasesInRecentSample'<>'1' THEN
   RAISE EXCEPTION 'Actual detected mismatch omitted from readiness sample';
 END IF;
 UPDATE public.automation_incidents SET revision=1
   WHERE user_id=alice AND id=inc_other;
 UPDATE public.automation_investigation_plans SET revision=99
   WHERE user_id=alice AND id=plan;
 SELECT public.automation_incident_lifecycle_check(alice,inc) INTO r;
 IF r->>'consistent'<>'false' OR
   NOT (r->'findings' ? 'plan_revision_mismatch') THEN
   RAISE EXCEPTION 'Tampered plan revision was not detected: %',r;
 END IF;
 UPDATE public.automation_investigation_plans SET revision=4
   WHERE user_id=alice AND id=plan;
 SELECT public.automation_incident_lifecycle_check(alice,inc) INTO r;
 IF r->>'consistent'<>'true' THEN
   RAISE EXCEPTION 'Restored real case metadata did not pass: %',r;
 END IF;
 SELECT count(*) INTO runs_after FROM public.automation_runs WHERE user_id=alice;
 IF runs_before<>runs_after THEN
   RAISE EXCEPTION 'Read-only lifecycle inspection triggered a run';
 END IF;
 RAISE NOTICE 'Phase 2R owner-only true ledger checks, observed drift, restoration and truthful bounded readiness passed';
END;
$$;
DO $$
BEGIN
 IF has_function_privilege('authenticated',
     'public.automation_incident_lifecycle_check(uuid,uuid)','EXECUTE')
   OR has_function_privilege('anon',
     'public.automation_incident_readiness_report(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Unauthenticated browser roles can call service-only case integrity';
 END IF;
END;
$$;
