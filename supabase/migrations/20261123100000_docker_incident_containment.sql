-- ETERNYX Docker incident containment & deliberate release.
-- A hold stops new claim/authorization via the existing enabled-policy guard.
-- Already-issued 15-second signed permits may remain in flight. No remote kill.
-- Requires Docker incident triage and signed dispatch migrations.
ALTER TABLE public.docker_control_policies
  ADD COLUMN incident_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN incident_hold_at timestamptz,
  ADD CONSTRAINT docker_policy_hold_consistency CHECK (
    (incident_hold AND NOT enabled AND incident_hold_at IS NOT NULL)
    OR (NOT incident_hold AND incident_hold_at IS NULL)
  );
ALTER TABLE public.docker_lab_incidents
  DROP CONSTRAINT docker_lab_incidents_status_check;
ALTER TABLE public.docker_lab_incidents
  ADD CONSTRAINT docker_lab_incidents_status_check
  CHECK (status IN ('open','investigating','reviewed','escalated'));
ALTER TABLE public.docker_lab_incident_events
  DROP CONSTRAINT docker_lab_incident_events_action_check;
ALTER TABLE public.docker_lab_incident_events
  ADD CONSTRAINT docker_lab_incident_events_action_check
  CHECK (action IN ('opened','investigating','reviewed','escalated','hold_released'));

