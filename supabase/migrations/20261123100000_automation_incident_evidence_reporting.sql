-- ETERNYX Automation Phase 2N. Owner-only, metadata-only incident evidence,
-- measured case reporting and non-executing quarantine readiness checks.
-- Evidence is acquired from real persisted records inside the database.
CREATE TABLE public.automation_incident_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.automation_incidents(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  evidence_kind text NOT NULL CHECK(evidence_kind IN
    ('incident_origin','completed_run','schedule_state','quarantine_receipt')),
  source_id uuid NOT NULL,
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'
    AND octet_length(snapshot::text)<=8192),
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key),
  UNIQUE(user_id,incident_id,evidence_kind,source_id)
);
CREATE INDEX automation_incident_evidence_case_idx
  ON public.automation_incident_evidence(user_id,incident_id,captured_at DESC,id DESC);
CREATE INDEX automation_incident_evidence_owner_recent_idx
  ON public.automation_incident_evidence(user_id,captured_at DESC);
ALTER TABLE public.automation_incident_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_incident_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_incident_evidence TO service_role;

-- Capture a source snapshot without accepting any untrusted text payload.
-- For subsequent evidence, source must be the same incident origin or relate
-- to the incident's existing workflow. Cross-account and unrelated sources fail.
CREATE OR REPLACE FUNCTION public.automation_capture_incident_evidence(
  p_user_id uuid,p_incident_id uuid,p_evidence_kind text,
  p_source_id uuid,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE existing public.automation_incident_evidence%ROWTYPE;
  inc public.automation_incidents%ROWTYPE;
  r public.automation_runs%ROWTYPE;
  s public.automation_schedules%ROWTYPE;
  q public.automation_schedule_quarantines%ROWTYPE;
  snap jsonb; cnt integer;item_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_incident_id IS NULL OR p_source_id IS NULL OR
    p_request_key IS NULL OR p_evidence_kind IS NULL OR p_evidence_kind NOT IN
      ('incident_origin','completed_run','schedule_state','quarantine_receipt')
  THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO existing FROM public.automation_incident_evidence
    WHERE user_id=p_user_id AND request_key=p_request_key;
  IF FOUND THEN
    IF existing.incident_id IS DISTINCT FROM p_incident_id OR
       existing.evidence_kind IS DISTINCT FROM p_evidence_kind OR
       existing.source_id IS DISTINCT FROM p_source_id THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'evidenceId',existing.id,
      'capturedAt',existing.captured_at,'snapshot',existing.snapshot,
      'externalExecutionTriggered',false);
  END IF;
  SELECT * INTO inc FROM public.automation_incidents
    WHERE id=p_incident_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF EXISTS(SELECT 1 FROM public.automation_incident_evidence
    WHERE user_id=p_user_id AND incident_id=p_incident_id
      AND evidence_kind=p_evidence_kind AND source_id=p_source_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','already_captured');
  END IF;
  SELECT count(*) INTO cnt FROM public.automation_incident_evidence
    WHERE user_id=p_user_id AND incident_id=p_incident_id;
  IF cnt>=8 THEN RETURN jsonb_build_object('ok',false,'reason','incident_evidence_limit'); END IF;
  SELECT count(*) INTO cnt FROM public.automation_incident_evidence
    WHERE user_id=p_user_id AND captured_at>
      pg_catalog.statement_timestamp()-interval '24 hours';
  IF cnt>=30 THEN RETURN jsonb_build_object('ok',false,'reason','daily_evidence_limit'); END IF;
  IF p_evidence_kind='incident_origin' THEN
    IF p_source_id IS DISTINCT FROM inc.id THEN
      RETURN jsonb_build_object('ok',false,'reason','unrelated_evidence');
    END IF;
    snap:=jsonb_build_object('incidentId',inc.id,'originKind',inc.source_kind,
      'originId',inc.source_id,'openedAt',inc.created_at,
      'originSnapshot',inc.source_evidence,'capturedFrom','stored_incident_origin');
  ELSIF p_evidence_kind='completed_run' THEN
    SELECT * INTO r FROM public.automation_runs
      WHERE id=p_source_id AND user_id=p_user_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','evidence_not_found'); END IF;
    IF NOT (inc.source_kind='completed_run_review' AND inc.source_id=r.id) AND
       (inc.workflow_id IS NULL OR r.workflow_id IS DISTINCT FROM inc.workflow_id) THEN
      RETURN jsonb_build_object('ok',false,'reason','unrelated_evidence');
    END IF;
    snap:=jsonb_build_object('runId',r.id,'completedAt',r.created_at,
      'triggerType',r.trigger_type,'workflowId',r.workflow_id,
      'workflowRevision',r.workflow_revision,'inputLines',r.input_lines,
      'outputLines',r.output_lines,'inputCharacters',r.input_characters,
      'outputCharacters',r.output_characters,
      'capturedFrom','completed_run_metadata');
  ELSIF p_evidence_kind='schedule_state' THEN
    SELECT * INTO s FROM public.automation_schedules
      WHERE id=p_source_id AND user_id=p_user_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','evidence_not_found'); END IF;
    IF NOT (inc.source_kind IN ('schedule_failed','schedule_expired_lease') AND
      inc.source_id=s.id) AND
      (inc.workflow_id IS NULL OR s.workflow_id IS DISTINCT FROM inc.workflow_id) THEN
      RETURN jsonb_build_object('ok',false,'reason','unrelated_evidence');
    END IF;
    snap:=jsonb_build_object('scheduleId',s.id,'workflowId',s.workflow_id,
      'scheduleRevision',s.revision,'enabled',s.enabled,
      'attempts',s.attempt_count,'lastStatus',s.last_status,
      'nextRunAt',s.next_run_at,'lastRunAt',s.last_run_at,
      'leaseActive',(s.lease_token IS NOT NULL AND
        s.lease_expires_at>pg_catalog.statement_timestamp()),
      'leaseExpired',(s.lease_token IS NOT NULL AND
        s.lease_expires_at<=pg_catalog.statement_timestamp()),
      'capturedFrom','scheduled_state_metadata');
  ELSE
    SELECT * INTO q FROM public.automation_schedule_quarantines
      WHERE request_key=p_source_id AND user_id=p_user_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','evidence_not_found'); END IF;
    IF NOT (inc.source_kind='schedule_quarantine' AND inc.source_id=q.request_key) THEN
      SELECT * INTO s FROM public.automation_schedules
        WHERE id=q.schedule_id AND user_id=p_user_id;
      IF inc.workflow_id IS NULL OR NOT FOUND OR
         s.workflow_id IS DISTINCT FROM inc.workflow_id THEN
        RETURN jsonb_build_object('ok',false,'reason','unrelated_evidence');
      END IF;
    END IF;
    snap:=jsonb_build_object('receiptId',q.request_key,
      'scheduleId',q.schedule_id,'previousAttempts',q.previous_attempts,
      'previousStatus',q.previous_status,'newRevision',q.new_revision,
      'reason',q.reason,'quarantinedAt',q.created_at,
      'capturedFrom','quarantine_receipt_metadata');
  END IF;
  INSERT INTO public.automation_incident_evidence(
    user_id,incident_id,request_key,evidence_kind,source_id,snapshot)
    VALUES(p_user_id,p_incident_id,p_request_key,p_evidence_kind,p_source_id,snap)
    RETURNING id INTO item_id;
  RETURN jsonb_build_object('ok',true,'replayed',false,'evidenceId',item_id,
    'snapshot',snap,'capturedAt',pg_catalog.statement_timestamp(),
    'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_capture_incident_evidence(
  uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_capture_incident_evidence(
  uuid,uuid,text,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_incident_evidence_list(
 p_user_id uuid,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE rows jsonb;total integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=p_incident_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','not_found');
 END IF;
 SELECT count(*) INTO total FROM public.automation_incident_evidence
    WHERE user_id=p_user_id AND incident_id=p_incident_id;
 SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.captured_at DESC,e.id DESC),
   '[]'::jsonb) INTO rows FROM (
   SELECT id,incident_id,evidence_kind,source_id,snapshot,captured_at
   FROM public.automation_incident_evidence
   WHERE user_id=p_user_id AND incident_id=p_incident_id
   ORDER BY captured_at DESC,id DESC LIMIT 8
 ) e;
 RETURN jsonb_build_object('ok',true,'source','persisted_owner_evidence',
   'incidentId',p_incident_id,'rows',rows,'total',total,
   'rawInputsIncluded',false,'rawOutputsIncluded',false,
   'liveWorkerVerified',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_evidence_list(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_evidence_list(uuid,uuid)
  TO service_role;

-- Report names are explicit: decisions and created-case counts are not error
-- rates or automatic detections. Range is restricted to exactly 7 or 30 days.
CREATE OR REPLACE FUNCTION public.automation_incident_operational_report(
 p_user_id uuid,p_days integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE t timestamptz;created_count integer;resolved_event_count integer;
 open_count integer;investigating_count integer;resolved_count integer;
 high_unresolved integer;older24 integer;older7 integer;
 source_failed integer;source_lease integer;source_quarantine integer;source_run integer;
 severity_low integer;severity_medium integer;severity_high integer;
 evidence_count integer;with_evidence integer;without_evidence integer;
 top_workflows jsonb;generated timestamptz;
BEGIN
 IF p_user_id IS NULL OR p_days IS NULL OR p_days NOT IN (7,30) THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 generated:=pg_catalog.statement_timestamp();
 t:=generated-pg_catalog.make_interval(days=>p_days);
 SELECT count(*) FILTER(WHERE created_at>=t),
  count(*) FILTER(WHERE status='open'),
  count(*) FILTER(WHERE status='investigating'),
  count(*) FILTER(WHERE status='resolved'),
  count(*) FILTER(WHERE status<>'resolved' AND severity='high'),
  count(*) FILTER(WHERE status<>'resolved' AND created_at<generated-interval '24 hours'),
  count(*) FILTER(WHERE status<>'resolved' AND created_at<generated-interval '7 days'),
  count(*) FILTER(WHERE created_at>=t AND source_kind='schedule_failed'),
  count(*) FILTER(WHERE created_at>=t AND source_kind='schedule_expired_lease'),
  count(*) FILTER(WHERE created_at>=t AND source_kind='schedule_quarantine'),
  count(*) FILTER(WHERE created_at>=t AND source_kind='completed_run_review'),
  count(*) FILTER(WHERE created_at>=t AND severity='low'),
  count(*) FILTER(WHERE created_at>=t AND severity='medium'),
  count(*) FILTER(WHERE created_at>=t AND severity='high')
 INTO created_count,open_count,investigating_count,resolved_count,
   high_unresolved,older24,older7,source_failed,source_lease,
   source_quarantine,source_run,severity_low,severity_medium,severity_high
 FROM public.automation_incidents WHERE user_id=p_user_id;
 SELECT count(*) INTO resolved_event_count FROM public.automation_incident_events
   WHERE user_id=p_user_id AND to_status='resolved' AND created_at>=t;
 SELECT count(*) INTO evidence_count FROM public.automation_incident_evidence
   WHERE user_id=p_user_id AND captured_at>=t;
 SELECT count(*) FILTER(WHERE EXISTS(
    SELECT 1 FROM public.automation_incident_evidence e WHERE
    e.user_id=i.user_id AND e.incident_id=i.id)),
    count(*) FILTER(WHERE NOT EXISTS(
    SELECT 1 FROM public.automation_incident_evidence e WHERE
    e.user_id=i.user_id AND e.incident_id=i.id))
 INTO with_evidence,without_evidence
 FROM public.automation_incidents i
 WHERE i.user_id=p_user_id AND i.status<>'resolved';
 SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.unresolved_cases DESC,v.workflow_id),
   '[]'::jsonb) INTO top_workflows FROM (
   SELECT workflow_id,count(*) AS unresolved_cases
   FROM public.automation_incidents
   WHERE user_id=p_user_id AND status<>'resolved' AND workflow_id IS NOT NULL
   GROUP BY workflow_id ORDER BY count(*) DESC,workflow_id ASC LIMIT 5
 ) v;
 RETURN jsonb_build_object('ok',true,'source','database_incident_reporting',
   'generatedAt',generated,'rangeDays',p_days,
   'casesOpenedInWindow',created_count,
   'resolutionEventsInWindow',resolved_event_count,
   'currentOpen',open_count,'currentInvestigating',investigating_count,
   'currentResolved',resolved_count,'currentHighUnresolved',high_unresolved,
   'unresolvedOlder24h',older24,'unresolvedOlder7d',older7,
   'sourcesInWindow',jsonb_build_object('failedSchedule',source_failed,
     'expiredLease',source_lease,'quarantine',source_quarantine,
     'manualRunReview',source_run),
   'severitiesInWindow',jsonb_build_object('low',severity_low,
     'medium',severity_medium,'high',severity_high),
   'capturedEvidenceInWindow',evidence_count,
   'currentUnresolvedWithEvidence',with_evidence,
   'currentUnresolvedWithoutEvidence',without_evidence,
   'topUnresolvedWorkflows',top_workflows,
   'allFailureAttemptsMeasured',false,'automaticDetectionEnabled',false,
   'externalDeliveryVerified',false,'recoveryExecuted',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_operational_report(uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_operational_report(uuid,integer)
  TO service_role;

-- Advisory review for exactly one real quarantine receipt. Never executes a
-- scheduled run and never certifies worker uptime.
CREATE OR REPLACE FUNCTION public.automation_incident_recovery_check(
 p_user_id uuid,p_quarantine_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE q public.automation_schedule_quarantines%ROWTYPE;
  s public.automation_schedules%ROWTYPE;
  r public.automation_recovery_reviews%ROWTYPE;
  present boolean;at_revision boolean;idle boolean;reviewed boolean;
BEGIN
 IF p_user_id IS NULL OR p_quarantine_key IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT * INTO q FROM public.automation_schedule_quarantines
   WHERE user_id=p_user_id AND request_key=p_quarantine_key;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO s FROM public.automation_schedules
   WHERE user_id=p_user_id AND id=q.schedule_id;
 present:=FOUND;
 SELECT * INTO r FROM public.automation_recovery_reviews
   WHERE user_id=p_user_id AND quarantine_request_key=p_quarantine_key;
 reviewed:=FOUND;
 at_revision:=present AND s.revision=q.new_revision;
 idle:=present AND s.lease_token IS NULL AND s.lease_expires_at IS NULL;
 RETURN jsonb_build_object('ok',true,'source','real_quarantine_and_schedule',
   'quarantineKey',q.request_key,'scheduleId',q.schedule_id,
   'expectedRevision',q.new_revision,'currentRevision',CASE WHEN present THEN s.revision ELSE NULL END,
   'scheduleExists',present,'stillDisabled',present AND NOT s.enabled,
   'sameRevision',at_revision,'noLease',idle,
   'reviewExists',reviewed,'reviewDecision',CASE WHEN reviewed THEN r.decision ELSE NULL END,
   'manualReviewEligible',present AND NOT s.enabled AND at_revision AND idle AND NOT reviewed,
   'separateManualRestoreConsideration',present AND NOT s.enabled AND
     at_revision AND idle AND reviewed AND r.decision='reviewed_for_manual_restore',
   'automaticRestore',false,'executed',false,'workerLivenessVerified',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_recovery_check(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_recovery_check(uuid,uuid)
  TO service_role;
