-- ETERNYX: one-time signed delivery ONLY to hardened, operator-owned local lab containers.
-- Prerequisites: Docker enrollment, signed reports and operation review migrations.
-- Server-side flag DOCKER_REMOTE_LAB_ENABLED must be true or no claim/confirm/receipt is possible.
-- Host agent must independently opt in, pin server signing key and inspect hardened test target.
CREATE TABLE public.docker_command_nonces (
  agent_id uuid NOT NULL REFERENCES public.docker_agent_registrations(id) ON DELETE CASCADE,
  nonce_hash text NOT NULL CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(agent_id,nonce_hash)
);
CREATE INDEX docker_command_nonces_seen ON public.docker_command_nonces(seen_at);
ALTER TABLE public.docker_command_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_command_nonces FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.docker_command_nonces TO service_role;

CREATE TABLE public.docker_command_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  agent_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz,
  state text NOT NULL DEFAULT 'claimed'
    CHECK (state IN ('claimed','reported_completed','reported_failed','reported_guard_denied')),
  reported_at timestamptz,
  CONSTRAINT docker_command_claim_request_owner FOREIGN KEY(request_id,owner_id)
    REFERENCES public.docker_control_requests(id,owner_id) ON DELETE CASCADE,
  CONSTRAINT docker_command_claim_agent_owner FOREIGN KEY(agent_id,owner_id)
    REFERENCES public.docker_agent_registrations(id,owner_id) ON DELETE CASCADE,
  CONSTRAINT docker_command_claim_lifecycle CHECK (
    (state='claimed' AND reported_at IS NULL)
    OR (state<>'claimed' AND authorized_at IS NOT NULL AND reported_at IS NOT NULL)
  )
);
CREATE INDEX docker_command_claims_agent_active
  ON public.docker_command_claims(agent_id,state,expires_at);
CREATE INDEX docker_command_claims_owner_recent
  ON public.docker_command_claims(owner_id,claimed_at DESC);
ALTER TABLE public.docker_command_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_command_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.docker_command_claims TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.docker_command_claims TO service_role;
CREATE POLICY "Docker signed dispatch claims owned" ON public.docker_command_claims
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

-- Called after Ed25519 signature verification, never from browser SQL clients.
-- Consume one nonce per signed agent action even if there is no pending work.
CREATE FUNCTION public.docker_command_consume_nonce(
  p_agent_id uuid,p_nonce_hash text,p_signed_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_now timestamptz:=pg_catalog.statement_timestamp(); v_owner uuid;
BEGIN
  IF p_agent_id IS NULL OR p_nonce_hash IS NULL
    OR p_nonce_hash !~ '^[0-9a-f]{64}$' OR p_signed_at IS NULL
    OR p_signed_at<v_now-interval '45 seconds'
    OR p_signed_at>v_now+interval '30 seconds' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_or_expired');
  END IF;
  SELECT owner_id INTO v_owner FROM public.docker_agent_registrations
    WHERE id=p_agent_id AND status='key_verified' AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','agent_unavailable'); END IF;
  -- Serialize all signed actions for an agent and fence identical replayed nonces.
  IF (SELECT count(*) FROM public.docker_command_nonces
      WHERE agent_id=p_agent_id AND seen_at>v_now-interval '60 seconds')>=12 THEN
    RETURN jsonb_build_object('ok',false,'reason','rate_limited');
  END IF;
  INSERT INTO public.docker_command_nonces(agent_id,nonce_hash,seen_at)
    VALUES(p_agent_id,p_nonce_hash,v_now) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','replayed'); END IF;
  DELETE FROM public.docker_command_nonces WHERE agent_id=p_agent_id
    AND seen_at<v_now-interval '1 day';
  RETURN jsonb_build_object('ok',true,'owner_id',v_owner);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_command_consume_nonce(uuid,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_command_consume_nonce(uuid,text,timestamptz)
  TO service_role;

CREATE FUNCTION public.docker_command_claim(p_agent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
  v_now timestamptz:=pg_catalog.statement_timestamp();
  v_owner uuid; v_request public.docker_control_requests%ROWTYPE; v_claim uuid;
  v_deadline timestamptz;
BEGIN
  SELECT owner_id INTO v_owner FROM public.docker_agent_registrations
    WHERE id=p_agent_id AND status='key_verified' AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','agent_unavailable'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.docker_control_policies
    WHERE owner_id=v_owner AND enabled=true)
    OR NOT EXISTS(SELECT 1 FROM public.docker_agent_reports
      WHERE agent_id=p_agent_id AND owner_id=v_owner AND engine_available=true
        AND last_received_at>v_now-interval '3 minutes')
    THEN RETURN jsonb_build_object('ok',false,'reason','not_ready'); END IF;
  IF EXISTS(SELECT 1 FROM public.docker_command_claims
    WHERE agent_id=p_agent_id AND state='claimed' AND expires_at>v_now)
    THEN RETURN jsonb_build_object('ok',true,'job',NULL); END IF;
  SELECT * INTO v_request FROM public.docker_control_requests
    WHERE agent_id=p_agent_id AND owner_id=v_owner AND state='approved'
      AND expires_at>v_now AND approved_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM public.docker_command_claims d WHERE d.request_id=id)
    ORDER BY approved_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'job',NULL); END IF;
  v_deadline:=LEAST(v_request.expires_at,v_now+interval '45 seconds');
  INSERT INTO public.docker_command_claims(request_id,agent_id,owner_id,claimed_at,expires_at)
    VALUES(v_request.id,p_agent_id,v_owner,v_now,v_deadline) RETURNING id INTO v_claim;
  RETURN jsonb_build_object('ok',true,'job',jsonb_build_object(
    'claimId',v_claim,'requestId',v_request.id,'agentId',p_agent_id,
    'operation',v_request.operation,'containerId',v_request.container_id,
    'expiresAt',v_deadline));
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_command_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_command_claim(uuid) TO service_role;