CREATE OR REPLACE FUNCTION public.docker_set_control_policy(
  p_owner_id uuid,p_enabled boolean,p_daily_limit integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_now timestamptz:=pg_catalog.statement_timestamp();
BEGIN
  IF p_owner_id IS NULL OR p_enabled IS NULL OR p_daily_limit NOT BETWEEN 1 AND 10
     OR p_daily_limit IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
  IF p_enabled IS TRUE AND EXISTS (
    SELECT 1 FROM public.docker_control_policies
      WHERE owner_id=p_owner_id AND incident_hold=true
  ) THEN
    RETURN jsonb_build_object('ok',false,'reason','incident_hold');
  END IF;
  INSERT INTO public.docker_control_policies(owner_id,enabled,daily_limit,updated_at)
    VALUES(p_owner_id,p_enabled,p_daily_limit,v_now)
  ON CONFLICT(owner_id) DO UPDATE
    SET enabled=EXCLUDED.enabled,daily_limit=EXCLUDED.daily_limit,updated_at=v_now;
  IF p_enabled IS FALSE THEN
    WITH cancelled AS (
      UPDATE public.docker_control_requests
      SET state='cancelled',resolved_at=v_now
      WHERE owner_id=p_owner_id AND state IN ('pending','approved')
      RETURNING id
    ) INSERT INTO public.docker_control_events(owner_id,request_id,event_kind)
      SELECT p_owner_id,id,'cancelled' FROM cancelled;
  END IF;
  RETURN jsonb_build_object('ok',true,'enabled',p_enabled,'daily_limit',p_daily_limit,'incident_hold',
    COALESCE((SELECT incident_hold FROM public.docker_control_policies WHERE owner_id=p_owner_id),false));
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_set_control_policy(uuid,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_set_control_policy(uuid,boolean,integer) TO service_role;


CREATE OR REPLACE FUNCTION public.docker_lab_triage_incident(
  p_owner_id uuid,p_incident_id uuid,p_status text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_case public.docker_lab_incidents%ROWTYPE;v_now timestamptz:=pg_catalog.statement_timestamp();
BEGIN
 IF p_owner_id IS NULL OR p_incident_id IS NULL OR p_status IS NULL
   OR p_status NOT IN ('investigating','reviewed') OR p_note IS NULL
   OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 12 AND 500
   OR p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_case FROM public.docker_lab_incidents
   WHERE id=p_incident_id AND owner_id=p_owner_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF v_case.status='escalated' THEN
   RETURN jsonb_build_object('ok',false,'reason','release_required');
 END IF;
 IF v_case.status=p_status THEN RETURN jsonb_build_object('ok',true,
   'incident_id',p_incident_id,'status',p_status,'reused',true); END IF;
 IF (SELECT count(*) FROM public.docker_lab_incident_events
     WHERE incident_id=p_incident_id)>=20 THEN
   RETURN jsonb_build_object('ok',false,'reason','event_limit');
 END IF;
 UPDATE public.docker_lab_incidents SET status=p_status,updated_at=v_now
   WHERE id=p_incident_id AND owner_id=p_owner_id;
 INSERT INTO public.docker_lab_incident_events(incident_id,owner_id,action,note,occurred_at)
   VALUES(p_incident_id,p_owner_id,p_status,pg_catalog.btrim(p_note),v_now);
 RETURN jsonb_build_object('ok',true,'incident_id',p_incident_id,
   'status',p_status,'reused',false,'docker_execution_verified',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_lab_triage_incident(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_lab_triage_incident(uuid,uuid,text,text) TO service_role;

-- Used only after the Edge function verifies the signed-in owner.
-- All owner mutations serialize via the same advisory lock as requests/policy.
CREATE FUNCTION public.docker_lab_escalate_incident(
  p_owner_id uuid,p_incident_id uuid,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_now timestamptz:=pg_catalog.statement_timestamp();
 v_case public.docker_lab_incidents%ROWTYPE;
 v_cancelled integer:=0;
BEGIN
 IF p_owner_id IS NULL OR p_incident_id IS NULL OR p_note IS NULL
   OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 20 AND 500
   OR p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_case FROM public.docker_lab_incidents
   WHERE id=p_incident_id AND owner_id=p_owner_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF v_case.status='escalated' THEN
   RETURN jsonb_build_object('ok',true,'incident_id',p_incident_id,
     'status','escalated','incident_hold',true,'reused',true);
 END IF;
 IF (SELECT count(*) FROM public.docker_lab_incident_events
     WHERE incident_id=p_incident_id)>=20 THEN
   RETURN jsonb_build_object('ok',false,'reason','event_limit');
 END IF;
 INSERT INTO public.docker_control_policies(owner_id,enabled,incident_hold,incident_hold_at,updated_at)
   VALUES(p_owner_id,false,true,v_now,v_now)
 ON CONFLICT(owner_id) DO UPDATE
   SET enabled=false,incident_hold=true,incident_hold_at=v_now,updated_at=v_now;
 -- Outstanding plans are cancelled transactionally; previously issued permits
 -- cannot be clawed back and are explicitly NOT represented as cancelled execution.
 WITH cancelled AS (
   UPDATE public.docker_control_requests
     SET state='cancelled',resolved_at=v_now
     WHERE owner_id=p_owner_id AND state IN ('pending','approved')
     RETURNING id
 ), events AS (
   INSERT INTO public.docker_control_events(owner_id,request_id,event_kind)
     SELECT p_owner_id,id,'cancelled' FROM cancelled RETURNING id
 )
 SELECT count(*)::integer INTO v_cancelled FROM cancelled;
 UPDATE public.docker_lab_incidents SET status='escalated',updated_at=v_now
   WHERE id=p_incident_id AND owner_id=p_owner_id;
 INSERT INTO public.docker_lab_incident_events(incident_id,owner_id,action,note,occurred_at)
   VALUES(p_incident_id,p_owner_id,'escalated',pg_catalog.btrim(p_note),v_now);
 RETURN jsonb_build_object('ok',true,'incident_id',p_incident_id,
   'status','escalated','incident_hold',true,'cancelled_plans',v_cancelled,
   'already_issued_permits_revoked',false,'reused',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_lab_escalate_incident(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_lab_escalate_incident(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.docker_lab_release_incident_hold(
  p_owner_id uuid,p_incident_id uuid,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_now timestamptz:=pg_catalog.statement_timestamp();
 v_case public.docker_lab_incidents%ROWTYPE;
 v_remaining integer:=0;
BEGIN
 IF p_owner_id IS NULL OR p_incident_id IS NULL OR p_note IS NULL
   OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 20 AND 500
   OR p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_case FROM public.docker_lab_incidents
   WHERE id=p_incident_id AND owner_id=p_owner_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF v_case.status<>'escalated' THEN
   RETURN jsonb_build_object('ok',false,'reason','not_escalated');
 END IF;
 IF (SELECT count(*) FROM public.docker_lab_incident_events
     WHERE incident_id=p_incident_id)>=20 THEN
   RETURN jsonb_build_object('ok',false,'reason','event_limit');
 END IF;
 UPDATE public.docker_lab_incidents SET status='investigating',updated_at=v_now
   WHERE id=p_incident_id AND owner_id=p_owner_id;
 INSERT INTO public.docker_lab_incident_events(incident_id,owner_id,action,note,occurred_at)
   VALUES(p_incident_id,p_owner_id,'hold_released',pg_catalog.btrim(p_note),v_now);
 SELECT count(*)::integer INTO v_remaining FROM public.docker_lab_incidents
   WHERE owner_id=p_owner_id AND status='escalated';
 IF v_remaining=0 THEN
   UPDATE public.docker_control_policies SET incident_hold=false,
     incident_hold_at=NULL,enabled=false,updated_at=v_now WHERE owner_id=p_owner_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'incident_id',p_incident_id,
   'status','investigating','incident_hold',v_remaining>0,
   'review_policy_reenabled',false,'other_escalations_remaining',v_remaining);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_lab_release_incident_hold(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_lab_release_incident_hold(uuid,uuid,text)
  TO service_role;
