-- ETERNYX Automation Phase 2P. Human-governed closure for incidents with
-- investigation plans. Existing incidents without plans remain backward
-- compatible. No RPC below triggers/executes/restores a workflow.
CREATE TABLE public.automation_incident_closure_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.automation_incidents(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.automation_investigation_plans(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  incident_revision integer NOT NULL CHECK(incident_revision>0),
  plan_revision integer NOT NULL CHECK(plan_revision>0),
  decision text NOT NULL CHECK(decision IN ('defer','approve')),
  note text NOT NULL CHECK(char_length(btrim(note)) BETWEEN 12 AND 500),
  evidence_count integer NOT NULL CHECK(evidence_count>0),
  acknowledged_steps integer NOT NULL CHECK(acknowledged_steps>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key)
);
CREATE INDEX automation_closure_decisions_owner_case_latest
 ON public.automation_incident_closure_decisions(user_id,incident_id,decision_sequence DESC);
ALTER TABLE public.automation_incident_closure_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_incident_closure_decisions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_incident_closure_decisions TO service_role;

-- A single factual, owner-bound preflight result can inform the UI; it is NOT
-- authorization. Mutations recheck all conditions transactionally.
CREATE OR REPLACE FUNCTION public.automation_incident_closure_preflight(
  p_user_id uuid,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
  p public.automation_investigation_plans%ROWTYPE;
  latest public.automation_incident_closure_decisions%ROWTYPE;
  n_evidence integer;n_steps integer;n_decisions integer;
  reviewed boolean;approved boolean;eligible boolean;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=p_incident_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO p FROM public.automation_investigation_plans
   WHERE user_id=p_user_id AND incident_id=p_incident_id;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('ok',true,'source','owner_incident_closure_metadata',
     'incidentId',inc.id,'incidentStatus',inc.status,'incidentRevision',inc.revision,
     'hasPlan',false,'governedClosureRequired',false,'planStage',NULL,
     'planRevision',NULL,'capturedEvidence',0,'acknowledgedSteps',0,'plannedSteps',0,
     'decisionCount',0,'latestDecision',NULL,'approvalCurrent',false,
     'eligibleForApproval',false,'readyToResolve',false,
     'legacyNoPlanPath',true,'externalExecutionTriggered',false);
 END IF;
 SELECT count(*) INTO n_evidence FROM public.automation_incident_evidence
   WHERE user_id=p_user_id AND incident_id=inc.id;
 SELECT count(*) INTO n_steps FROM public.automation_investigation_events
   WHERE user_id=p_user_id AND plan_id=p.id AND kind='step_acknowledged';
 SELECT count(*) INTO n_decisions FROM public.automation_incident_closure_decisions
   WHERE user_id=p_user_id AND incident_id=inc.id;
 SELECT * INTO latest FROM public.automation_incident_closure_decisions
   WHERE user_id=p_user_id AND incident_id=inc.id
   ORDER BY decision_sequence DESC LIMIT 1;
 reviewed:=p.stage IN ('reviewed','closed') AND
   n_steps=jsonb_array_length(p.steps);
 eligible:=inc.status='investigating' AND reviewed AND n_evidence>=1;
 approved:=eligible AND latest.id IS NOT NULL AND
   latest.decision='approve' AND
   latest.incident_revision=inc.revision AND
   latest.plan_revision=p.revision;
 RETURN jsonb_build_object('ok',true,'source','owner_incident_closure_metadata',
   'incidentId',inc.id,'incidentStatus',inc.status,'incidentRevision',inc.revision,
   'hasPlan',true,'governedClosureRequired',true,'planId',p.id,
   'planStage',p.stage,'planRevision',p.revision,
   'capturedEvidence',n_evidence,'acknowledgedSteps',n_steps,
   'plannedSteps',jsonb_array_length(p.steps),'decisionCount',n_decisions,
   'latestDecision',CASE WHEN latest.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',latest.id,'decision',latest.decision,'createdAt',latest.created_at,
      'incidentRevision',latest.incident_revision,'planRevision',latest.plan_revision)
      END,'approvalCurrent',approved,'eligibleForApproval',eligible,
   'readyToResolve',approved,'legacyNoPlanPath',false,
   'externalExecutionTriggered',false,
   'externalDeliveryVerified',false,'workerLivenessVerified',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_closure_preflight(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_closure_preflight(uuid,uuid)
 TO service_role;

-- Owner-signed (single-owner, not dual-control) review decision. An approval
-- is an advisory permission for a SEPARATE, explicit case transition.
CREATE OR REPLACE FUNCTION public.automation_record_incident_closure_decision(
  p_user_id uuid,p_incident_id uuid,p_incident_revision integer,
  p_plan_revision integer,p_decision text,p_note text,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
  p public.automation_investigation_plans%ROWTYPE;
  past public.automation_incident_closure_decisions%ROWTYPE;
  made public.automation_incident_closure_decisions%ROWTYPE;
  n_evidence integer;n_steps integer;account_day integer;case_total integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL OR p_request_key IS NULL OR
    p_incident_revision IS NULL OR p_incident_revision<1 OR
    p_plan_revision IS NULL OR p_plan_revision<1 OR
    p_decision IS NULL OR p_decision NOT IN ('defer','approve') OR
    p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 12 AND 500 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO past FROM public.automation_incident_closure_decisions
   WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF past.incident_id IS DISTINCT FROM p_incident_id OR
      past.incident_revision IS DISTINCT FROM p_incident_revision OR
      past.plan_revision IS DISTINCT FROM p_plan_revision OR
      past.decision IS DISTINCT FROM p_decision OR
      past.note IS DISTINCT FROM btrim(p_note) THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,'decisionId',past.id,
     'decision',past.decision,'incidentRevision',past.incident_revision,
     'planRevision',past.plan_revision,'externalExecutionTriggered',false);
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO p FROM public.automation_investigation_plans
   WHERE user_id=p_user_id AND incident_id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','plan_not_found'); END IF;
 IF inc.revision<>p_incident_revision OR p.revision<>p_plan_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_closure_review');
 END IF;
 IF inc.status<>'investigating' OR p.stage NOT IN ('reviewed','closed') THEN
   RETURN jsonb_build_object('ok',false,'reason','closure_not_ready');
 END IF;
 SELECT count(*) INTO n_evidence FROM public.automation_incident_evidence
   WHERE user_id=p_user_id AND incident_id=inc.id;
 SELECT count(*) INTO n_steps FROM public.automation_investigation_events
   WHERE user_id=p_user_id AND plan_id=p.id AND kind='step_acknowledged';
 IF n_evidence<1 OR n_steps<>jsonb_array_length(p.steps) THEN
   RETURN jsonb_build_object('ok',false,'reason','closure_evidence_incomplete');
 END IF;
 SELECT count(*) INTO account_day FROM public.automation_incident_closure_decisions
   WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours';
 SELECT count(*) INTO case_total FROM public.automation_incident_closure_decisions
   WHERE user_id=p_user_id AND incident_id=inc.id;
 IF account_day>=10 OR case_total>=5 THEN
   RETURN jsonb_build_object('ok',false,'reason','closure_review_limit');
 END IF;
 INSERT INTO public.automation_incident_closure_decisions(
   user_id,incident_id,plan_id,request_key,incident_revision,plan_revision,
   decision,note,evidence_count,acknowledged_steps
 ) VALUES(p_user_id,inc.id,p.id,p_request_key,p_incident_revision,p_plan_revision,
   p_decision,btrim(p_note),n_evidence,n_steps) RETURNING * INTO made;
 RETURN jsonb_build_object('ok',true,'replayed',false,'decisionId',made.id,
   'decision',made.decision,'incidentRevision',made.incident_revision,
   'planRevision',made.plan_revision,'capturedEvidence',made.evidence_count,
   'acknowledgedSteps',made.acknowledged_steps,
   'automaticallyResolved',false,'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_record_incident_closure_decision(
 uuid,uuid,integer,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_record_incident_closure_decision(
 uuid,uuid,integer,integer,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_incident_closure_history(
 p_user_id uuid,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE items jsonb;total integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.automation_incidents
   WHERE id=p_incident_id AND user_id=p_user_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','not_found');
 END IF;
 SELECT count(*) INTO total FROM public.automation_incident_closure_decisions
   WHERE user_id=p_user_id AND incident_id=p_incident_id;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.decision_sequence ASC),
   '[]'::jsonb) INTO items FROM (
   SELECT id,decision,note,decision_sequence,incident_revision,plan_revision,evidence_count,
     acknowledged_steps,created_at
   FROM public.automation_incident_closure_decisions
   WHERE user_id=p_user_id AND incident_id=p_incident_id
   ORDER BY decision_sequence ASC LIMIT 5
 ) x;
 RETURN jsonb_build_object('ok',true,'source','owner_closure_decision_history',
   'incidentId',p_incident_id,'rows',items,'total',total,
   'userAttestationOnly',true,'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_closure_history(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_closure_history(uuid,uuid)
 TO service_role;

-- Hard database guard means even older clients calling the existing transition
-- RPC cannot resolve a planned incident without the latest valid approval.
CREATE OR REPLACE FUNCTION public.automation_guard_planned_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE p public.automation_investigation_plans%ROWTYPE;
  latest public.automation_incident_closure_decisions%ROWTYPE;
  n_evidence integer;n_steps integer;
BEGIN
 IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status<>'resolved' THEN
   RETURN NEW;
 END IF;
 SELECT * INTO p FROM public.automation_investigation_plans
   WHERE user_id=OLD.user_id AND incident_id=OLD.id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT count(*) INTO n_evidence FROM public.automation_incident_evidence
    WHERE user_id=OLD.user_id AND incident_id=OLD.id;
 SELECT count(*) INTO n_steps FROM public.automation_investigation_events
    WHERE user_id=OLD.user_id AND plan_id=p.id AND kind='step_acknowledged';
 SELECT * INTO latest FROM public.automation_incident_closure_decisions
   WHERE user_id=OLD.user_id AND incident_id=OLD.id
   ORDER BY decision_sequence DESC LIMIT 1;
 IF OLD.status<>'investigating' OR p.stage NOT IN ('reviewed','closed') OR
    n_evidence<1 OR n_steps<>jsonb_array_length(p.steps) OR
    latest.id IS NULL OR latest.decision<>'approve' OR
    latest.incident_revision<>OLD.revision OR latest.plan_revision<>p.revision THEN
   RAISE EXCEPTION 'Planned incident requires current approved manual closure decision'
      USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_guard_planned_resolution()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER automation_planned_incident_resolution_gate
 BEFORE UPDATE OF status ON public.automation_incidents
 FOR EACH ROW EXECUTE FUNCTION public.automation_guard_planned_resolution();

-- Authenticated Edge uses this wrapper to return a structured refusal rather
-- than exposing the trigger exception to a user. The DB trigger remains the
-- final race-safe safeguard against any alternate status-update path.
CREATE OR REPLACE FUNCTION public.automation_governed_incident_transition(
 p_user_id uuid,p_incident_id uuid,p_revision integer,
 p_next_status text,p_note text,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE p public.automation_investigation_plans%ROWTYPE;
  preflight jsonb;inc public.automation_incidents%ROWTYPE;
  prior public.automation_incident_events%ROWTYPE;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL OR p_revision IS NULL OR
    p_request_key IS NULL OR p_next_status IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 IF p_next_status='resolved' THEN
   -- Existing idempotency keys must keep their original replay semantics
   -- even after the incident has advanced beyond the original revision.
   SELECT * INTO prior FROM public.automation_incident_events
     WHERE user_id=p_user_id AND request_key=p_request_key;
   IF FOUND THEN
      RETURN public.automation_transition_incident(p_user_id,p_incident_id,
        p_revision,p_next_status,p_note,p_request_key);
   END IF;
   SELECT * INTO inc FROM public.automation_incidents
      WHERE user_id=p_user_id AND id=p_incident_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
   SELECT * INTO p FROM public.automation_investigation_plans
     WHERE user_id=p_user_id AND incident_id=p_incident_id;
   IF FOUND THEN
     SELECT public.automation_incident_closure_preflight(
       p_user_id,p_incident_id) INTO preflight;
     IF preflight->>'readyToResolve'<>'true' THEN
       RETURN jsonb_build_object('ok',false,'reason','closure_approval_required');
     END IF;
   END IF;
 END IF;
 RETURN public.automation_transition_incident(p_user_id,p_incident_id,
   p_revision,p_next_status,p_note,p_request_key);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_governed_incident_transition(
 uuid,uuid,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_governed_incident_transition(
 uuid,uuid,integer,text,text,uuid) TO service_role;
