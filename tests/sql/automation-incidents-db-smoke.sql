-- Network-isolated PostgreSQL 17 acceptance for factual Automation incidents.
-- The two user IDs exist only in ephemeral CI bootstrap; all verified
-- sources are actual persisted workflow, run, schedule and quarantine records.
DO $$
DECLARE
  alice uuid:='11111111-1111-4111-8111-111111111111';
  bob uuid:='22222222-2222-4222-8222-222222222222';
  wa uuid;wb uuid;ra uuid;rb uuid;sa uuid;qkey uuid:=gen_random_uuid();
  inc uuid;creation uuid:=gen_random_uuid();nextkey uuid:=gen_random_uuid();
  transition_key uuid:=gen_random_uuid();review_key uuid:=gen_random_uuid();
  status_snapshot jsonb;output jsonb;history jsonb;timeline jsonb;
  schedrev integer;oldrev integer;count_before integer;
  trace jsonb:='[{"id":"s1","kind":"trim","beforeLines":1,"afterLines":1,"beforeChars":3,"afterChars":3,"changed":false}]'::jsonb;
  i integer;
BEGIN
  SELECT public.automation_save_workflow(alice,'Alice real text workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO output;
  wa:=(output->>'workflow_id')::uuid;
  SELECT public.automation_save_workflow(bob,'Bob private workflow',
    '[{"id":"s1","kind":"trim"}]'::jsonb,NULL) INTO output;
  wb:=(output->>'workflow_id')::uuid;
  SELECT public.automation_record_run(alice,wa,1,gen_random_uuid(),repeat('a',64),
    1,1,3,3,trace) INTO output;
  ra:=(output->>'run_id')::uuid;
  SELECT public.automation_record_run(bob,wb,1,gen_random_uuid(),repeat('b',64),
    1,1,3,3,trace) INTO output;
  rb:=(output->>'run_id')::uuid;
  IF ra IS NULL OR rb IS NULL THEN RAISE EXCEPTION 'Missing real completed evidence'; END IF;
  SELECT count(*) INTO count_before FROM public.automation_runs WHERE user_id=alice;

  SELECT public.automation_open_incident(alice,'completed_run_review',rb,
    'Foreign record review','medium','Investigate another tenant evidence',gen_random_uuid())
    INTO output;
  IF output->>'reason'<>'evidence_not_found' THEN
    RAISE EXCEPTION 'Cross-tenant completed run accepted as owner evidence';
  END IF;
  SELECT public.automation_open_incident(alice,'schedule_failed',gen_random_uuid(),
    'Missing failed schedule','high','Verify missing schedule record',gen_random_uuid())
    INTO output;
  IF output->>'reason'<>'evidence_not_found' THEN
    RAISE EXCEPTION 'Invented failed schedule accepted';
  END IF;
  SELECT public.automation_open_incident(alice,'completed_run_review',ra,
    'Unexpected output review','medium','Manual review of persisted completion',creation)
    INTO output;
  IF output->>'ok'<>'true' OR output->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'Real incident create failed: %',output;
  END IF;
  inc:=(output->>'incidentId')::uuid;
  IF inc IS NULL THEN RAISE EXCEPTION 'No owner incident generated'; END IF;
  SELECT public.automation_open_incident(alice,'completed_run_review',ra,
    'Unexpected output review','medium','Manual review of persisted completion',creation)
    INTO output;
  IF output->>'replayed'<>'true' OR output->>'incidentId'<>inc::text THEN
    RAISE EXCEPTION 'Incident create replay was not idempotent';
  END IF;
  SELECT public.automation_open_incident(alice,'completed_run_review',ra,
    'Unexpected output review','high','Manual review of persisted completion',creation)
    INTO output;
  IF output->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Same request key allowed a severity mutation';
  END IF;
  SELECT public.automation_open_incident(alice,'completed_run_review',ra,
    'Duplicate source incident','high','Same verified source, new request',gen_random_uuid())
    INTO output;
  IF output->>'reason'<>'already_reported' THEN
    RAISE EXCEPTION 'Same evidence produced two unrelated cases';
  END IF;

  SELECT public.automation_incident_inbox(bob,NULL,NULL,30) INTO history;
  IF history->>'totalMatching'<>'0' THEN
    RAISE EXCEPTION 'Other owner can view private cases';
  END IF;
  SELECT public.automation_incident_inbox(alice,'open','medium',30) INTO history;
  IF history->>'totalMatching'<>'1' OR history->'counts'->>'open'<>'1' OR
    history->'counts'->>'runReviewSources'<>'1' OR
    history->>'allFailuresMeasured'<>'false' THEN
    RAISE EXCEPTION 'Case inbox invented activity metrics: %',history;
  END IF;
  IF history->'rows'->0 ? 'creation_key' OR
     history->'rows'->0->'source_evidence' ? 'request_fingerprint' THEN
    RAISE EXCEPTION 'Sensitive receipt/cryptographic metadata leaked into inbox';
  END IF;
  SELECT public.automation_incident_timeline(bob,inc) INTO timeline;
  IF timeline->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Another tenant read a private incident timeline';
  END IF;
  SELECT public.automation_incident_timeline(alice,inc) INTO timeline;
  IF timeline->>'total'<>'1' OR timeline->'events'->0->>'to_status'<>'open' THEN
    RAISE EXCEPTION 'Missing opening timeline event';
  END IF;

  SELECT public.automation_transition_incident(alice,inc,1,'resolved',
    'Skip investigation is forbidden',gen_random_uuid()) INTO output;
  IF output->>'reason'<>'invalid_transition' THEN
    RAISE EXCEPTION 'Direct open-to-resolved transition was permitted';
  END IF;
  SELECT public.automation_transition_incident(bob,inc,1,'investigating',
    'Other account cannot update this case',gen_random_uuid()) INTO output;
  IF output->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Cross-tenant transition succeeded';
  END IF;
  SELECT public.automation_transition_incident(alice,inc,1,'investigating',
    'Checking persisted source and workflow policy',transition_key) INTO output;
  IF output->>'ok'<>'true' OR output->>'revision'<>'2' THEN
    RAISE EXCEPTION 'Transition into investigation failed: %',output;
  END IF;
  SELECT public.automation_transition_incident(alice,inc,1,'investigating',
    'Checking persisted source and workflow policy',transition_key) INTO output;
  IF output->>'replayed'<>'true' OR output->>'revision'<>'2' THEN
    RAISE EXCEPTION 'Transition replay incorrectly incremented revision';
  END IF;
  SELECT public.automation_transition_incident(alice,inc,1,'resolved',
    'Stale revision close must not succeed',gen_random_uuid()) INTO output;
  IF output->>'reason'<>'stale_incident' THEN
    RAISE EXCEPTION 'Optimistic revision conflict was accepted';
  END IF;
  SELECT public.automation_transition_incident(alice,inc,2,'resolved',
    'Reviewed evidence and recorded manual findings',nextkey) INTO output;
  IF output->>'ok'<>'true' OR output->>'revision'<>'3' THEN
    RAISE EXCEPTION 'Normal incident resolution failed';
  END IF;
  SELECT public.automation_transition_incident(alice,inc,3,'investigating',
    'Reopening for a newly reported manual review',gen_random_uuid()) INTO output;
  IF output->>'ok'<>'true' OR output->>'revision'<>'4' THEN
    RAISE EXCEPTION 'Investigating a previously resolved case failed';
  END IF;
  SELECT public.automation_incident_timeline(alice,inc) INTO timeline;
  IF timeline->>'total'<>'4' OR
     timeline->'events'->1->>'from_status'<>'open' OR
     timeline->'events'->1->>'to_status'<>'investigating' OR
     timeline->'events'->2->>'from_status'<>'investigating' OR
     timeline->'events'->2->>'to_status'<>'resolved' OR
     timeline->'events'->3->>'from_status'<>'resolved' OR
     timeline->'events'->3->>'to_status'<>'investigating' THEN
    RAISE EXCEPTION 'Timeline did not reflect actual status transitions: %',timeline;
  END IF;

  SELECT public.automation_save_schedule(alice,wa,60,repeat('a',40),
    repeat('b',24),NULL) INTO output;
  sa:=(output->>'schedule_id')::uuid;
  SELECT public.automation_toggle_schedule(alice,sa,true) INTO output;
  SELECT revision INTO schedrev FROM public.automation_schedules WHERE id=sa;
  SELECT public.automation_open_incident(alice,'schedule_failed',sa,
    'Schedule failed unexpectedly','high','Failed state must be database verified',gen_random_uuid())
    INTO output;
  IF output->>'reason'<>'evidence_not_ready' THEN
    RAISE EXCEPTION 'Healthy schedule was falsely reported as failed';
  END IF;
  UPDATE public.automation_schedules SET last_status='failed'
    WHERE id=sa;
  SELECT public.automation_open_incident(alice,'schedule_failed',sa,
    'Schedule failed unexpectedly','high','Failed state verified from schedule',gen_random_uuid())
    INTO output;
  IF output->>'ok'<>'true' THEN
    RAISE EXCEPTION 'Actual failed schedule evidence rejected';
  END IF;
  SELECT public.automation_open_incident(alice,'schedule_expired_lease',sa,
    'Expired worker lease','high','Lease must be expired to report',gen_random_uuid())
    INTO output;
  IF output->>'reason'<>'evidence_not_ready' THEN
    RAISE EXCEPTION 'No lease was reported as expired';
  END IF;
  UPDATE public.automation_schedules SET
    lease_token=gen_random_uuid(),lease_expires_at=
      pg_catalog.statement_timestamp()-interval '5 seconds',
    last_status='processing',attempt_count=1
    WHERE id=sa;
  SELECT public.automation_open_incident(alice,'schedule_expired_lease',sa,
    'Expired worker lease','high','Found a real expired lease marker',gen_random_uuid())
    INTO output;
  IF output->>'ok'<>'true' THEN
    RAISE EXCEPTION 'Real expired lease evidence was rejected';
  END IF;
  SELECT public.automation_quarantine_schedule(alice,sa,schedrev,
    'stale_lease',qkey) INTO output;
  IF output->>'ok'<>'true' THEN RAISE EXCEPTION 'Real quarantine failed: %',output; END IF;
  SELECT public.automation_open_incident(alice,'schedule_quarantine',qkey,
    'Quarantined schedule review','high',
    'Review the actual quarantine receipt and reason',gen_random_uuid()) INTO output;
  IF output->>'ok'<>'true' THEN
    RAISE EXCEPTION 'Actual quarantine evidence rejected';
  END IF;
  SELECT public.automation_recovery_review_inbox(alice) INTO history;
  IF history->>'source'<>'real_quarantine_receipts' OR
    history->>'totalMatching'<>'1' OR
    history->'rows'->0->>'review_id' IS NOT NULL OR
    history->'rows'->0->>'lease_active'<>'false' THEN
    RAISE EXCEPTION 'Recovery inbox did not reflect stored quarantine: %',history;
  END IF;
  SELECT public.automation_review_quarantine(bob,qkey,
    'keep_quarantined','Another owner cannot review this',gen_random_uuid())
    INTO output;
  IF output->>'reason'<>'not_found' THEN
    RAISE EXCEPTION 'Another tenant reviewed a private quarantine';
  END IF;
  SELECT public.automation_review_quarantine(alice,qkey,
    'reviewed_for_manual_restore','Reviewed for manual operator restore only',
    review_key) INTO output;
  IF output->>'ok'<>'true' OR output->>'replayed'<>'false' OR
    output->>'automaticRestore'<>'false' OR
    output->>'externalExecutionTriggered'<>'false' OR
    output->>'scheduleStillDisabled'<>'true' THEN
    RAISE EXCEPTION 'Safe recovery review rejected: %',output;
  END IF;
  IF (SELECT enabled FROM public.automation_schedules WHERE id=sa)<>false THEN
    RAISE EXCEPTION 'Review automatically enabled the scheduled job';
  END IF;
  SELECT public.automation_review_quarantine(alice,qkey,
    'reviewed_for_manual_restore','Reviewed for manual operator restore only',
    review_key) INTO output;
  IF output->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'Recovery review repeated instead of reusing its receipt';
  END IF;
  SELECT public.automation_review_quarantine(alice,qkey,
    'keep_quarantined','Reviewed for manual operator restore only',
    review_key) INTO output;
  IF output->>'reason'<>'idempotency_conflict' THEN
    RAISE EXCEPTION 'Changed recovery decision used same UUID';
  END IF;
  SELECT public.automation_review_quarantine(alice,qkey,
    'keep_quarantined','One receipt should not have two review decisions',
    gen_random_uuid()) INTO output;
  IF output->>'reason'<>'already_reviewed' THEN
    RAISE EXCEPTION 'One quarantine received two reviews';
  END IF;
  SELECT public.automation_recovery_review_inbox(alice) INTO history;
  IF history->'rows'->0->>'review_decision'<>'reviewed_for_manual_restore' THEN
    RAISE EXCEPTION 'Stored recovery decision invisible in factual inbox';
  END IF;
  SELECT count(*) INTO status_snapshot FROM public.automation_runs WHERE user_id=alice;
  IF status_snapshot<>count_before THEN
    RAISE EXCEPTION 'Incident/recovery actions fabricated execution receipts';
  END IF;
  RAISE NOTICE 'Owner evidence, true incident timelines, no-side-effect recovery review passed';
END;
$$;

DO $$
BEGIN
 IF has_table_privilege('authenticated','public.automation_incidents','SELECT')
  OR has_table_privilege('anon','public.automation_incidents','INSERT')
  OR has_table_privilege('authenticated','public.automation_incident_events','SELECT')
  OR has_table_privilege('authenticated','public.automation_recovery_reviews','SELECT')
  OR has_function_privilege('authenticated',
    'public.automation_open_incident(uuid,text,uuid,text,text,text,uuid)','EXECUTE')
  OR has_function_privilege('anon',
    'public.automation_review_quarantine(uuid,uuid,text,text,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser has privileged incident/recovery access';
 END IF;
END;
$$;
