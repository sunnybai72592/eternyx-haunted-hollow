-- Phase 2U, run after real Phase 2T PostgreSQL acceptance fixtures in
-- the same disposable PostgreSQL 17 instance.
-- A source-backed, current Phase 2T positive review is the prerequisite.
DO $$
DECLARE
 alice uuid:='11111111-1111-4111-8111-111111111111';
 bob uuid:='22222222-2222-4222-8222-222222222222';
 inc uuid;pkg uuid;review_id uuid;old_pkg uuid;new_review uuid;
 key_one uuid:=gen_random_uuid();handoff_id uuid;
 assessment jsonb;out jsonb;hist jsonb;current_package jsonb;
 runs_before integer;runs_after integer;n integer;
BEGIN
 SELECT p.id,p.incident_id,r.id INTO pkg,inc,review_id
 FROM public.automation_case_audit_packages p
 JOIN public.automation_case_audit_reviews r ON r.package_id=p.id AND r.user_id=p.user_id
 WHERE p.user_id=alice
   AND r.decision='reviewed_for_manual_release_checklist'
 ORDER BY r.sequence DESC LIMIT 1;
 IF pkg IS NULL OR inc IS NULL OR review_id IS NULL THEN
  RAISE EXCEPTION 'Missing real source-backed reviewed Phase 2T package fixture';
 END IF;
 SELECT count(*) INTO runs_before FROM public.automation_runs WHERE user_id=alice;
 SELECT p.id INTO old_pkg FROM public.automation_case_audit_packages p
 WHERE p.user_id=alice AND p.incident_id=inc AND p.id<>pkg
 ORDER BY p.sequence ASC LIMIT 1;
 SELECT public.automation_case_audit_handoff_assessment(bob,inc) INTO out;
 IF out->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Handoff assessment leaks Alice'; END IF;
 SELECT public.automation_case_audit_handoff_history(bob,pkg) INTO out;
 IF out->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Private owner history leaked'; END IF;
 SELECT public.automation_case_audit_handoff_assessment(alice,inc) INTO assessment;
 IF assessment->>'ok'<>'true' OR
    assessment->>'source'<>'owner_audit_handoff_metadata' OR
    assessment->>'totalPackages'<>'8' OR
    assessment->>'eligibleForManualHandoffCount'<>'1' OR
    assessment->>'currentManualHandoffCount'<>'0' OR
    assessment->>'ciVerified'<>'false' OR
    assessment->>'deploymentVerified'<>'false' OR
    assessment->>'workerVerified'<>'false' OR
    assessment->>'cryptographicProof'<>'false' OR
    assessment->>'twoPersonReviewed'<>'false' OR
    assessment->>'externalExecutionTriggered'<>'false' THEN
   RAISE EXCEPTION 'Real owner handoff assessment inaccurate: %',assessment;
 END IF;
 SELECT value INTO current_package FROM jsonb_array_elements(assessment->'packages')
  WHERE value->>'packageId'=pkg::text;
 IF current_package IS NULL OR
    current_package->>'sourceSnapshotCurrent'<>'true' OR
    current_package->>'eligibleForManualHandoff'<>'true' OR
    current_package->>'freshnessReason'<>'current_owner_review' OR
    current_package->>'latestReviewId'<>review_id::text THEN
   RAISE EXCEPTION 'Current latest reviewed package not eligible: %',current_package;
 END IF;
 SELECT value INTO current_package FROM jsonb_array_elements(assessment->'packages')
  WHERE value->>'packageId'=old_pkg::text;
 IF current_package->>'sourceSnapshotCurrent'<>'false' OR
    current_package->>'manualHandoffCurrent'<>'false' OR
    current_package->>'eligibleForManualHandoff'<>'false' THEN
   RAISE EXCEPTION 'Historical stale package unexpectedly valid';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,review_id,2,
   'Acknowledged selected evidence and current human review',
   true,false,true,true,gen_random_uuid()) INTO out;
 IF out->>'reason'<>'invalid_handoff_attestation' THEN
   RAISE EXCEPTION 'Missing CI nonverification acknowledgement accepted';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,gen_random_uuid(),2,
   'Unsupported human review identity must be denied',
   true,true,true,true,gen_random_uuid()) INTO out;
 IF out->>'reason'<>'latest_manual_review_required' THEN
   RAISE EXCEPTION 'Arbitrary review linked to owner handoff';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,review_id,1,
   'Stale case version must be refused by handoff',
   true,true,true,true,gen_random_uuid()) INTO out;
 IF out->>'reason'<>'stale_handoff_revision' THEN
   RAISE EXCEPTION 'Stale handoff case revision accepted';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(bob,pkg,review_id,2,
   'Another owner cannot sign this review lineage',
   true,true,true,true,gen_random_uuid()) INTO out;
 IF out->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Cross-account handoff was created';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,review_id,2,
   'Owner inspected current package; independent CI and deployment checks remain',
   true,true,true,true,key_one) INTO out;
 IF out->>'ok'<>'true' OR out->>'replayed'<>'false' OR
    out->>'ownerAttestationOnly'<>'true' OR out->>'automaticRelease'<>'false' OR
    out->>'externalExecutionTriggered'<>'false' THEN
   RAISE EXCEPTION 'Human owner handoff receipt missing or claimed execution: %',out;
 END IF;
 handoff_id:=(out->>'handoffId')::uuid;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,review_id,2,
   'Owner inspected current package; independent CI and deployment checks remain',
   true,true,true,true,key_one) INTO out;
 IF out->>'replayed'<>'true' OR out->>'handoffId'<>handoff_id::text THEN
   RAISE EXCEPTION 'Same owner handoff UUID duplicated records';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,review_id,2,
   'Different note must not reuse request key',
   true,true,true,true,key_one) INTO out;
 IF out->>'reason'<>'idempotency_conflict' THEN
   RAISE EXCEPTION 'Changed-intent handoff UUID replay accepted';
 END IF;
 SELECT public.automation_case_audit_handoff_assessment(alice,inc) INTO assessment;
 IF assessment->>'currentManualHandoffCount'<>'1' OR
    assessment->>'eligibleForManualHandoffCount'<>'1' THEN
   RAISE EXCEPTION 'Current actual handoff not recognized';
 END IF;
 SELECT public.automation_case_audit_handoff_history(alice,pkg) INTO hist;
 IF hist->>'source'<>'owner_handoff_receipt_history' OR hist->>'total'<>'1' OR
    jsonb_array_length(hist->'rows')<>1 OR
    hist->'rows'->0->>'review_id'<>review_id::text OR
    hist->'rows'->0 ? 'request_key' OR
    hist->>'releaseVerified'<>'false' THEN
   RAISE EXCEPTION 'Private owner audit handoff history invalid: %',hist;
 END IF;
 -- A newer NEEDS ATTENTION review must supersede current handoff.
 SELECT public.automation_review_case_audit_package(alice,pkg,'needs_attention',
   'Follow up concern supersedes earlier positive review',
   false,false,false,gen_random_uuid()) INTO out;
 IF out->>'ok'<>'true' THEN
   RAISE EXCEPTION 'Could not append real negative human review';
 END IF;
 SELECT public.automation_case_audit_handoff_assessment(alice,inc) INTO assessment;
 SELECT value INTO current_package FROM jsonb_array_elements(assessment->'packages')
  WHERE value->>'packageId'=pkg::text;
 IF current_package->>'freshnessReason'<>'latest_review_needs_attention' OR
    current_package->>'eligibleForManualHandoff'<>'false' OR
    current_package->>'manualHandoffCurrent'<>'false' OR
    assessment->>'currentManualHandoffCount'<>'0' THEN
   RAISE EXCEPTION 'Negative latest owner review did not revoke current handoff';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,review_id,2,
   'Prior positive review cannot authorize handoff after concern',
   true,true,true,true,gen_random_uuid()) INTO out;
 IF out->>'reason'<>'latest_manual_review_required' THEN
   RAISE EXCEPTION 'Old review authorized a new handoff after negative decision';
 END IF;
 -- Positive human re-review is allowed on unchanged source. An earlier
 -- handoff remains historical because it binds to a different review UUID.
 SELECT public.automation_review_case_audit_package(alice,pkg,
  'reviewed_for_manual_release_checklist',
  'Owner checked that the recorded concern was addressed in stored metadata',
  true,true,true,gen_random_uuid()) INTO out;
 IF out->>'ok'<>'true' THEN
   RAISE EXCEPTION 'Could not append new positive owner review';
 END IF;
 SELECT id INTO new_review FROM public.automation_case_audit_reviews
  WHERE user_id=alice AND package_id=pkg ORDER BY sequence DESC LIMIT 1;
 SELECT public.automation_case_audit_handoff_assessment(alice,inc) INTO assessment;
 SELECT value INTO current_package FROM jsonb_array_elements(assessment->'packages')
  WHERE value->>'packageId'=pkg::text;
 IF current_package->>'eligibleForManualHandoff'<>'true' OR
    current_package->>'manualHandoffCurrent'<>'false' OR
    current_package->>'latestHandoffReviewId'<>review_id::text OR
    current_package->>'latestReviewId'<>new_review::text THEN
   RAISE EXCEPTION 'Changed review ID incorrectly revalidated old handoff';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,new_review,2,
   'New positive owner review was checked, independent release steps pending',
   true,true,true,true,gen_random_uuid()) INTO out;
 IF out->>'ok'<>'true' THEN RAISE EXCEPTION 'Fresh manual handoff rejected'; END IF;
 SELECT public.automation_case_audit_handoff_assessment(alice,inc) INTO assessment;
 IF assessment->>'currentManualHandoffCount'<>'1' THEN
  RAISE EXCEPTION 'New handoff not current after matching fresh review';
 END IF;
 -- A real case transition invalidates package freshness and ALL owner
 -- handoff receipts. No automated deploy/CI claim or workflow execution.
 SELECT public.automation_transition_incident(alice,inc,2,'resolved',
  'Case lifecycle moved after manually recorded review',
  gen_random_uuid()) INTO out;
 IF out->>'revision'<>'3' THEN
  RAISE EXCEPTION 'Existing case transition fixture did not advance';
 END IF;
 SELECT public.automation_case_audit_handoff_assessment(alice,inc) INTO assessment;
 SELECT value INTO current_package FROM jsonb_array_elements(assessment->'packages')
   WHERE value->>'packageId'=pkg::text;
 IF current_package->>'freshnessReason'<>'source_changed' OR
    current_package->>'sourceSnapshotCurrent'<>'false' OR
    current_package->>'manualHandoffCurrent'<>'false' OR
    assessment->>'currentManualHandoffCount'<>'0' THEN
  RAISE EXCEPTION 'Stale case revision did not revoke historical handoff';
 END IF;
 SELECT public.automation_attest_case_audit_handoff(alice,pkg,new_review,2,
  'Prior case revision cannot support a current handoff',
  true,true,true,true,gen_random_uuid()) INTO out;
 IF out->>'reason'<>'stale_handoff_revision' THEN
  RAISE EXCEPTION 'Stale case version still allowed fresh handoff';
 END IF;
 SELECT public.automation_case_audit_handoff_history(alice,pkg) INTO hist;
 IF hist->>'total'<>'2' OR jsonb_array_length(hist->'rows')<>2 THEN
  RAISE EXCEPTION 'Historical owner handoff receipts were erased after change';
 END IF;
 SELECT count(*) INTO runs_after FROM public.automation_runs WHERE user_id=alice;
 IF runs_before<>runs_after THEN
  RAISE EXCEPTION 'Handoff review or audit assessment executed a workflow';
 END IF;
 RAISE NOTICE 'Phase 2U owner review lineage, stale invalidation, replay, negative override, historical receipts and zero runs passed';
END;
$$;
DO $$
BEGIN
 IF has_table_privilege('authenticated',
   'public.automation_case_audit_handoffs','SELECT') OR
   has_table_privilege('anon','public.automation_case_audit_handoffs','INSERT') OR
   has_function_privilege('authenticated',
     'public.automation_case_audit_handoff_assessment(uuid,uuid)','EXECUTE') OR
   has_function_privilege('authenticated',
     'public.automation_attest_case_audit_handoff(uuid,uuid,uuid,integer,text,boolean,boolean,boolean,boolean,uuid)','EXECUTE') OR
   has_function_privilege('anon',
     'public.automation_case_audit_handoff_history(uuid,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Browser roles can access owner-only audit handoff RPC';
 END IF;
END;
$$;
