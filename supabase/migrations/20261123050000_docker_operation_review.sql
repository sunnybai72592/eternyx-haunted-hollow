-- ETERNYX Docker control review: authenticated, account-owned APPROVAL PLANS.
-- No SQL RPC or Edge endpoint can execute Docker commands.
-- Requires 20261123030000_docker_workspace_enrollment.sql and
-- 20261123040000_docker_agent_signed_reports.sql to be applied first.
CREATE TABLE public.docker_control_policies (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  daily_limit smallint NOT NULL DEFAULT 5 CHECK (daily_limit BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.docker_control_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_control_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.docker_control_policies TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.docker_control_policies TO service_role;
CREATE POLICY "Docker control policy owner read" ON public.docker_control_policies
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

CREATE TABLE public.docker_control_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  request_key uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('start','stop','restart')),
  container_id text NOT NULL CHECK (container_id ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','approved','rejected','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  resolved_at timestamptz,
  CONSTRAINT docker_control_request_agent_owner
    FOREIGN KEY (agent_id,owner_id) REFERENCES public.docker_agent_registrations(id,owner_id) ON DELETE CASCADE,
  CONSTRAINT docker_control_request_key UNIQUE(owner_id,request_key),
  CONSTRAINT docker_control_request_owner_pair UNIQUE(id,owner_id),
  CONSTRAINT docker_control_request_state_consistency CHECK (
    (state='pending' AND approved_at IS NULL AND resolved_at IS NULL)
    OR (state='approved' AND approved_at IS NOT NULL AND resolved_at IS NULL)
    OR (state IN ('rejected','cancelled') AND resolved_at IS NOT NULL)
  )
);
CREATE INDEX docker_control_requests_owner_recent
  ON public.docker_control_requests(owner_id,requested_at DESC);
CREATE INDEX docker_control_requests_agent_state
  ON public.docker_control_requests(agent_id,state,expires_at);
ALTER TABLE public.docker_control_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_control_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.docker_control_requests TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.docker_control_requests TO service_role;
CREATE POLICY "Docker operation request owner read" ON public.docker_control_requests
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

CREATE TABLE public.docker_control_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('requested','approved','rejected','cancelled')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT docker_control_event_request_owner
    FOREIGN KEY(request_id,owner_id) REFERENCES public.docker_control_requests(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX docker_control_events_owner_recent
  ON public.docker_control_events(owner_id,id DESC);
ALTER TABLE public.docker_control_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_control_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.docker_control_events TO authenticated;
GRANT SELECT,INSERT ON public.docker_control_events TO service_role;
CREATE POLICY "Docker operation event owner read" ON public.docker_control_events
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

-- All mutations require a verified owner JWT at the Edge Function. SQL callers
-- must use service_role; PUBLIC/anon/authenticated receive no EXECUTE privilege.
CREATE FUNCTION public.docker_set_control_policy(
  p_owner_id uuid,p_enabled boolean,p_daily_limit integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_now timestamptz:=pg_catalog.statement_timestamp();
BEGIN
  IF p_owner_id IS NULL OR p_enabled IS NULL OR p_daily_limit NOT BETWEEN 1 AND 10
     OR p_daily_limit IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
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
  RETURN jsonb_build_object('ok',true,'enabled',p_enabled,'daily_limit',p_daily_limit);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_set_control_policy(uuid,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_set_control_policy(uuid,boolean,integer) TO service_role;

CREATE FUNCTION public.docker_create_control_request(
  p_owner_id uuid,p_agent_id uuid,p_request_key uuid,p_operation text,p_container_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
  v_now timestamptz:=pg_catalog.statement_timestamp();
  v_policy public.docker_control_policies%ROWTYPE;
  v_old public.docker_control_requests%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_owner_id IS NULL OR p_agent_id IS NULL OR p_request_key IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('start','stop','restart')
    OR p_container_id IS NULL OR p_container_id !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
  SELECT * INTO v_old FROM public.docker_control_requests
    WHERE owner_id=p_owner_id AND request_key=p_request_key;
  IF FOUND THEN
    IF v_old.agent_id=p_agent_id AND v_old.operation=p_operation
       AND v_old.container_id=p_container_id THEN
      RETURN jsonb_build_object('ok',true,'request_id',v_old.id,
        'state',v_old.state,'expires_at',v_old.expires_at,'reused',true);
    END IF;
    RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
  END IF;
  SELECT * INTO v_policy FROM public.docker_control_policies
    WHERE owner_id=p_owner_id AND enabled=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','policy_disabled'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.docker_agent_registrations a
    JOIN public.docker_agent_reports r ON r.agent_id=a.id AND r.owner_id=a.owner_id
    WHERE a.id=p_agent_id AND a.owner_id=p_owner_id AND a.status='key_verified'
      AND a.revoked_at IS NULL AND r.engine_available=true
      AND r.last_received_at>v_now-interval '3 minutes'
  ) THEN RETURN jsonb_build_object('ok',false,'reason','agent_unavailable'); END IF;
  IF (SELECT count(*) FROM public.docker_control_requests
       WHERE owner_id=p_owner_id AND requested_at>v_now-interval '24 hours')>=v_policy.daily_limit
  THEN RETURN jsonb_build_object('ok',false,'reason','daily_limit'); END IF;
  IF (SELECT count(*) FROM public.docker_control_requests
      WHERE owner_id=p_owner_id AND state IN ('pending','approved') AND expires_at>v_now)>=3
  THEN RETURN jsonb_build_object('ok',false,'reason','open_limit'); END IF;
  INSERT INTO public.docker_control_requests(
    owner_id,agent_id,request_key,operation,container_id,expires_at)
    VALUES(p_owner_id,p_agent_id,p_request_key,p_operation,p_container_id,v_now+interval '10 minutes')
    RETURNING id INTO v_id;
  INSERT INTO public.docker_control_events(owner_id,request_id,event_kind)
    VALUES(p_owner_id,v_id,'requested');
  RETURN jsonb_build_object('ok',true,'request_id',v_id,
    'state','pending','expires_at',v_now+interval '10 minutes','reused',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_create_control_request(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_create_control_request(uuid,uuid,uuid,text,text)
  TO service_role;

CREATE FUNCTION public.docker_decide_control_request(
  p_owner_id uuid,p_request_id uuid,p_decision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
  v_now timestamptz:=pg_catalog.statement_timestamp();
  v_request public.docker_control_requests%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR p_request_id IS NULL
    OR p_decision IS NULL OR p_decision NOT IN ('approve','reject','cancel') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_owner_id::text));
  SELECT * INTO v_request FROM public.docker_control_requests
    WHERE id=p_request_id AND owner_id=p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF v_request.expires_at<=v_now THEN
    RETURN jsonb_build_object('ok',false,'reason','expired');
  END IF;
  IF (p_decision IN ('approve','reject') AND v_request.state<>'pending')
    OR (p_decision='cancel' AND v_request.state NOT IN ('pending','approved')) THEN
    RETURN jsonb_build_object('ok',false,'reason','already_decided');
  END IF;
  IF p_decision='approve' THEN
    IF NOT EXISTS (SELECT 1 FROM public.docker_control_policies
      WHERE owner_id=p_owner_id AND enabled=true) THEN
      RETURN jsonb_build_object('ok',false,'reason','policy_disabled');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.docker_agent_registrations a
      JOIN public.docker_agent_reports r ON r.agent_id=a.id AND r.owner_id=a.owner_id
      WHERE a.id=v_request.agent_id AND a.owner_id=p_owner_id
        AND a.status='key_verified' AND a.revoked_at IS NULL
        AND r.engine_available=true AND r.last_received_at>v_now-interval '3 minutes'
    ) THEN RETURN jsonb_build_object('ok',false,'reason','agent_unavailable'); END IF;
    UPDATE public.docker_control_requests
      SET state='approved',approved_at=v_now WHERE id=p_request_id AND owner_id=p_owner_id;
  ELSIF p_decision='reject' THEN
    UPDATE public.docker_control_requests
      SET state='rejected',resolved_at=v_now WHERE id=p_request_id AND owner_id=p_owner_id;
  ELSE
    UPDATE public.docker_control_requests
      SET state='cancelled',resolved_at=v_now WHERE id=p_request_id AND owner_id=p_owner_id;
  END IF;
  INSERT INTO public.docker_control_events(owner_id,request_id,event_kind)
    VALUES(p_owner_id,p_request_id,
      CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected'
           ELSE 'cancelled' END);
  RETURN jsonb_build_object('ok',true,'request_id',p_request_id,
    'state',CASE p_decision WHEN 'approve' THEN 'approved'
      WHEN 'reject' THEN 'rejected' ELSE 'cancelled' END,
    'execution_status','not_executed');
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_decide_control_request(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_decide_control_request(uuid,uuid,text) TO service_role;
