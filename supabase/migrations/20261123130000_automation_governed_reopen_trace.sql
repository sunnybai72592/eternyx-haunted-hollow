-- ETERNYX Automation Phase 2Q: versioned, evidence-linked human reopening.
-- Applies only to incidents with an investigation plan. No workflow execution.
CREATE TABLE public.automation_incident_reopen_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 decision_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 incident_id uuid NOT NULL REFERENCES public.automation_incidents(id) ON DELETE CASCADE,
 plan_id uuid NOT NULL REFERENCES public.automation_investigation_plans(id) ON DELETE CASCADE,
 evidence_id uuid NOT NULL REFERENCES public.automation_incident_evidence(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 incident_revision integer NOT NULL CHECK (incident_revision>0),
 plan_revision integer NOT NULL CHECK (plan_revision>0),
 decision text NOT NULL CHECK (decision IN ('hold','approve')),
 reason text NOT NULL CHECK (reason IN
   ('new_evidence','recurrence','incomplete_review','other')),
 note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 12 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE INDEX automation_reopen_owner_case_latest
 ON public.automation_incident_reopen_decisions(user_id,incident_id,decision_sequence DESC);
ALTER TABLE public.automation_incident_reopen_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_incident_reopen_decisions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_incident_reopen_decisions TO service_role;

-- A historical snapshot is a related source, not necessarily newly captured.
CREATE OR REPLACE FUNCTION public.automation_incident_reopen_preflight(
 p_user_id uuid,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
 p public.automation_investigation_plans%ROWTYPE;
 latest public.automation_incident_reopen_decisions%ROWTYPE;
 n_evidence integer;n_decisions integer;eligible boolean;approved boolean;
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
   RETURN jsonb_build_object('ok',true,'source','owner_reopen_metadata',
     'incidentId',inc.id,'incidentStatus',inc.status,'incidentRevision',inc.revision,
     'hasPlan',false,'governedReopenRequired',false,'planRevision',NULL,
     'planStage',NULL,'evidenceCount',0,'decisionCount',0,'latestDecision',NULL,
     'eligibleForReview',false,'approvalCurrent',false,'readyToReopen',false,
     'legacyNoPlanPath',true,'externalExecutionTriggered',false);
 END IF;
 SELECT count(*) INTO n_evidence FROM public.automation_incident_evidence
  WHERE user_id=p_user_id AND incident_id=inc.id;
 SELECT count(*) INTO n_decisions FROM public.automation_incident_reopen_decisions
  WHERE user_id=p_user_id AND incident_id=inc.id;
 SELECT * INTO latest FROM public.automation_incident_reopen_decisions
  WHERE user_id=p_user_id AND incident_id=inc.id
  ORDER BY decision_sequence DESC LIMIT 1;
 eligible:=inc.status='resolved' AND p.stage IN ('reviewed','closed') AND n_evidence>=1;
 approved:=eligible AND latest.id IS NOT NULL AND latest.decision='approve'
   AND latest.incident_revision=inc.revision AND latest.plan_revision=p.revision
   AND EXISTS(SELECT 1 FROM public.automation_incident_evidence e
     WHERE e.id=latest.evidence_id AND e.user_id=p_user_id AND e.incident_id=inc.id);
 RETURN jsonb_build_object('ok',true,'source','owner_reopen_metadata',
   'incidentId',inc.id,'incidentStatus',inc.status,'incidentRevision',inc.revision,
   'hasPlan',true,'governedReopenRequired',true,'planId',p.id,
   'planRevision',p.revision,'planStage',p.stage,
   'evidenceCount',n_evidence,'decisionCount',n_decisions,
   'latestDecision',CASE WHEN latest.id IS NULL THEN NULL ELSE jsonb_build_object(
     'id',latest.id,'decision',latest.decision,'reason',latest.reason,
     'evidenceId',latest.evidence_id,'incidentRevision',latest.incident_revision,
     'planRevision',latest.plan_revision,'createdAt',latest.created_at) END,
   'eligibleForReview',eligible,'approvalCurrent',approved,
   'readyToReopen',approved,'legacyNoPlanPath',false,
   'externalExecutionTriggered',false,'externalDeliveryVerified',false,
   'workerLivenessVerified',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_reopen_preflight(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_reopen_preflight(uuid,uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.automation_record_incident_reopen_decision(
 p_user_id uuid,p_incident_id uuid,p_incident_revision integer,
 p_plan_revision integer,p_evidence_id uuid,p_decision text,p_reason text,
 p_note text,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
 p public.automation_investigation_plans%ROWTYPE;
 past public.automation_incident_reopen_decisions%ROWTYPE;
 made public.automation_incident_reopen_decisions%ROWTYPE;
 n_day integer;n_case integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL OR p_request_key IS NULL OR
   p_evidence_id IS NULL OR p_incident_revision IS NULL OR
   p_incident_revision<1 OR p_plan_revision IS NULL OR p_plan_revision<1 OR
   p_decision IS NULL OR p_decision NOT IN ('hold','approve') OR
   p_reason IS NULL OR p_reason NOT IN
     ('new_evidence','recurrence','incomplete_review','other') OR
   p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 12 AND 500 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO past FROM public.automation_incident_reopen_decisions
  WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF past.incident_id IS DISTINCT FROM p_incident_id OR
     past.incident_revision IS DISTINCT FROM p_incident_revision OR
     past.plan_revision IS DISTINCT FROM p_plan_revision OR
     past.evidence_id IS DISTINCT FROM p_evidence_id OR
     past.decision IS DISTINCT FROM p_decision OR
     past.reason IS DISTINCT FROM p_reason OR
     past.note IS DISTINCT FROM btrim(p_note) THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,'decisionId',past.id,
     'decision',past.decision,'reason',past.reason,'evidenceId',past.evidence_id,
     'incidentRevision',past.incident_revision,'planRevision',past.plan_revision,
     'externalExecutionTriggered',false);
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE id=p_incident_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO p FROM public.automation_investigation_plans
   WHERE user_id=p_user_id AND incident_id=inc.id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','plan_not_found'); END IF;
 IF inc.revision<>p_incident_revision OR p.revision<>p_plan_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_reopen_review');
 END IF;
 IF inc.status<>'resolved' OR p.stage NOT IN ('reviewed','closed') THEN
   RETURN jsonb_build_object('ok',false,'reason','reopen_not_ready');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.automation_incident_evidence
   WHERE user_id=p_user_id AND incident_id=inc.id AND id=p_evidence_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','reopen_evidence_not_found');
 END IF;
 SELECT count(*) INTO n_day FROM public.automation_incident_reopen_decisions
   WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours';
 SELECT count(*) INTO n_case FROM public.automation_incident_reopen_decisions
   WHERE user_id=p_user_id AND incident_id=inc.id;
 IF n_day>=10 OR n_case>=5 THEN
   RETURN jsonb_build_object('ok',false,'reason','reopen_review_limit');
 END IF;
 INSERT INTO public.automation_incident_reopen_decisions(
   user_id,incident_id,plan_id,evidence_id,request_key,
   incident_revision,plan_revision,decision,reason,note)
 VALUES(p_user_id,inc.id,p.id,p_evidence_id,p_request_key,p_incident_revision,
   p_plan_revision,p_decision,p_reason,btrim(p_note)) RETURNING * INTO made;
 RETURN jsonb_build_object('ok',true,'replayed',false,'decisionId',made.id,
   'decision',made.decision,'reason',made.reason,'evidenceId',made.evidence_id,
   'incidentRevision',made.incident_revision,'planRevision',made.plan_revision,
   'automaticReopen',false,'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_record_incident_reopen_decision(
 uuid,uuid,integer,integer,uuid,text,text,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_record_incident_reopen_decision(
 uuid,uuid,integer,integer,uuid,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_incident_reopen_history(
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
 SELECT count(*) INTO total FROM public.automation_incident_reopen_decisions
   WHERE user_id=p_user_id AND incident_id=p_incident_id;
 SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.decision_sequence),'[]'::jsonb)
 INTO items FROM (
   SELECT id,decision_sequence,decision,reason,note,evidence_id,
     incident_revision,plan_revision,created_at
   FROM public.automation_incident_reopen_decisions
   WHERE user_id=p_user_id AND incident_id=p_incident_id
   ORDER BY decision_sequence LIMIT 5
 ) v;
 RETURN jsonb_build_object('ok',true,'source','owner_reopen_history',
  'incidentId',p_incident_id,'rows',items,'total',total,
  'userAttestationOnly',true,'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_reopen_history(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_reopen_history(uuid,uuid)
 TO service_role;

-- An independent BEFORE trigger guards direct calls to earlier RPCs
-- or SQL. A case without a plan retains the previous legacy behavior.
CREATE OR REPLACE FUNCTION public.automation_guard_planned_reopen()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE p public.automation_investigation_plans%ROWTYPE;
 latest public.automation_incident_reopen_decisions%ROWTYPE;
BEGIN
 IF OLD.status IS DISTINCT FROM 'resolved' OR
    NEW.status IS DISTINCT FROM 'investigating' THEN
   RETURN NEW;
 END IF;
 SELECT * INTO p FROM public.automation_investigation_plans
   WHERE user_id=OLD.user_id AND incident_id=OLD.id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO latest FROM public.automation_incident_reopen_decisions
  WHERE user_id=OLD.user_id AND incident_id=OLD.id
  ORDER BY decision_sequence DESC LIMIT 1;
 IF p.stage NOT IN ('reviewed','closed') OR latest.id IS NULL OR
   latest.decision<>'approve' OR latest.incident_revision<>OLD.revision OR
   latest.plan_revision<>p.revision OR NOT EXISTS(
     SELECT 1 FROM public.automation_incident_evidence e
     WHERE e.id=latest.evidence_id AND e.user_id=OLD.user_id AND
       e.incident_id=OLD.id) THEN
   RAISE EXCEPTION 'Planned incident needs current approved manual reopening decision'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_guard_planned_reopen()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER automation_planned_incident_reopen_gate
 BEFORE UPDATE OF status ON public.automation_incidents
 FOR EACH ROW EXECUTE FUNCTION public.automation_guard_planned_reopen();

-- Strengthen the prior owner-status wrapper for BOTH transitions, preserving
-- previously committed exact-request idempotent replays.
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
 IF p_next_status IN ('resolved','investigating') THEN
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
   IF FOUND AND p_next_status='resolved' THEN
     SELECT public.automation_incident_closure_preflight(
       p_user_id,p_incident_id) INTO preflight;
     IF preflight->>'readyToResolve'<>'true' THEN
       RETURN jsonb_build_object('ok',false,'reason','closure_approval_required');
     END IF;
   ELSIF FOUND AND p_next_status='investigating' AND inc.status='resolved' THEN
     SELECT public.automation_incident_reopen_preflight(
       p_user_id,p_incident_id) INTO preflight;
     IF preflight->>'readyToReopen'<>'true' THEN
       RETURN jsonb_build_object('ok',false,'reason','reopen_approval_required');
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

-- Unified private, metadata-only audit trace. No user notes, request keys,
-- plaintext job inputs/outputs, hashes or external identifiers.
CREATE OR REPLACE FUNCTION public.automation_incident_audit_trace(
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
 WITH trace AS (
   SELECT 'incident_status'::text AS kind,ev.id::text AS ref,
     ev.created_at AS at,
     jsonb_build_object('state',ev.to_status,'type',ev.kind) AS metadata
   FROM public.automation_incident_events ev
   WHERE ev.user_id=p_user_id AND ev.incident_id=p_incident_id
   UNION ALL
   SELECT 'evidence_capture',ev.id::text,ev.captured_at,
     jsonb_build_object('evidenceKind',ev.evidence_kind,'sourceId',ev.source_id)
   FROM public.automation_incident_evidence ev
   WHERE ev.user_id=p_user_id AND ev.incident_id=p_incident_id
   UNION ALL
   SELECT 'plan_review',ev.id::text,ev.created_at,
     jsonb_build_object('stepKind',ev.step_kind,'type',ev.kind)
   FROM public.automation_investigation_events ev
   JOIN public.automation_investigation_plans p ON p.id=ev.plan_id
   WHERE ev.user_id=p_user_id AND p.user_id=p_user_id AND p.incident_id=p_incident_id
   UNION ALL
   SELECT 'closure_decision',ev.id::text,ev.created_at,
     jsonb_build_object('decision',ev.decision,'incidentRevision',ev.incident_revision)
   FROM public.automation_incident_closure_decisions ev
   WHERE ev.user_id=p_user_id AND ev.incident_id=p_incident_id
   UNION ALL
   SELECT 'reopen_decision',ev.id::text,ev.created_at,
     jsonb_build_object('decision',ev.decision,'reason',ev.reason,
       'incidentRevision',ev.incident_revision,'evidenceId',ev.evidence_id)
   FROM public.automation_incident_reopen_decisions ev
   WHERE ev.user_id=p_user_id AND ev.incident_id=p_incident_id
 ), counted AS (
   SELECT kind,ref,at,metadata FROM trace
 )
 SELECT count(*)::integer,
   COALESCE(jsonb_agg(jsonb_build_object(
     'kind',kind,'ref',ref,'recordedAt',at,'metadata',metadata)
     ORDER BY at,kind,ref),'[]'::jsonb)
 INTO total,items FROM counted;
 RETURN jsonb_build_object('ok',true,'source','owner_database_audit_trace',
   'incidentId',p_incident_id,'rows',items,'total',total,'truncated',false,
   'containsNotes',false,'containsCredentials',false,
   'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_audit_trace(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_audit_trace(uuid,uuid)
 TO service_role;
