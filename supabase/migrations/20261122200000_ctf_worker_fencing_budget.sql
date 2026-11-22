-- ETERNYX Labs: isolated worker fencing, crash takeover and zero-default
-- worst-case compute budget. Apply ONLY after the original range sessions migration.
-- All privileged functions are SECURITY INVOKER and service-role only.

ALTER TABLE public.ctf_range_provider
  ADD COLUMN IF NOT EXISTS max_starts_per_24h integer NOT NULL DEFAULT 0
    CHECK (max_starts_per_24h BETWEEN 0 AND 12),
  ADD COLUMN IF NOT EXISTS max_reserved_minutes_per_24h integer NOT NULL DEFAULT 0
    CHECK (max_reserved_minutes_per_24h BETWEEN 0 AND 180);

ALTER TABLE public.ctf_range_sessions
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_fence_id uuid;
CREATE INDEX IF NOT EXISTS ctf_range_sessions_claimed_24h_idx
  ON public.ctf_range_sessions(claimed_at)
  WHERE claimed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ctf_range_worker_lease (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  owner_id text CHECK (owner_id IS NULL OR
    (length(owner_id) BETWEEN 3 AND 40 AND owner_id ~ '^[a-z][a-z0-9-]+$')),
  fence_id uuid,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ctf_worker_fence_pair CHECK (
    (owner_id IS NULL AND fence_id IS NULL AND expires_at IS NULL)
    OR (owner_id IS NOT NULL AND fence_id IS NOT NULL AND expires_at IS NOT NULL))
);
ALTER TABLE public.ctf_range_worker_lease ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ctf_range_worker_lease FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ctf_range_worker_lease TO service_role;
INSERT INTO public.ctf_range_worker_lease(singleton_id) VALUES(1)
ON CONFLICT (singleton_id) DO NOTHING;

-- A worker's identity is taken from trusted Edge configuration, never the
-- learner's request. A valid fence can renew; a different worker is blocked
-- until expiry. The 180-second lease exceeds bounded local Docker startup.
-- Disabled providers can still acquire to CLEAN UP, but cannot claim work.
CREATE OR REPLACE FUNCTION public.ctf_range_worker_acquire(
  p_owner_id text, p_current_fence uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row public.ctf_range_worker_lease%ROWTYPE;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_fence uuid;
BEGIN
  IF p_owner_id IS NULL OR
     p_owner_id !~ '^[a-z][a-z0-9-]{2,39}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_worker');
  END IF;

  SELECT * INTO v_row FROM public.ctf_range_worker_lease
    WHERE singleton_id = 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unavailable'); END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at > v_now THEN
    IF v_row.owner_id IS DISTINCT FROM p_owner_id
       OR v_row.fence_id IS DISTINCT FROM p_current_fence THEN
      RETURN jsonb_build_object('ok',false,'reason','lease_busy');
    END IF;
    v_fence := v_row.fence_id;
  ELSE
    v_fence := gen_random_uuid();
  END IF;

  UPDATE public.ctf_range_worker_lease
  SET owner_id = p_owner_id, fence_id = v_fence,
    expires_at = v_now + interval '180 seconds', updated_at = v_now
  WHERE singleton_id = 1;

  -- A heartbeat means the worker IS ALIVE. It does not turn on the provider,
  -- approve ingress, or increase resource budgets.
  UPDATE public.ctf_range_provider
    SET last_heartbeat_at = v_now, updated_at = v_now
  WHERE singleton_id = 1;

  RETURN jsonb_build_object('ok',true,'fence_id',v_fence,
    'expires_at',v_now + interval '180 seconds');
END;
$$;
REVOKE ALL ON FUNCTION public.ctf_range_worker_acquire(text,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_worker_acquire(text,uuid)
TO service_role;

-- The active owner may inspect a bounded inventory. On takeover, reassign
-- existing worker-owned rows to the NEW fence so the old worker can never
-- report completion. The new worker must physically inspect/clean Docker
-- before releasing capacity. This does not delete or mark any row terminal.
CREATE OR REPLACE FUNCTION public.ctf_range_worker_inventory(
  p_owner_id text, p_fence_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_json jsonb;
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, 340);
  IF NOT EXISTS (
    SELECT 1 FROM public.ctf_range_worker_lease
    WHERE singleton_id = 1 AND owner_id = p_owner_id
      AND fence_id = p_fence_id AND expires_at > v_now
  ) THEN RETURN jsonb_build_object('ok',false,'reason','lease_lost'); END IF;

  -- Adopt ONLY sessions that were already claimed. Queued rows have no
  -- worker yet and are claimed independently through the budget gate.
  UPDATE public.ctf_range_sessions
  SET worker_fence_id = p_fence_id, updated_at = v_now
  WHERE status IN ('provisioning','running','stopping')
    AND claimed_at IS NOT NULL AND worker_fence_id IS DISTINCT FROM p_fence_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',q.id, 'status',q.status, 'expiresAt',q.expires_at,
      'instanceRef',q.provider_instance_ref
    ) ORDER BY q.requested_at,q.id), '[]'::jsonb)
  INTO v_json
  FROM (
    SELECT id,status,expires_at,provider_instance_ref,requested_at
    FROM public.ctf_range_sessions
    WHERE status IN ('provisioning','running','stopping')
      AND worker_fence_id = p_fence_id
    ORDER BY requested_at,id
    LIMIT 12
  ) q;

  RETURN jsonb_build_object('ok',true,'sessions',v_json);
