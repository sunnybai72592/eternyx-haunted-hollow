-- Disposable, network-isolated PostgreSQL 17 Phase 2T acceptance:
-- factual owner incident evidence, immutable package snapshots, attested manual
-- reviews, idempotency, staleness, cross-tenant isolation and no execution.
DO $$
DECLARE
 alice uuid:='11111111-1111-4111-8111-111111111111';
 bob uuid:='22222222-2222-4222-8222-222222222222';
 wf_a uuid;wf_b uuid;ra uuid;rb uuid;inc uuid;other_inc uuid;
 proof uuid;other_proof uuid;pkg uuid;new_pkg uuid;req uuid:=gen_random_uuid();
 review_key uuid:=gen_random_uuid();r jsonb;inbox jsonb;
 package_count integer;run_count_before integer;run_count_after integer;
 snap jsonb;num integer;
 trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":4,"afterChars":4,"changed":false}]'::jsonb;
BEGIN
 SELECT public.automation_save_workflow(alice,'Actual owner workflow',
   '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO r;
 wf_a:=(r->>'workflow_id')::uuid;
 SELECT public.automation_save_workflow(bob,'Private second workflow',
   '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO r;
 wf_b:=(r->>'workflow_id')::uuid;
 SELECT public.automation_record_run(alice,wf_a,1,gen_random_uuid(),
    repeat('a',64),1,1,4,4,trace) INTO r;
 ra:=(r->>'run_id')::uuid;
 SELECT public.automation_record_run(bob,wf_b,1,gen_random_uuid(),
    repeat('b',64),1,1,4,4,trace) INTO r;
 rb:=(r->>'run_id')::uuid;
 IF ra IS NULL OR rb IS NULL THEN RAISE EXCEPTION 'Missing real execution source'; END IF;
 SELECT public.automation_open_incident(alice,'completed_run_review',ra,
   'Real owner incident for package','medium',
   'Manual review of stored completed run metadata',gen_random_uuid()) INTO r;
 inc:=(r->>'incidentId')::uuid;
 SELECT public.automation_open_incident(bob,'completed_run_review',rb,
   'Private alternate incident for package','low',
   'Other account retains its own source metadata',gen_random_uuid()) INTO r;
 other_inc:=(r->>'incidentId')::uuid;
 SELECT count(*) INTO run_count_before FROM public.automation_runs
  WHERE user_id=alice;
 SELECT public.automation_create_case_audit_package(alice,inc,1,gen_random_uuid(),
   gen_random_uuid()) INTO r;
 IF r->>'reason'<>'audit_evidence_not_found' THEN
  RAISE EXCEPTION 'Audit package allowed unverified source evidence';
 END IF;
 SELECT public.automation_capture_incident_evidence(alice,inc,'incident_origin',
  inc,gen_random_uuid()) INTO r;
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'Cannot capture real incident source evidence'; END IF;
 SELECT id INTO proof FROM public.automation_incident_evidence
  WHERE user_id=alice AND incident_id=inc;
 SELECT public.automation_capture_incident_evidence(bob,other_inc,'incident_origin',
  other_inc,gen_random_uuid()) INTO r;
 SELECT id INTO other_proof FROM public.automation_incident_evidence
  WHERE user_id=bob AND incident_id=other_inc;
 IF proof IS NULL OR other_proof IS NULL THEN
  RAISE EXCEPTION 'Real owner source receipts missing';
 END IF;
 SELECT public.automation_case_audit_package_inbox(bob,inc) INTO r;
 IF r->>'reason'<>'not_found' THEN
  RAISE EXCEPTION 'Cross-account package inbox exposed';
 END IF;
 SELECT public.automation_create_case_audit_package(bob,inc,1,proof,gen_random_uuid())
 INTO r;
 IF r->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Other owner created Alice package'; END IF;
 SELECT public.automation_create_case_audit_package(alice,inc,1,other_proof,
  gen_random_uuid()) INTO r;
 IF r->>'reason'<>'audit_evidence_not_found' THEN
  RAISE EXCEPTION 'Foreign evidence ID bound to Alice incident';
 END IF;
 SELECT public.automation_create_case_audit_package(alice,inc,2,proof,
  gen_random_uuid()) INTO r;
 IF r->>'reason'<>'stale_incident' THEN
  RAISE EXCEPTION 'Outdated incident revision allowed';
 END IF;
 SELECT public.automation_create_case_audit_package(alice,inc,1,proof,req) INTO r;
 IF r->>'ok'<>'true' OR r->>'replayed'<>'false' OR
    r->>'automaticRelease'<>'false' OR
    r->>'externalExecutionTriggered'<>'false' THEN
  RAISE EXCEPTION 'Verified owner package not captured: %',r;
 END IF;
 pkg:=(r->>'packageId')::uuid;
 SELECT public.automation_create_case_audit_package(alice,inc,1,proof,req) INTO r;
 IF r->>'replayed'<>'true' OR r->>'packageId'<>pkg::text THEN
  RAISE EXCEPTION 'Capture UUID replay created a duplicate';
 END IF;
 SELECT public.automation_create_case_audit_package(alice,inc,2,proof,req) INTO r;
 IF r->>'reason'<>'idempotency_conflict' THEN
  RAISE EXCEPTION 'Capture UUID reused with different incident revision';
 END IF;
 SELECT snapshot INTO snap FROM public.automation_case_audit_packages
   WHERE user_id=alice AND id=pkg;
 IF snap->>'source'<>'owner_case_ledger_consistency' OR
    snap->>'incidentRevision'<>'1' OR
    snap->>'evidenceId'<>proof::text OR
    snap->>'consistent'<>'true' OR
    snap->>'capturedEvidenceCount'<>'1' OR
    snap->>'cryptographicIntegrityVerified'<>'false' OR
    snap->>'releaseDeployed'<>'false' OR
    snap ? 'source_evidence' OR snap ? 'note' OR snap ? 'token' OR
    snap ? 'rawOutput' OR snap ? 'request_key' THEN
  RAISE EXCEPTION 'Immutable snapshot was not source-backed or safe: %',snap;
 END IF;
 SELECT public.automation_case_audit_package_inbox(alice,inc) INTO inbox;
 IF inbox->>'source'<>'owner_audit_packages_metadata' OR
    inbox->>'packageCount'<>'1' OR inbox->>'caseConsistent'<>'true' OR
    jsonb_array_length(inbox->'packages')<>1 OR
    jsonb_array_length(inbox->'evidence')<>1 OR
    inbox->'packages'->0->>'current'<>'true' OR
    inbox->>'rawInputsIncluded'<>'false' OR
    inbox->>'rawOutputsIncluded'<>'false' OR
    inbox->>'releaseVerified'<>'false' THEN
  RAISE EXCEPTION 'Factual package inbox returned fabricated metadata: %',inbox;
 END IF;
 SELECT public.automation_review_case_audit_package(bob,pkg,'needs_attention',
   'Other account must not read or review this case',false,false,false,
   gen_random_uuid()) INTO r;
 IF r->>'reason'<>'not_found' THEN
  RAISE EXCEPTION 'Foreign owner reviewed another account package';
 END IF;
 SELECT public.automation_review_case_audit_package(alice,pkg,
   'reviewed_for_manual_release_checklist',
   'Manual reviewer must acknowledge limitations',
   true,true,false,gen_random_uuid()) INTO r;
 IF r->>'reason'<>'manual_limitations_not_acknowledged' THEN
  RAISE EXCEPTION 'Manual review skipped limitation acknowledgment';
 END IF;
 SELECT public.automation_review_case_audit_package(alice,pkg,'needs_attention',
  'Source metadata needs additional operator inspection',
  false,false,false,review_key) INTO r;
 IF r->>'ok'<>'true' OR r->>'replayed'<>'false' OR
    r->>'manualAttestationOnly'<>'true' OR
    r->>'automaticRelease'<>'false' THEN
  RAISE EXCEPTION 'Manual hold review failed: %',r;
 END IF;
 SELECT public.automation_review_case_audit_package(alice,pkg,'needs_attention',
  'Source metadata needs additional operator inspection',
  false,false,false,review_key) INTO r;
 IF r->>'replayed'<>'true' THEN RAISE EXCEPTION 'Human review retry not idempotent'; END IF;
 SELECT public.automation_review_case_audit_package(alice,pkg,
  'reviewed_for_manual_release_checklist',
  'Source metadata needs additional operator inspection',
  true,true,true,review_key) INTO r;
 IF r->>'reason'<>'idempotency_conflict' THEN
  RAISE EXCEPTION 'Same review UUID could change the decision';
 END IF;
 SELECT public.automation_transition_incident(alice,inc,1,'investigating',
   'Owner changed status after immutable package was captured',
   gen_random_uuid()) INTO r;
 IF r->>'revision'<>'2' THEN RAISE EXCEPTION 'Case status fixture did not advance'; END IF;
 SELECT public.automation_case_audit_package_inbox(alice,inc) INTO inbox;
 IF inbox->'packages'->0->>'current'<>'false' THEN
  RAISE EXCEPTION 'Package was not invalidated by case revision change';
 END IF;
 SELECT public.automation_review_case_audit_package(alice,pkg,
  'reviewed_for_manual_release_checklist',
  'Stale package cannot receive a new reviewed attestation',
  true,true,true,gen_random_uuid()) INTO r;
 IF r->>'reason'<>'stale_audit_package' THEN
  RAISE EXCEPTION 'Stale audit package accepted as current';
 END IF;
 SELECT public.automation_review_case_audit_package(alice,pkg,'needs_attention',
  'Historical package can still be marked for attention',
  false,false,false,gen_random_uuid()) INTO r;
 IF r->>'ok'<>'true' THEN
  RAISE EXCEPTION 'Historical concerns could not be recorded';
 END IF;
 SELECT public.automation_create_case_audit_package(alice,inc,2,proof,
   gen_random_uuid()) INTO r;
 new_pkg:=(r->>'packageId')::uuid;
 IF r->>'ok'<>'true' OR new_pkg IS NULL OR new_pkg=pkg THEN
  RAISE EXCEPTION 'Fresh case metadata package not captured';
 END IF;
 SELECT public.automation_review_case_audit_package(alice,new_pkg,
  'reviewed_for_manual_release_checklist',
  'Owner examined evidence and understands this is not release authorization',
  true,true,true,gen_random_uuid()) INTO r;
 IF r->>'ok'<>'true' OR r->>'decision'<>'reviewed_for_manual_release_checklist'
    OR r->>'automaticRelease'<>'false' THEN
  RAISE EXCEPTION 'Current manual attestation not recorded: %',r;
 END IF;
 SELECT public.automation_case_audit_package_inbox(alice,inc) INTO inbox;
 IF inbox->>'packageCount'<>'2' OR
    inbox->'packages'->0->>'current'<>'true' OR
    inbox->'packages'->1->>'current'<>'false' OR
    inbox->'packages'->0->>'reviewCount'<>'1' OR
    inbox->'packages'->0->'reviews'->0->>'decision'<>
      'reviewed_for_manual_release_checklist' OR
    inbox->'packages'->1->>'reviewCount'<>'2' THEN
  RAISE EXCEPTION 'Private audit review history and freshness inaccurate: %',inbox;
 END IF;
 -- Bounded capture: eight per owner incident. This is explicitly a test
 -- fixture limit; historic owner metadata remains immutable.
 FOR num IN 3..8 LOOP
   SELECT public.automation_create_case_audit_package(alice,inc,2,proof,
     gen_random_uuid()) INTO r;
   IF r->>'ok'<>'true' THEN
     RAISE EXCEPTION 'Allowed audited source package count was blocked: %',r;
   END IF;
 END LOOP;
 SELECT public.automation_create_case_audit_package(alice,inc,2,proof,
   gen_random_uuid()) INTO r;
 IF r->>'reason'<>'audit_package_limit' THEN
   RAISE EXCEPTION 'Ninth owner package bypassed quota';
 END IF;
 SELECT count(*) INTO package_count FROM public.automation_case_audit_packages
   WHERE user_id=alice AND incident_id=inc;
 IF package_count<>8 THEN RAISE EXCEPTION 'Unexpected package snapshot count'; END IF;
 SELECT count(*) INTO run_count_after FROM public.automation_runs WHERE user_id=alice;
 IF run_count_before<>run_count_after THEN
   RAISE EXCEPTION 'Capturing/reviewing packages created execution receipts';
 END IF;
 RAISE NOTICE 'Owner-only real evidence snapshots, exact replay, stale review refusal, private history, quotas and zero execution passed';
END;
$$;
DO $$
BEGIN
 IF has_table_privilege('authenticated','public.automation_case_audit_packages','SELECT') OR
    has_table_privilege('anon','public.automation_case_audit_packages','INSERT') OR
    has_table_privilege('authenticated','public.automation_case_audit_reviews','SELECT') OR
    has_function_privilege('authenticated',
      'public.automation_create_case_audit_package(uuid,uuid,integer,uuid,uuid)','EXECUTE') OR
    has_function_privilege('anon',
      'public.automation_case_audit_package_inbox(uuid,uuid)','EXECUTE') OR
    has_function_privilege('authenticated',
      'public.automation_review_case_audit_package(uuid,uuid,text,text,boolean,boolean,boolean,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Browser role may access privileged owner package or review RPC';
 END IF;
END;
$$;
