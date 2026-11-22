-- ETERNYX Automation Phase 2O: manual investigation plans and factual
-- day-by-day case activity. No job dispatch, schedule restore or auto retry.
CREATE TABLE public.automation_investigation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.automation_incidents(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  incident_revision_at_creation integer NOT NULL CHECK(incident_revision_at_creation>0),
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps)='array'
    AND jsonb_array_length(steps) BETWEEN 1 AND 6),
  stage text NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','reviewed','closed')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 2147483647),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,incident_id),UNIQUE(user_id,request_key)
);
CREATE INDEX automation_plan_owner_time ON public.automation_investigation_plans(user_id,updated_at DESC);
ALTER TABLE public.automation_investigation_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_investigation_plans FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.automation_investigation_plans TO service_role;

CREATE TABLE public.automation_investigation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.automation_investigation_plans(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  expected_revision integer NOT NULL CHECK(expected_revision BETWEEN 1 AND 2147483646),
  kind text NOT NULL CHECK(kind IN ('step_acknowledged','reviewed','closed')),
  step_kind text CHECK(step_kind IS NULL OR step_kind IN
    ('review_evidence','inspect_run_history','inspect_workflow_policy',
     'verify_schedule_state','review_quarantine','document_outcome')),
  note text NOT NULL CHECK(char_length(btrim(note)) BETWEEN 12 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key)
);
CREATE UNIQUE INDEX automation_plan_step_once ON public.automation_investigation_events(plan_id,step_kind)
  WHERE kind='step_acknowledged';
CREATE INDEX automation_plan_events_owner ON public.automation_investigation_events(user_id,plan_id,id);
ALTER TABLE public.automation_investigation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_investigation_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.automation_investigation_events TO service_role;