-- Second check immediately before a server-signed 15-second lab permit is issued.
-- If cancelled/revoked/disabled/stale meanwhile, fail closed. Once granted, there
-- remains a small unavoidable revocation race until local execution; document it.
CREATE FUNCTION public.docker_command_authorize(
  p_agent_id uuid,p_claim_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
  v_now timestamptz:=pg_catalog.statement_timestamp();
  v_claim public.docker_command_claims%ROWTYPE;
  v_request public.docker_control_requests%ROWTYPE;
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.docker_agent_registrations
    WHERE id=p_agent_id AND status='key_verified' AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','agent_unavailable'); END IF;
  SELECT * INTO v_claim FROM public.docker_command_claims
    WHERE id=p_claim_id AND agent_id=p_agent_id AND owner_id=v_owner FOR UPDATE;
  IF NOT FOUND OR v_claim.state<>'claimed' OR v_claim.authorized_at IS NOT NULL
    OR v_claim.expires_at<=v_now THEN
    RETURN jsonb_build_object('ok',false,'reason','claim_unavailable');
  END IF;
  SELECT * INTO v_request FROM public.docker_control_requests
    WHERE id=v_claim.request_id AND owner_id=v_owner AND agent_id=p_agent_id FOR UPDATE;
  IF NOT FOUND OR v_request.state<>'approved' OR v_request.expires_at<=v_now
    OR NOT EXISTS(SELECT 1 FROM public.docker_control_policies
                  WHERE owner_id=v_owner AND enabled=true)
    OR NOT EXISTS(SELECT 1 FROM public.docker_agent_reports
      WHERE agent_id=p_agent_id AND owner_id=v_owner AND engine_available=true
        AND last_received_at>v_now-interval '3 minutes') THEN
    RETURN jsonb_build_object('ok',false,'reason','approval_unavailable');
  END IF;
  UPDATE public.docker_command_claims SET authorized_at=v_now WHERE id=p_claim_id;
  RETURN jsonb_build_object('ok',true,
    'agentId',p_agent_id,'claimId',p_claim_id,'requestId',v_request.id,
    'operation',v_request.operation,'containerId',v_request.container_id,
    'issuedAt',v_now,'expiresAt',LEAST(v_claim.expires_at,v_now+interval '15 seconds'));
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_command_authorize(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_command_authorize(uuid,uuid)
  TO service_role;

-- Finalization is an agent-signed self-report, not independently verified Docker success.
-- Accept late results up to 5 minutes after claim to avoid claiming success on timeout.
CREATE FUNCTION public.docker_command_finish(
  p_agent_id uuid,p_claim_id uuid,p_outcome text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_owner uuid; v_done uuid;
BEGIN
  IF p_agent_id IS NULL OR p_claim_id IS NULL
     OR p_outcome NOT IN ('completed','failed','guard_denied') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  SELECT owner_id INTO v_owner FROM public.docker_agent_registrations
    WHERE id=p_agent_id AND status='key_verified' AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','agent_unavailable'); END IF;
  UPDATE public.docker_command_claims
    SET state='reported_'||p_outcome,reported_at=pg_catalog.statement_timestamp()
    WHERE id=p_claim_id AND agent_id=p_agent_id AND owner_id=v_owner
      AND authorized_at IS NOT NULL AND state='claimed'
      AND claimed_at>pg_catalog.statement_timestamp()-interval '5 minutes'
    RETURNING id INTO v_done;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','claim_unavailable'); END IF;
  RETURN jsonb_build_object('ok',true,'claim_id',v_done,'state','reported_'||p_outcome);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_command_finish(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_command_finish(uuid,uuid,text)
  TO service_role;