END;
$$;
REVOKE ALL ON FUNCTION public.ctf_range_worker_inventory(text,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_worker_inventory(text,uuid)
TO service_role;

-- Costs are conservatively reserved at claim time: each claimed lab counts
-- a full 15-minute maximum even when boot fails or learner stops early.
-- This limits started sessions, NOT actual external cloud bills or fees.
-- In addition to existing per-account and active-slot quotas, no start is
-- admitted until BOTH explicit 24-hour budgets are positive.
CREATE OR REPLACE FUNCTION public.ctf_range_worker_claim(
  p_owner_id text, p_fence_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_limits public.ctf_range_provider%ROWTYPE;
  v_count integer;
  v_row public.ctf_range_sessions%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, 340);
  IF NOT EXISTS (
    SELECT 1 FROM public.ctf_range_worker_lease
    WHERE singleton_id = 1 AND owner_id = p_owner_id
      AND fence_id = p_fence_id AND expires_at > v_now
  ) THEN RETURN jsonb_build_object('ok',false,'reason','lease_lost'); END IF;

  SELECT * INTO v_limits FROM public.ctf_range_provider
  WHERE singleton_id = 1 FOR UPDATE;
  IF NOT FOUND OR v_limits.enabled IS DISTINCT FROM true
     OR v_limits.ingress_approved IS DISTINCT FROM true
     OR v_limits.max_active_sessions < 1
     OR v_limits.last_heartbeat_at <= v_now - interval '60 seconds' THEN
    RETURN jsonb_build_object('ok',false,'reason','provider_offline');
  END IF;

  IF v_limits.max_starts_per_24h < 1
     OR v_limits.max_reserved_minutes_per_24h < 15 THEN
    RETURN jsonb_build_object('ok',false,'reason','budget_disabled');
  END IF;

  SELECT count(*) INTO v_count FROM public.ctf_range_sessions
  WHERE claimed_at > v_now - interval '24 hours';
  IF v_count >= v_limits.max_starts_per_24h
    OR (v_count + 1) * 15 > v_limits.max_reserved_minutes_per_24h THEN
    RETURN jsonb_build_object('ok',false,'reason','budget_exhausted');
  END IF;

  UPDATE public.ctf_range_sessions s
  SET status='provisioning', claimed_at=v_now, worker_fence_id=p_fence_id,
    updated_at=v_now
  WHERE s.id = (
    SELECT q.id FROM public.ctf_range_sessions q
    WHERE q.status='queued' AND q.expires_at > v_now
    ORDER BY q.requested_at,q.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  RETURNING s.* INTO v_row;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','empty'); END IF;
  RETURN jsonb_build_object('ok',true,'session_id',v_row.id,
    'challenge_pack',v_row.challenge_pack, 'expires_at',v_row.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.ctf_range_worker_claim(text,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_worker_claim(text,uuid)
TO service_role;

-- A former process cannot declare another process's running/stopping job
-- finished, even with a valid shared worker API secret.
CREATE OR REPLACE FUNCTION public.ctf_range_worker_report(
  p_owner_id text, p_fence_id uuid, p_session_id uuid,
  p_next_state text, p_instance_ref text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_count integer;
BEGIN
  IF p_fence_id IS NULL OR p_session_id IS NULL OR
    p_next_state IS NULL OR
    p_next_state NOT IN ('running','stopped','expired','failed') THEN
    RETURN false;
  END IF;
  IF p_next_state = 'running' AND
    p_instance_ref IS DISTINCT FROM
      'cr-' || replace(p_session_id::text, '-', '') THEN RETURN false; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, 340);
  IF NOT EXISTS (
    SELECT 1 FROM public.ctf_range_worker_lease
    WHERE singleton_id = 1 AND owner_id = p_owner_id
      AND fence_id = p_fence_id AND expires_at > v_now
  ) THEN RETURN false; END IF;

  UPDATE public.ctf_range_sessions
  SET status=p_next_state,
      provider_instance_ref = CASE WHEN p_next_state='running'
        THEN p_instance_ref ELSE provider_instance_ref END,
      started_at = CASE WHEN p_next_state='running' THEN v_now ELSE started_at END,
      finished_at = CASE WHEN p_next_state IN ('stopped','expired','failed')
        THEN v_now ELSE finished_at END,
      updated_at=v_now
  WHERE id=p_session_id AND worker_fence_id=p_fence_id
    AND (
      (status='provisioning' AND p_next_state='running'
        AND expires_at > v_now)
      OR (status IN ('provisioning','running','stopping')
        AND p_next_state IN ('stopped','expired','failed'))
    );
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION public.ctf_range_worker_report(text,uuid,uuid,text,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_worker_report(text,uuid,uuid,text,text)
TO service_role;

-- Release only the exact active lease. A stale worker cannot release the
-- new owner's lease, even when it still knows the shared API secret.
CREATE OR REPLACE FUNCTION public.ctf_range_worker_release(
  p_owner_id text, p_fence_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.ctf_range_worker_lease
  SET owner_id=NULL, fence_id=NULL, expires_at=NULL, updated_at=now()
  WHERE singleton_id=1 AND owner_id=p_owner_id AND fence_id=p_fence_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION public.ctf_range_worker_release(text,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_range_worker_release(text,uuid)
TO service_role;

-- Old, unfenced claim/report RPCs remain physically present for migration
-- compatibility but are not callable by browser or worker service role.
REVOKE ALL ON FUNCTION public.ctf_range_claim_queued_session()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ctf_range_report_session(uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.ctf_range_worker_lease IS
  'Single active operator-worker coordinator, 180-second lease and UUID fencing generation; service-only.';
COMMENT ON COLUMN public.ctf_range_provider.max_reserved_minutes_per_24h IS
  'Default zero. Hard upper bound on conservatively reserved 15-minute lab starts in rolling 24 hours; not currency billing.';
