-- ETERNYX Cyber Range: server-trusted request/queue foundation.
-- NO VM/container provisioner is activated here. The provider starts DISABLED.
-- The intentionally vulnerable training target must remain outside Supabase.

CREATE TABLE IF NOT EXISTS public.ctf_range_provider (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  enabled boolean NOT NULL DEFAULT false,
  ingress_approved boolean NOT NULL DEFAULT false,
  max_active_sessions smallint NOT NULL DEFAULT 0
    CHECK (max_active_sessions BETWEEN 0 AND 3),
  last_heartbeat_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ctf_range_provider ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ctf_range_provider FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ctf_range_provider TO service_role;
INSERT INTO public.ctf_range_provider(singleton_id, enabled, max_active_sessions)
VALUES (1, false, 0) ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ctf_range_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_pack text NOT NULL DEFAULT 'http-basics-v1'
    CHECK (challenge_pack = 'http-basics-v1'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','provisioning','running','stopping','stopped','expired','failed')),
  -- Internal control-plane reference, never an endpoint URL or a browser token.
  provider_instance_ref text CHECK (provider_instance_ref IS NULL OR
    (length(provider_instance_ref) BETWEEN 1 AND 128 AND
     provider_instance_ref ~ '^[A-Za-z0-9._:-]+$')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT ctf_range_duration_check
    CHECK (expires_at > requested_at AND
           expires_at <= requested_at + interval '15 minutes'),
  CONSTRAINT ctf_range_running_ref_check
    CHECK (status <> 'running' OR
      (provider_instance_ref IS NOT NULL AND started_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ctf_range_sessions_one_active_per_user
ON public.ctf_range_sessions (user_id)
WHERE status IN ('queued','provisioning','running','stopping');

CREATE INDEX IF NOT EXISTS ctf_range_sessions_queue_idx
ON public.ctf_range_sessions (requested_at, id)
WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS ctf_range_sessions_user_recent_idx
ON public.ctf_range_sessions (user_id, requested_at DESC);

ALTER TABLE public.ctf_range_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ctf_range_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ctf_range_sessions TO authenticated;
GRANT ALL ON public.ctf_range_sessions TO service_role;

CREATE POLICY "Range users read only their own sessions"
ON public.ctf_range_sessions FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- User clients have no INSERT/UPDATE/DELETE and no EXECUTE for these functions.
-- The trusted Edge Function authenticates with getUser() and invokes as service_role.
CREATE OR REPLACE FUNCTION public.ctf_range_request_session(
  p_user_id uuid, p_challenge_pack text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_provider public.ctf_range_provider%ROWTYPE;
  v_existing public.ctf_range_sessions%ROWTYPE;
  v_new public.ctf_range_sessions%ROWTYPE;
  v_active integer;
  v_daily integer;
BEGIN
  IF p_user_id IS NULL OR p_challenge_pack IS DISTINCT FROM 'http-basics-v1' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;

  -- Every request and stop goes through this transaction-scoped gate.
  -- Concurrent launches cannot exceed the same reserved capacity.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, 340);

  SELECT * INTO v_provider FROM public.ctf_range_provider WHERE singleton_id = 1;
  IF NOT FOUND OR v_provider.enabled IS DISTINCT FROM true
     OR v_provider.ingress_approved IS DISTINCT FROM true
     OR v_provider.max_active_sessions < 1
     OR v_provider.last_heartbeat_at IS NULL
     OR v_provider.last_heartbeat_at <= pg_catalog.statement_timestamp() - interval '60 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'provider_offline');
  END IF;

  -- Expired queued jobs cannot block quota. Running/starting jobs become
  -- stopping, but retain their reserved capacity until a worker confirms cleanup.
  UPDATE public.ctf_range_sessions
  SET status = 'expired', updated_at = pg_catalog.statement_timestamp(),
      finished_at = pg_catalog.statement_timestamp()
  WHERE status = 'queued' AND expires_at <= pg_catalog.statement_timestamp();

  UPDATE public.ctf_range_sessions
  SET status = 'stopping', updated_at = pg_catalog.statement_timestamp()
  WHERE status IN ('provisioning','running')
    AND expires_at <= pg_catalog.statement_timestamp();

  SELECT * INTO v_existing FROM public.ctf_range_sessions
  WHERE user_id = p_user_id
    AND status IN ('queued','provisioning','running','stopping')
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'session_id', v_existing.id,
      'status', v_existing.status, 'expires_at', v_existing.expires_at,
      'reused', true);
  END IF;

  SELECT count(*) INTO v_daily FROM public.ctf_range_sessions
  WHERE user_id = p_user_id
    AND requested_at > pg_catalog.statement_timestamp() - interval '24 hours';
  IF v_daily >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit');
  END IF;

  SELECT count(*) INTO v_active FROM public.ctf_range_sessions
  WHERE status IN ('queued','provisioning','running','stopping');
  IF v_active >= v_provider.max_active_sessions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'capacity_full');
  END IF;

  INSERT INTO public.ctf_range_sessions(
    user_id, challenge_pack, requested_at, expires_at
  )
  VALUES (p_user_id, 'http-basics-v1',
    pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp() + interval '15 minutes')
  RETURNING * INTO v_new;

  RETURN jsonb_build_object('ok', true, 'session_id', v_new.id,
    'status', v_new.status, 'expires_at', v_new.expires_at,
    'reused', false);
END;
$$;

REVOKE ALL ON FUNCTION public.ctf_range_request_session(uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_request_session(uuid,text)
TO service_role;

CREATE OR REPLACE FUNCTION public.ctf_range_stop_session(
  p_user_id uuid, p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result public.ctf_range_sessions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, 340);
  UPDATE public.ctf_range_sessions
  SET status = CASE WHEN status = 'queued' THEN 'stopped' ELSE 'stopping' END,
      updated_at = pg_catalog.statement_timestamp(),
      finished_at = CASE WHEN status = 'queued'
        THEN pg_catalog.statement_timestamp() ELSE finished_at END
  WHERE id = p_session_id AND user_id = p_user_id
    AND status IN ('queued','provisioning','running')
  RETURNING * INTO v_result;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true,
      'session_id', v_result.id, 'status', v_result.status);
  END IF;
  -- No disclosure whether another user's session exists.
  RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_closed');
END;
$$;

REVOKE ALL ON FUNCTION public.ctf_range_stop_session(uuid,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_stop_session(uuid,uuid)
TO service_role;

-- A future dedicated provider may poll this service-only queue in a transaction.
-- It must NEVER run inside the production ETERNYX web or Edge Function host.
CREATE OR REPLACE FUNCTION public.ctf_range_claim_queued_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_session public.ctf_range_sessions%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ctf_range_provider
    WHERE singleton_id = 1 AND enabled = true AND ingress_approved = true
      AND max_active_sessions > 0
      AND last_heartbeat_at > pg_catalog.statement_timestamp() - interval '60 seconds'
  ) THEN RETURN jsonb_build_object('ok', false, 'reason', 'provider_offline'); END IF;

  UPDATE public.ctf_range_sessions s
  SET status = 'provisioning', updated_at = pg_catalog.statement_timestamp()
  WHERE s.id = (
    SELECT q.id FROM public.ctf_range_sessions q
    WHERE q.status = 'queued' AND q.expires_at > pg_catalog.statement_timestamp()
    ORDER BY q.requested_at, q.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING s.* INTO v_session;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'empty'); END IF;
  RETURN jsonb_build_object('ok', true, 'session_id', v_session.id,
    'challenge_pack', v_session.challenge_pack, 'expires_at', v_session.expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.ctf_range_claim_queued_session()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_claim_queued_session()
TO service_role;

CREATE OR REPLACE FUNCTION public.ctf_range_report_session(
  p_session_id uuid, p_next_state text, p_instance_ref text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_session_id IS NULL OR p_next_state NOT IN ('running','stopped','expired','failed')
    OR p_next_state IS NULL THEN RETURN false; END IF;

  IF p_next_state = 'running'
    AND (p_instance_ref IS NULL OR length(p_instance_ref) > 128
      OR p_instance_ref !~ '^[A-Za-z0-9._:-]+$') THEN RETURN false; END IF;

  UPDATE public.ctf_range_sessions
  SET status = p_next_state,
      provider_instance_ref = CASE WHEN p_next_state = 'running'
        THEN p_instance_ref ELSE provider_instance_ref END,
      started_at = CASE WHEN p_next_state = 'running'
        THEN pg_catalog.statement_timestamp() ELSE started_at END,
      finished_at = CASE WHEN p_next_state IN ('stopped','expired','failed')
        THEN pg_catalog.statement_timestamp() ELSE finished_at END,
      updated_at = pg_catalog.statement_timestamp()
  WHERE id = p_session_id
    AND (
      (status = 'provisioning' AND p_next_state = 'running'
       AND expires_at > pg_catalog.statement_timestamp())
      OR (status IN ('queued','provisioning','running','stopping')
          AND p_next_state IN ('stopped','expired','failed'))
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.ctf_range_report_session(uuid,text,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_report_session(uuid,text,text)
TO service_role;

COMMENT ON TABLE public.ctf_range_provider IS
  'Disabled-by-default provider, independently approved secure ingress and heartbeat; only trusted service role may manage it.';
COMMENT ON TABLE public.ctf_range_sessions IS
  'Control-plane reservation records only. No running target or browser terminal is created by this migration.';
