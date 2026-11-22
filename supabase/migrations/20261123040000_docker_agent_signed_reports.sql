-- ETERNYX Docker Phase: signed push-only agent reports.
-- "reporting_recently" is NOT evidence of physical server ownership, trust,
-- remote reachability, or independently verified Docker operations.
-- Migration follows 20261123030000_docker_workspace_enrollment.sql.

ALTER TABLE public.docker_agent_registrations
  ADD CONSTRAINT docker_agent_identity_owner_pair UNIQUE(id, owner_id);

CREATE TABLE public.docker_agent_reports (
  agent_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_signed_at timestamptz NOT NULL,
  last_received_at timestamptz NOT NULL DEFAULT now(),
  last_nonce_hash text NOT NULL CHECK (last_nonce_hash ~ '^[0-9a-f]{64}$'),
  engine_available boolean NOT NULL,
  engine_version text NOT NULL DEFAULT '' CHECK (char_length(engine_version)<=40),
  container_count integer CHECK (container_count BETWEEN 0 AND 5000),
  accepted_count integer NOT NULL DEFAULT 1 CHECK (accepted_count BETWEEN 1 AND 2147483647),
  CONSTRAINT docker_agent_report_owner FOREIGN KEY (agent_id, owner_id)
    REFERENCES public.docker_agent_registrations(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT docker_agent_report_truth CHECK (
    (NOT engine_available AND engine_version='' AND container_count IS NULL)
    OR (engine_available AND engine_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$')
  )
);
CREATE INDEX docker_agent_reports_owner_idx ON public.docker_agent_reports(owner_id,last_received_at DESC);
ALTER TABLE public.docker_agent_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_agent_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.docker_agent_reports TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.docker_agent_reports TO service_role;
CREATE POLICY "Read owned Docker agent reports" ON public.docker_agent_reports
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

CREATE TABLE public.docker_agent_report_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  engine_available boolean NOT NULL,
  CONSTRAINT docker_agent_event_owner FOREIGN KEY (agent_id,owner_id)
    REFERENCES public.docker_agent_registrations(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX docker_agent_report_events_agent_idx
  ON public.docker_agent_report_events(agent_id,id DESC);
ALTER TABLE public.docker_agent_report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_agent_report_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.docker_agent_report_events TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.docker_agent_report_events TO service_role;
CREATE POLICY "Read owned Docker report audit" ON public.docker_agent_report_events
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

-- SECURITY INVOKER, service role only. The Edge Function verifies the
-- Ed25519 signature BEFORE calling this transactional write boundary.
CREATE FUNCTION public.docker_accept_signed_report(
  p_agent_id uuid, p_signed_at timestamptz, p_nonce_hash text,
  p_engine_available boolean, p_engine_version text, p_container_count integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $report$
DECLARE
  v_identity public.docker_agent_registrations%ROWTYPE;
  v_previous public.docker_agent_reports%ROWTYPE;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF p_agent_id IS NULL OR p_signed_at IS NULL OR p_nonce_hash IS NULL
    OR p_nonce_hash !~ '^[0-9a-f]{64}$'
    OR p_engine_available IS NULL OR p_engine_version IS NULL
    OR char_length(p_engine_version)>40
    OR (p_container_count IS NOT NULL AND p_container_count NOT BETWEEN 0 AND 5000)
    OR (NOT p_engine_available AND (p_engine_version<>'' OR p_container_count IS NOT NULL))
    OR (p_engine_available AND p_engine_version !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$')
  THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  IF p_signed_at < v_now - interval '90 seconds'
    OR p_signed_at > v_now + interval '60 seconds' THEN
    RETURN jsonb_build_object('ok',false,'reason','timestamp_out_of_window');
  END IF;
  SELECT * INTO v_identity FROM public.docker_agent_registrations
    WHERE id=p_agent_id FOR UPDATE;
  IF NOT FOUND OR v_identity.status<>'key_verified'
    OR v_identity.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','identity_unavailable');
  END IF;
  SELECT * INTO v_previous FROM public.docker_agent_reports
    WHERE agent_id=p_agent_id FOR UPDATE;
  IF FOUND THEN
    IF p_signed_at<=v_previous.last_signed_at
      OR p_nonce_hash=v_previous.last_nonce_hash THEN
      RETURN jsonb_build_object('ok',false,'reason','replayed_or_out_of_order');
    END IF;
    IF v_previous.last_received_at > v_now-interval '15 seconds' THEN
      RETURN jsonb_build_object('ok',false,'reason','rate_limited');
    END IF;
    IF v_previous.accepted_count>=2147483647 THEN
      RETURN jsonb_build_object('ok',false,'reason','limit_reached');
    END IF;
  END IF;
  INSERT INTO public.docker_agent_reports(
    agent_id,owner_id,last_signed_at,last_received_at,last_nonce_hash,
    engine_available,engine_version,container_count,accepted_count
  ) VALUES (
    p_agent_id,v_identity.owner_id,p_signed_at,v_now,p_nonce_hash,
    p_engine_available,p_engine_version,p_container_count,1
  ) ON CONFLICT(agent_id) DO UPDATE SET
    last_signed_at=excluded.last_signed_at,
    last_received_at=excluded.last_received_at,
    last_nonce_hash=excluded.last_nonce_hash,
    engine_available=excluded.engine_available,
    engine_version=excluded.engine_version,
    container_count=excluded.container_count,
    accepted_count=public.docker_agent_reports.accepted_count+1;
  INSERT INTO public.docker_agent_report_events(agent_id,owner_id,received_at,engine_available)
    VALUES(p_agent_id,v_identity.owner_id,v_now,p_engine_available);
  DELETE FROM public.docker_agent_report_events
    WHERE agent_id=p_agent_id AND id NOT IN (
      SELECT id FROM public.docker_agent_report_events
      WHERE agent_id=p_agent_id ORDER BY id DESC LIMIT 24
    );
  RETURN jsonb_build_object('ok',true,'agent_id',p_agent_id,
    'received_at',v_now,'reporting_status','signed_report_received');
END;
$report$;
REVOKE ALL ON FUNCTION public.docker_accept_signed_report(
  uuid,timestamptz,text,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_accept_signed_report(
  uuid,timestamptz,text,boolean,text,integer) TO service_role;