CREATE OR REPLACE FUNCTION public.automation_create_investigation_plan(
 p_user_id uuid,p_incident_id uuid,p_incident_revision integer,p_steps jsonb,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
  existing public.automation_investigation_plans%ROWTYPE;
  made public.automation_investigation_plans%ROWTYPE;
  step jsonb;seen text[]:=ARRAY[]::text[];kind text;count_today integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL OR p_request_key IS NULL OR
    p_incident_revision IS NULL OR p_incident_revision<1 OR p_steps IS NULL OR
    jsonb_typeof(p_steps)<>'array' OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 6 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 FOR step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
   IF jsonb_typeof(step)<>'string' THEN
     RETURN jsonb_build_object('ok',false,'reason','invalid_steps');
   END IF;
   kind:=step #>> '{}';
   IF kind NOT IN ('review_evidence','inspect_run_history','inspect_workflow_policy',
      'verify_schedule_state','review_quarantine','document_outcome')
      OR kind=ANY(seen) THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_steps');
   END IF;
   seen:=array_append(seen,kind);
 END LOOP;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO existing FROM public.automation_investigation_plans
   WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF existing.incident_id IS DISTINCT FROM p_incident_id OR
      existing.incident_revision_at_creation IS DISTINCT FROM p_incident_revision OR
      existing.steps IS DISTINCT FROM p_steps THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,'planId',existing.id,
     'stage',existing.stage,'revision',existing.revision,
     'noExternalExecution',true);
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=p_incident_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF inc.revision<>p_incident_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_incident');
 END IF;
 IF inc.status<>'investigating' THEN
   RETURN jsonb_build_object('ok',false,'reason','requires_investigating');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.automation_incident_evidence
   WHERE user_id=p_user_id AND incident_id=p_incident_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','missing_captured_evidence');
 END IF;
 IF EXISTS(SELECT 1 FROM public.automation_investigation_plans
   WHERE user_id=p_user_id AND incident_id=p_incident_id) THEN
   RETURN jsonb_build_object('ok',false,'reason','already_exists');
 END IF;
 SELECT count(*) INTO count_today FROM public.automation_investigation_plans
    WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours';
 IF count_today>=10 THEN
   RETURN jsonb_build_object('ok',false,'reason','plan_daily_limit');
 END IF;
 INSERT INTO public.automation_investigation_plans(
   user_id,incident_id,request_key,incident_revision_at_creation,steps
 ) VALUES(p_user_id,p_incident_id,p_request_key,p_incident_revision,p_steps)
 RETURNING * INTO made;
 RETURN jsonb_build_object('ok',true,'replayed',false,'planId',made.id,
   'stage',made.stage,'revision',made.revision,'noExternalExecution',true);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_create_investigation_plan(uuid,uuid,integer,jsonb,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_create_investigation_plan(uuid,uuid,integer,jsonb,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_acknowledge_investigation_step(
 p_user_id uuid,p_plan_id uuid,p_expected_revision integer,
 p_step_kind text,p_note text,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE plan public.automation_investigation_plans%ROWTYPE;
  past public.automation_investigation_events%ROWTYPE;
  inc public.automation_incidents%ROWTYPE;
  ack_count integer;
BEGIN
 IF p_user_id IS NULL OR p_plan_id IS NULL OR p_request_key IS NULL OR
    p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 2147483646 OR
    p_step_kind IS NULL OR p_step_kind NOT IN
      ('review_evidence','inspect_run_history','inspect_workflow_policy',
       'verify_schedule_state','review_quarantine','document_outcome') OR
    p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 12 AND 500 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO past FROM public.automation_investigation_events
   WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF past.plan_id IS DISTINCT FROM p_plan_id OR
      past.kind<>'step_acknowledged' OR past.step_kind IS DISTINCT FROM p_step_kind OR
      past.note IS DISTINCT FROM btrim(p_note) OR
      past.expected_revision IS DISTINCT FROM p_expected_revision THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   SELECT * INTO plan FROM public.automation_investigation_plans
     WHERE user_id=p_user_id AND id=p_plan_id;
   RETURN jsonb_build_object('ok',true,'replayed',true,'planId',p_plan_id,
     'stage',plan.stage,'revision',plan.revision,'noExternalExecution',true);
 END IF;
 SELECT * INTO plan FROM public.automation_investigation_plans
   WHERE user_id=p_user_id AND id=p_plan_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF plan.revision<>p_expected_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_plan');
 END IF;
 IF plan.stage<>'draft' THEN
   RETURN jsonb_build_object('ok',false,'reason','plan_not_draft');
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=plan.incident_id;
 IF NOT FOUND OR inc.status<>'investigating' THEN
   RETURN jsonb_build_object('ok',false,'reason','requires_investigating');
 END IF;
 IF NOT plan.steps ? p_step_kind THEN
   -- jsonb ? on an array of strings correctly tests membership.
   RETURN jsonb_build_object('ok',false,'reason','step_not_planned');
 END IF;
 IF EXISTS(SELECT 1 FROM public.automation_investigation_events
   WHERE user_id=p_user_id AND plan_id=p_plan_id AND
     kind='step_acknowledged' AND step_kind=p_step_kind) THEN
   RETURN jsonb_build_object('ok',false,'reason','already_acknowledged');
 END IF;
 INSERT INTO public.automation_investigation_events(
   user_id,plan_id,request_key,expected_revision,kind,step_kind,note
 ) VALUES(p_user_id,p_plan_id,p_request_key,p_expected_revision,
     'step_acknowledged',p_step_kind,btrim(p_note));
 UPDATE public.automation_investigation_plans
   SET revision=revision+1,updated_at=pg_catalog.statement_timestamp()
   WHERE id=p_plan_id AND user_id=p_user_id RETURNING * INTO plan;
 RETURN jsonb_build_object('ok',true,'replayed',false,
   'planId',plan.id,'stage',plan.stage,'revision',plan.revision,
   'acknowledgedStep',p_step_kind,'noExternalExecution',true,
   'userAttestationOnly',true);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_acknowledge_investigation_step(
 uuid,uuid,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_acknowledge_investigation_step(
 uuid,uuid,integer,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_transition_investigation_plan(
 p_user_id uuid,p_plan_id uuid,p_expected_revision integer,
 p_next_stage text,p_note text,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE plan public.automation_investigation_plans%ROWTYPE;
  past public.automation_investigation_events%ROWTYPE;
  inc public.automation_incidents%ROWTYPE;
  checked integer;
BEGIN
 IF p_user_id IS NULL OR p_plan_id IS NULL OR p_request_key IS NULL OR
    p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 2147483646 OR
    p_next_stage IS NULL OR p_next_stage NOT IN ('reviewed','closed') OR
    p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 12 AND 500 THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
 SELECT * INTO past FROM public.automation_investigation_events
   WHERE user_id=p_user_id AND request_key=p_request_key;
 IF FOUND THEN
   IF past.plan_id IS DISTINCT FROM p_plan_id OR
      past.kind IS DISTINCT FROM p_next_stage OR
      past.note IS DISTINCT FROM btrim(p_note) OR
      past.expected_revision IS DISTINCT FROM p_expected_revision THEN
     RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
   END IF;
   SELECT * INTO plan FROM public.automation_investigation_plans
      WHERE id=p_plan_id AND user_id=p_user_id;
   RETURN jsonb_build_object('ok',true,'replayed',true,'planId',p_plan_id,
      'stage',plan.stage,'revision',plan.revision,'noExternalExecution',true);
 END IF;
 SELECT * INTO plan FROM public.automation_investigation_plans
   WHERE id=p_plan_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF plan.revision<>p_expected_revision THEN
   RETURN jsonb_build_object('ok',false,'reason','stale_plan');
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=plan.incident_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF p_next_stage='reviewed' THEN
   IF plan.stage<>'draft' OR inc.status<>'investigating' THEN
     RETURN jsonb_build_object('ok',false,'reason','invalid_plan_transition');
   END IF;
   SELECT count(*) INTO checked FROM public.automation_investigation_events
     WHERE user_id=p_user_id AND plan_id=p_plan_id AND kind='step_acknowledged';
   IF checked<>jsonb_array_length(plan.steps) THEN
     RETURN jsonb_build_object('ok',false,'reason','unreviewed_steps');
   END IF;
 ELSE
   IF plan.stage<>'reviewed' OR inc.status<>'resolved' THEN
     RETURN jsonb_build_object('ok',false,'reason','invalid_plan_transition');
   END IF;
 END IF;
 INSERT INTO public.automation_investigation_events(
   user_id,plan_id,request_key,expected_revision,kind,step_kind,note
 ) VALUES(p_user_id,p_plan_id,p_request_key,p_expected_revision,
    p_next_stage,NULL,btrim(p_note));
 UPDATE public.automation_investigation_plans
   SET stage=p_next_stage,revision=revision+1,
       updated_at=pg_catalog.statement_timestamp()
   WHERE user_id=p_user_id AND id=p_plan_id RETURNING * INTO plan;
 RETURN jsonb_build_object('ok',true,'replayed',false,
   'planId',plan.id,'stage',plan.stage,'revision',plan.revision,
   'noExternalExecution',true,'userAttestationOnly',true);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_transition_investigation_plan(
 uuid,uuid,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_transition_investigation_plan(
 uuid,uuid,integer,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_read_investigation_plan(
 p_user_id uuid,p_incident_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE inc public.automation_incidents%ROWTYPE;
  plan public.automation_investigation_plans%ROWTYPE;
  events jsonb;acknowledged integer;origin_count integer;
BEGIN
 IF p_user_id IS NULL OR p_incident_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT * INTO inc FROM public.automation_incidents
   WHERE user_id=p_user_id AND id=p_incident_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO plan FROM public.automation_investigation_plans
   WHERE user_id=p_user_id AND incident_id=p_incident_id;
 SELECT count(*) INTO origin_count FROM public.automation_incident_evidence
    WHERE user_id=p_user_id AND incident_id=p_incident_id;
 IF NOT FOUND OR plan.id IS NULL THEN
   RETURN jsonb_build_object('ok',true,'source','owner_case_and_evidence',
     'incidentId',inc.id,'incidentStatus',inc.status,'incidentRevision',inc.revision,
     'evidenceCount',origin_count,'plan',NULL,'events','[]'::jsonb,
     'externalExecutionTriggered',false);
 END IF;
 SELECT count(*) INTO acknowledged FROM public.automation_investigation_events
   WHERE user_id=p_user_id AND plan_id=plan.id AND kind='step_acknowledged';
 SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id ASC),'[]'::jsonb)
   INTO events FROM (
    SELECT id,kind,step_kind,note,created_at
    FROM public.automation_investigation_events
    WHERE user_id=p_user_id AND plan_id=plan.id
    ORDER BY id ASC LIMIT 8
   ) e;
 RETURN jsonb_build_object('ok',true,'source','owner_case_and_evidence',
   'incidentId',inc.id,'incidentStatus',inc.status,'incidentRevision',inc.revision,
   'evidenceCount',origin_count,'plan',jsonb_build_object(
      'id',plan.id,'stage',plan.stage,'revision',plan.revision,
      'steps',plan.steps,'acknowledged',acknowledged,
      'createdAt',plan.created_at,'updatedAt',plan.updated_at),
   'events',events,'truncated',false,
   'externalExecutionTriggered',false,'reviewAcknowledgmentOnly',true);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_read_investigation_plan(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_read_investigation_plan(uuid,uuid)
 TO service_role;

-- UTC day-bucket report from persisted owner-only case creations/resolution
-- transitions. Never infer missing failures or worker uptime.
CREATE OR REPLACE FUNCTION public.automation_incident_daily_trend(
 p_user_id uuid,p_days integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $body$
DECLARE last_day date;first_day date;rows jsonb;created_total integer;
  resolved_total integer;
BEGIN
 IF p_user_id IS NULL OR p_days IS NULL OR p_days NOT IN (7,30) THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 last_day:=(pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::date;
 first_day:=last_day-(p_days-1);
 WITH days AS (
   SELECT (first_day+offset)::date AS day FROM generate_series(0,p_days-1) offset
 ), openings AS (
   SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*) AS ct
   FROM public.automation_incidents
   WHERE user_id=p_user_id AND (created_at AT TIME ZONE 'UTC')::date BETWEEN first_day AND last_day
   GROUP BY 1
 ), resolutions AS (
   SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*) AS ct
   FROM public.automation_incident_events
   WHERE user_id=p_user_id AND to_status='resolved'
     AND (created_at AT TIME ZONE 'UTC')::date BETWEEN first_day AND last_day
   GROUP BY 1
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'date',days.day,'casesOpened',COALESCE(o.ct,0),
   'resolutionEvents',COALESCE(r.ct,0)) ORDER BY days.day),'[]'::jsonb),
   COALESCE(sum(o.ct),0),COALESCE(sum(r.ct),0)
 INTO rows,created_total,resolved_total
 FROM days LEFT JOIN openings o ON o.day=days.day
 LEFT JOIN resolutions r ON r.day=days.day;
 RETURN jsonb_build_object('ok',true,'source','recorded_incident_activity',
   'rangeDays',p_days,'timezone','UTC','days',rows,
   'casesOpened',created_total,'resolutionEvents',resolved_total,
   'automatedFailureDetection',false,'actualWorkerUptimeMeasured',false,
   'externalExecutionTriggered',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.automation_incident_daily_trend(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_incident_daily_trend(uuid,integer)
 TO service_role;
