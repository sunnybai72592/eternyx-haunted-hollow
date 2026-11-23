-- ETERNYX Automation Phase 2R: read-only owner case ledger consistency
-- and operational readiness. This is NOT cryptographic tamper detection, nor
-- proof that a worker, external delivery, or review procedure succeeded.
CREATE OR REPLACE FUNCTION public.automation_incident_lifecycle_check(
 p_user_id uuid,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
 p public.automation_investigation_plans%ROWTYPE;
 last_status text;
 incident_events integer;incident_open_events integer;bad_transitions integer;
 plan_events integer;plan_steps integer;plan_ack integer;
 reviewed_events integer;closed_events integer;unplanned_acks integer;
 review_event_id bigint;close_event_id bigint;
 evidence_count integer;closure_count integer;reopen_count integer;
 audit_count integer;trace_result jsonb;findings text[]:=ARRAY[]::text[];
 last_closure public.automation_incident_closure_decisions%ROWTYPE;
 last_reopen public.automation_incident_reopen_decisions%ROWTYPE;
 closure_current boolean:=false;reopen_current boolean:=false;
 plan_stage text;plan_revision integer;has_plan boolean;
 historical_review boolean:=false;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
  WHERE id=p_incident_id AND user_id=p_user_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 WITH chain AS (
   SELECT id,kind,from_status,to_status,
    row_number() OVER(ORDER BY id) AS ordinal,
    lag(to_status) OVER(ORDER BY id) AS previous_to_status
   FROM public.automation_incident_events
   WHERE user_id=p_user_id AND incident_id=p_incident_id
 )
 SELECT count(*)::integer,
  count(*) FILTER(WHERE kind='opened')::integer,
  count(*) FILTER(WHERE
    (ordinal=1 AND (kind<>'opened' OR
      from_status IS NOT NULL OR to_status<>'open')) OR
    (ordinal>1 AND (kind<>'transition' OR
      from_status IS DISTINCT FROM previous_to_status OR
      from_status IS NOT DISTINCT FROM to_status)))::integer
 INTO incident_events,incident_open_events,bad_transitions
 FROM chain;
 SELECT to_status INTO last_status FROM public.automation_incident_events
  WHERE user_id=p_user_id AND incident_id=p_incident_id ORDER BY id DESC LIMIT 1;
 IF incident_events<1 OR incident_open_events<>1 OR bad_transitions<>0 THEN
  findings:=array_append(findings,'incident_event_chain_inconsistent');
 END IF;
 IF inc.status IS DISTINCT FROM last_status THEN
  findings:=array_append(findings,'incident_status_mismatch');
 END IF;
 IF inc.revision<>incident_events THEN
  findings:=array_append(findings,'incident_revision_mismatch');
 END IF;
 SELECT count(*) INTO evidence_count FROM public.automation_incident_evidence
  WHERE user_id=p_user_id AND incident_id=p_incident_id;
 SELECT count(*) INTO closure_count FROM public.automation_incident_closure_decisions
  WHERE user_id=p_user_id AND incident_id=p_incident_id;
 SELECT count(*) INTO reopen_count FROM public.automation_incident_reopen_decisions
  WHERE user_id=p_user_id AND incident_id=p_incident_id;
 SELECT * INTO p FROM public.automation_investigation_plans
  WHERE user_id=p_user_id AND incident_id=p_incident_id;
 has_plan:=FOUND;
 IF has_plan THEN
  plan_stage:=p.stage;plan_revision:=p.revision;
  plan_steps:=jsonb_array_length(p.steps);
  SELECT count(*)::integer,
    count(*) FILTER(WHERE kind='step_acknowledged')::integer,
    count(*) FILTER(WHERE kind='reviewed')::integer,
    count(*) FILTER(WHERE kind='closed')::integer,
    count(*) FILTER(WHERE kind='step_acknowledged' AND
      (step_kind IS NULL OR NOT (p.steps ? step_kind)))::integer,
    min(id) FILTER(WHERE kind='reviewed'),
    min(id) FILTER(WHERE kind='closed')
  INTO plan_events,plan_ack,reviewed_events,closed_events,unplanned_acks,
    review_event_id,close_event_id
  FROM public.automation_investigation_events
  WHERE user_id=p_user_id AND plan_id=p.id;
  IF p.revision<>1+plan_events THEN
   findings:=array_append(findings,'plan_revision_mismatch');
  END IF;
  IF evidence_count<1 THEN
   findings:=array_append(findings,'plan_evidence_missing');
  END IF;
  IF unplanned_acks<>0 OR plan_ack>plan_steps THEN
   findings:=array_append(findings,'plan_step_attestation_mismatch');
  END IF;
  IF NOT (
    (p.stage='draft' AND reviewed_events=0 AND closed_events=0) OR
    (p.stage='reviewed' AND reviewed_events=1 AND closed_events=0
      AND plan_ack=plan_steps) OR
    (p.stage='closed' AND reviewed_events=1 AND closed_events=1
      AND plan_ack=plan_steps AND close_event_id>review_event_id)
  ) THEN
   findings:=array_append(findings,'plan_stage_event_mismatch');
  END IF;
  IF review_event_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.automation_investigation_events e
    WHERE e.user_id=p_user_id AND e.plan_id=p.id AND
      e.kind='step_acknowledged' AND e.id>review_event_id
  ) THEN
    findings:=array_append(findings,'late_review_attestation');
  END IF;
  SELECT * INTO last_closure FROM public.automation_incident_closure_decisions
   WHERE user_id=p_user_id AND incident_id=p_incident_id
   ORDER BY decision_sequence DESC LIMIT 1;
  closure_current:=inc.status='investigating' AND
   p.stage IN ('reviewed','closed') AND plan_ack=plan_steps AND
   evidence_count>0 AND last_closure.id IS NOT NULL AND
   last_closure.decision='approve' AND
   last_closure.incident_revision=inc.revision AND
   last_closure.plan_revision=p.revision;
  SELECT * INTO last_reopen FROM public.automation_incident_reopen_decisions
   WHERE user_id=p_user_id AND incident_id=p_incident_id
   ORDER BY decision_sequence DESC LIMIT 1;
  reopen_current:=inc.status='resolved' AND p.stage IN ('reviewed','closed')
   AND evidence_count>0 AND last_reopen.id IS NOT NULL AND
   last_reopen.decision='approve' AND
   last_reopen.incident_revision=inc.revision AND
   last_reopen.plan_revision=p.revision AND EXISTS(
    SELECT 1 FROM public.automation_incident_evidence e
    WHERE e.user_id=p_user_id AND e.incident_id=p_incident_id
      AND e.id=last_reopen.evidence_id
   );
  historical_review:=p.stage='closed' AND inc.status='investigating' AND
    EXISTS(SELECT 1 FROM public.automation_incident_events ev
     WHERE ev.user_id=p_user_id AND ev.incident_id=p_incident_id AND
      ev.from_status='resolved' AND ev.to_status='investigating');
 ELSE
  plan_stage:=NULL;plan_revision:=NULL;plan_steps:=0;plan_events:=0;
  plan_ack:=0;reviewed_events:=0;closed_events:=0;
  IF closure_count>0 OR reopen_count>0 THEN
   findings:=array_append(findings,'orphaned_governance_decisions');
  END IF;
 END IF;
 -- This cross-check compares separately counted rows with their metadata
 -- projection. It is NOT a cryptographic integrity signature.
 audit_count:=incident_events+evidence_count+plan_events+closure_count+reopen_count;
 SELECT public.automation_incident_audit_trace(p_user_id,p_incident_id)
  INTO trace_result;
 IF trace_result->>'ok'<>'true' OR
    (trace_result->>'total')::integer IS DISTINCT FROM audit_count THEN
  findings:=array_append(findings,'audit_projection_count_mismatch');
 END IF;
 RETURN jsonb_build_object(
  'ok',true,'source','owner_case_ledger_consistency',
  'incidentId',inc.id,'incidentStatus',inc.status,'incidentRevision',inc.revision,
  'incidentEventCount',incident_events,'latestIncidentEventStatus',last_status,
  'capturedEvidenceCount',evidence_count,'hasPlan',has_plan,
  'planStage',plan_stage,'planRevision',plan_revision,
  'plannedSteps',plan_steps,'acknowledgedSteps',plan_ack,
  'planEventCount',plan_events,'closureDecisionCount',closure_count,
  'reopenDecisionCount',reopen_count,'auditLedgerCount',audit_count,
  'auditProjectionCount',trace_result->'total',
  'closureApprovalCurrent',closure_current,'reopenApprovalCurrent',reopen_current,
  'historicalClosedPlanAfterReopen',historical_review,
  'consistent',cardinality(findings)=0,'findings',to_jsonb(findings),
  'automatedDetectionEnabled',false,'cryptographicIntegrityVerified',false,
  'workerLivenessVerified',false,'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_lifecycle_check(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_lifecycle_check(uuid,uuid)
 TO service_role;

-- Complete owner aggregate counts + a clearly labeled last-30-case SAMPLE
-- of lifecycle consistency. Never mistake sample findings for fleet totals.
CREATE OR REPLACE FUNCTION public.automation_incident_readiness_report(
 p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE total integer;status_open integer;status_investigating integer;
 status_resolved integer;high_unresolved integer;older24 integer;
 evidence_covered integer;evidence_missing integer;
 plan_draft integer;plan_reviewed integer;plan_closed integer;
 case_rec record;item jsonb;rows jsonb:='[]'::jsonb;
 sampled integer:=0;issues integer:=0;historical integer:=0;generated timestamptz;
BEGIN
 IF p_user_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 generated:=pg_catalog.statement_timestamp();
 SELECT count(*)::integer,
   count(*) FILTER(WHERE status='open')::integer,
   count(*) FILTER(WHERE status='investigating')::integer,
   count(*) FILTER(WHERE status='resolved')::integer,
   count(*) FILTER(WHERE severity='high' AND status<>'resolved')::integer,
   count(*) FILTER(WHERE status<>'resolved' AND
     created_at<generated-interval '24 hours')::integer,
   count(*) FILTER(WHERE status<>'resolved' AND EXISTS(
     SELECT 1 FROM public.automation_incident_evidence e
     WHERE e.user_id=i.user_id AND e.incident_id=i.id))::integer,
   count(*) FILTER(WHERE status<>'resolved' AND NOT EXISTS(
     SELECT 1 FROM public.automation_incident_evidence e
     WHERE e.user_id=i.user_id AND e.incident_id=i.id))::integer
 INTO total,status_open,status_investigating,status_resolved,
   high_unresolved,older24,evidence_covered,evidence_missing
 FROM public.automation_incidents i WHERE i.user_id=p_user_id;
 SELECT count(*) FILTER(WHERE stage='draft')::integer,
  count(*) FILTER(WHERE stage='reviewed')::integer,
  count(*) FILTER(WHERE stage='closed')::integer
 INTO plan_draft,plan_reviewed,plan_closed
 FROM public.automation_investigation_plans WHERE user_id=p_user_id;
 FOR case_rec IN
   SELECT id FROM public.automation_incidents
   WHERE user_id=p_user_id
   ORDER BY updated_at DESC,id DESC LIMIT 30
 LOOP
   SELECT public.automation_incident_lifecycle_check(p_user_id,case_rec.id) INTO item;
   sampled:=sampled+1;
   IF item->>'consistent'='false' THEN issues:=issues+1; END IF;
   IF item->>'historicalClosedPlanAfterReopen'='true' THEN
     historical:=historical+1;
   END IF;
   rows:=rows||jsonb_build_array(jsonb_build_object(
     'incidentId',case_rec.id,
     'status',item->'incidentStatus','consistent',item->'consistent',
     'findings',item->'findings','hasPlan',item->'hasPlan',
     'planStage',item->'planStage',
     'evidenceCount',item->'capturedEvidenceCount',
     'closureApprovalCurrent',item->'closureApprovalCurrent',
     'reopenApprovalCurrent',item->'reopenApprovalCurrent',
     'historicalClosedPlanAfterReopen',
       item->'historicalClosedPlanAfterReopen'));
 END LOOP;
 RETURN jsonb_build_object(
   'ok',true,'source','owner_actual_case_readiness',
   'generatedAt',generated,'totalOwnerCases',total,
   'currentOpen',status_open,'currentInvestigating',status_investigating,
   'currentResolved',status_resolved,'currentHighUnresolved',high_unresolved,
   'currentUnresolvedOlder24h',older24,
   'currentUnresolvedWithEvidence',evidence_covered,
   'currentUnresolvedWithoutEvidence',evidence_missing,
   'planDraft',plan_draft,'planReviewed',plan_reviewed,'planClosed',plan_closed,
   'recentSampleLimit',30,'recentCasesScanned',sampled,
   'recentSampleTruncated',total>sampled,
   'inconsistentCasesInRecentSample',issues,
   'historicallyClosedPlansInRecentSample',historical,
   'recentCases',rows,
   'allCasesIntegrityChecked',total<=sampled,
   'cryptographicIntegrityVerified',false,
   'automaticFailuresMeasured',false,
   'workerLivenessVerified',false,'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_readiness_report(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_readiness_report(uuid)
 TO service_role;
