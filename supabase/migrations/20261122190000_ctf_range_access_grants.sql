-- ETERNYX Cyber Range: short-lived, owner-bound browser access grants.
-- Deliberately disabled in the Edge functions unless a separate, reviewed ingress
-- is deployed. The grant never includes a target URL, worker key or Docker token.
CREATE TABLE IF NOT EXISTS public.ctf_range_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ctf_range_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT ctf_access_grant_short_lifetime
    CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '60 seconds')
);
CREATE INDEX IF NOT EXISTS ctf_range_access_grants_session_idx
  ON public.ctf_range_access_grants (session_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS ctf_range_access_grants_user_rate_idx
  ON public.ctf_range_access_grants (user_id, issued_at DESC);
ALTER TABLE public.ctf_range_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ctf_range_access_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ctf_range_access_grants TO service_role;

-- Only a trusted JWT-authenticating Edge Function can request this privileged
-- SQL operation. All user ownership/capacity/ingress checks are repeated here.
CREATE OR REPLACE FUNCTION public.ctf_range_issue_access_grant(
  p_user_id uuid, p_session_id uuid, p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_session public.ctf_range_sessions%ROWTYPE;
  v_provider public.ctf_range_provider%ROWTYPE;
  v_recent integer;
  v_active integer;
  v_expires timestamptz;
  v_grant_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_token_hash IS NULL
      OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, 346);
  SELECT * INTO v_session FROM public.ctf_range_sessions
    WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'running'
      OR v_session.expires_at <= v_now
      OR v_session.started_at IS NULL
      OR v_session.provider_instance_ref IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','session_unavailable');
  END IF;

  SELECT * INTO v_provider FROM public.ctf_range_provider
    WHERE singleton_id = 1;
  IF NOT FOUND OR v_provider.enabled IS DISTINCT FROM true
      OR v_provider.ingress_approved IS DISTINCT FROM true
      OR v_provider.max_active_sessions < 1
      OR v_provider.last_heartbeat_at IS NULL
      OR v_provider.last_heartbeat_at <= v_now - interval '60 seconds' THEN
    RETURN jsonb_build_object('ok',false,'reason','provider_offline');
  END IF;

  SELECT count(*) INTO v_recent FROM public.ctf_range_access_grants
    WHERE user_id = p_user_id AND issued_at > v_now - interval '60 seconds';
  IF v_recent >= 4 THEN
    RETURN jsonb_build_object('ok',false,'reason','rate_limited');
  END IF;

  SELECT count(*) INTO v_active FROM public.ctf_range_access_grants
    WHERE user_id = p_user_id AND session_id = p_session_id
      AND revoked_at IS NULL AND expires_at > v_now;
  IF v_active >= 2 THEN
    RETURN jsonb_build_object('ok',false,'reason','active_limit');
  END IF;

  v_expires := LEAST(v_now + interval '60 seconds', v_session.expires_at);
  IF v_expires <= v_now THEN
    RETURN jsonb_build_object('ok',false,'reason','session_unavailable');
  END IF;

  INSERT INTO public.ctf_range_access_grants(
    session_id, user_id, token_hash, issued_at, expires_at
  ) VALUES (p_session_id, p_user_id, p_token_hash, v_now, v_expires)
  RETURNING id INTO v_grant_id;

  RETURN jsonb_build_object(
    'ok',true,'grant_id',v_grant_id,'session_id',p_session_id,
    'expires_at',v_expires,'duration_seconds',
    EXTRACT(EPOCH FROM (v_expires - v_now))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ctf_range_issue_access_grant(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_issue_access_grant(uuid,uuid,text) TO service_role;

-- Check *every HTTP request*, not merely token signature or expiry.
-- Stopping the session, disabling the provider or heartbeat loss revokes
-- effective access immediately even if the grant was recently minted.
CREATE OR REPLACE FUNCTION public.ctf_range_check_access_grant(
  p_session_id uuid, p_user_id uuid, p_token_hash text
)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    p_session_id IS NOT NULL
    AND p_user_id IS NOT NULL
    AND p_token_hash ~ '^[0-9a-f]{64}$'
    AND EXISTS (
      SELECT 1
      FROM public.ctf_range_access_grants g
      JOIN public.ctf_range_sessions s
        ON s.id = g.session_id AND s.user_id = g.user_id
      JOIN public.ctf_range_provider p ON p.singleton_id = 1
      WHERE g.session_id = p_session_id
        AND g.user_id = p_user_id
        AND g.token_hash = p_token_hash
        AND g.revoked_at IS NULL
        AND g.expires_at > pg_catalog.statement_timestamp()
        AND s.status = 'running'
        AND s.started_at IS NOT NULL
        AND s.provider_instance_ref IS NOT NULL
        AND s.expires_at > pg_catalog.statement_timestamp()
        AND p.enabled = true
        AND p.ingress_approved = true
        AND p.max_active_sessions > 0
        AND p.last_heartbeat_at > pg_catalog.statement_timestamp() - interval '60 seconds'
    );
$$;
REVOKE ALL ON FUNCTION public.ctf_range_check_access_grant(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_check_access_grant(uuid,uuid,text) TO service_role;

-- Defense in depth: explicit revocation when leaving 'running'.
CREATE OR REPLACE FUNCTION public.ctf_range_revoke_access_after_stop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'running' AND NEW.status IS DISTINCT FROM 'running' THEN
    UPDATE public.ctf_range_access_grants
    SET revoked_at = pg_catalog.statement_timestamp()
    WHERE session_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ctf_range_revoke_access_after_stop()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ctf_range_revoke_access_on_status_change
  ON public.ctf_range_sessions;
CREATE TRIGGER ctf_range_revoke_access_on_status_change
AFTER UPDATE OF status ON public.ctf_range_sessions
FOR EACH ROW
EXECUTE FUNCTION public.ctf_range_revoke_access_after_stop();

COMMENT ON TABLE public.ctf_range_access_grants IS
  'Opaque 256-bit access grants stored only by hash. Tokens never stored, returned in list APIs, or sent to vulnerable targets.';
