-- Idempotent receipt acknowledgment only. Does not reissue permits or rerun Docker.
CREATE OR REPLACE FUNCTION public.docker_command_finish(
  p_agent_id uuid,p_claim_id uuid,p_outcome text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_owner uuid; v_claim public.docker_command_claims%ROWTYPE;
BEGIN
  IF p_agent_id IS NULL OR p_claim_id IS NULL OR p_outcome IS NULL
    OR p_outcome NOT IN ('completed','failed','guard_denied') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  SELECT owner_id INTO v_owner FROM public.docker_agent_registrations
    WHERE id=p_agent_id AND status='key_verified' AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','agent_unavailable'); END IF;
  SELECT * INTO v_claim FROM public.docker_command_claims
    WHERE id=p_claim_id AND agent_id=p_agent_id AND owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','claim_unavailable'); END IF;
  IF v_claim.state='reported_'||p_outcome AND v_claim.reported_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'claim_id',p_claim_id,'state',v_claim.state,'reused',true);
  END IF;
  IF v_claim.state<>'claimed' OR v_claim.authorized_at IS NULL
    OR v_claim.claimed_at<=pg_catalog.statement_timestamp()-interval '5 minutes' THEN
    RETURN jsonb_build_object('ok',false,'reason','claim_unavailable');
  END IF;
  UPDATE public.docker_command_claims SET
    state='reported_'||p_outcome,reported_at=pg_catalog.statement_timestamp()
    WHERE id=p_claim_id AND agent_id=p_agent_id AND owner_id=v_owner
      AND state='claimed' AND authorized_at IS NOT NULL;
  RETURN jsonb_build_object('ok',true,'claim_id',p_claim_id,'state','reported_'||p_outcome,'reused',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_command_finish(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_command_finish(uuid,uuid,text) TO service_role;
