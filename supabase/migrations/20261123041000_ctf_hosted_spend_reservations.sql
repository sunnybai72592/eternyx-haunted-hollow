-- ETERNYX Labs: hosted USD preauthorization ledger (default OFF).
-- Depends on range session control and fenced worker migrations.
-- Pre-provisioning ONLY: NO cloud provider, VM launch or price guarantee.
-- New tables are not available to anon/authenticated. Functions are
-- SECURITY INVOKER and executable only by trusted service_role.
--
-- IMPORTANT: This append-only rolling ledger DOES NOT CAP a real provider
-- bill. Release/cancel/settlement deliberately not implemented until a
-- provider adapter can prove workload teardown and actual billed charges.

CREATE TABLE IF NOT EXISTS public.ctf_hosted_spend_policy (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id=1),
  enabled boolean NOT NULL DEFAULT false,
  max_single_session_micro_usd bigint NOT NULL DEFAULT 0
    CHECK (max_single_session_micro_usd BETWEEN 0 AND 100000000),
  max_24h_micro_usd bigint NOT NULL DEFAULT 0
    CHECK (max_24h_micro_usd BETWEEN 0 AND 100000000),
  max_reservations_per_24h smallint NOT NULL DEFAULT 0
    CHECK (max_reservations_per_24h BETWEEN 0 AND 12),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ctf_hosted_spend_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ctf_hosted_spend_policy
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.ctf_hosted_spend_policy TO service_role;
INSERT INTO public.ctf_hosted_spend_policy (singleton_id)
VALUES (1) ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ctf_hosted_spend_reservations (
  session_id uuid PRIMARY KEY REFERENCES public.ctf_range_sessions(id)
    ON DELETE RESTRICT,
  quote_nonce text NOT NULL UNIQUE
    CHECK (quote_nonce ~ '^[0-9a-f]{32}$'),
  quote_sha256 text NOT NULL
    CHECK (quote_sha256 ~ '^[0-9a-f]{64}$'),
  reserved_micro_usd bigint NOT NULL
    CHECK (reserved_micro_usd BETWEEN 1 AND 100000000),
  quote_expires_at timestamptz NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  owner_id text NOT NULL
    CHECK (owner_id ~ '^[a-z][a-z0-9-]{2,39}$'),
  worker_fence_id uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS ctf_hosted_spend_rolling_24h_idx
  ON public.ctf_hosted_spend_reservations (reserved_at);
ALTER TABLE public.ctf_hosted_spend_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ctf_hosted_spend_reservations
  FROM PUBLIC, anon, authenticated;
-- Append only. A confirmed reservation consumes its full quoted amount for
-- the entire rolling 24 hours, even when a VM never launches or stops early.
GRANT SELECT, INSERT ON TABLE public.ctf_hosted_spend_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.ctf_hosted_reserve_quote(
  p_owner_id text,
  p_fence_id uuid,
  p_session_id uuid,
  p_quote_nonce text,
  p_quote_sha256 text,
  p_reserved_micro_usd bigint,
  p_quote_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_policy public.ctf_hosted_spend_policy%ROWTYPE;
  v_count bigint;
  v_total bigint;
BEGIN
  -- The trusted host verifies the pinned Ed25519 quote signature BEFORE
  -- calling this SQL function. The database validates the bound receipt and
  -- serialized reservation. A service-role leak remains a serious risk.
  IF p_owner_id IS NULL OR p_owner_id !~ '^[a-z][a-z0-9-]{2,39}$'
     OR p_fence_id IS NULL OR p_session_id IS NULL
     OR p_quote_nonce IS NULL
     OR p_quote_nonce !~ '^[0-9a-f]{32}$'
     OR p_quote_sha256 IS NULL
     OR p_quote_sha256 !~ '^[0-9a-f]{64}$'
     OR p_reserved_micro_usd IS NULL
     OR p_reserved_micro_usd NOT BETWEEN 1 AND 100000000
     OR p_quote_expires_at IS NULL
     OR p_quote_expires_at <= v_now
     OR p_quote_expires_at > v_now + interval '5 minutes'
  THEN RETURN pg_catalog.jsonb_build_object('ok',false,'reason','invalid_quote'); END IF;

  -- Use the same transaction-level coordinator fence as the existing worker
  -- claim/report path, and a row lock on the singleton spend policy.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, 340);

  IF NOT EXISTS (
    SELECT 1 FROM public.ctf_range_worker_lease
    WHERE singleton_id=1 AND owner_id=p_owner_id
      AND fence_id=p_fence_id AND expires_at>v_now
  ) THEN RETURN pg_catalog.jsonb_build_object('ok',false,'reason','lease_lost'); END IF;

  SELECT * INTO v_policy FROM public.ctf_hosted_spend_policy
    WHERE singleton_id=1 FOR UPDATE;
  IF NOT FOUND OR v_policy.enabled IS DISTINCT FROM true
      OR v_policy.max_single_session_micro_usd=0
      OR v_policy.max_24h_micro_usd=0
      OR v_policy.max_reservations_per_24h=0
  THEN RETURN pg_catalog.jsonb_build_object('ok',false,'reason','hosted_budget_disabled'); END IF;

  -- Never "reapprove" the same quote/session. A retry cannot be used to
  -- launch multiple paid VMs using one reservation.
  IF EXISTS(SELECT 1 FROM public.ctf_hosted_spend_reservations
            WHERE session_id=p_session_id) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','duplicate_session');
  END IF;
  IF EXISTS(SELECT 1 FROM public.ctf_hosted_spend_reservations
            WHERE quote_nonce=p_quote_nonce) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','quote_replayed');
  END IF;

  -- A browser-supplied session UUID is NOT enough; the elected worker must
  -- own a live provisional claim. Lock the session during the reservation.
  PERFORM 1 FROM public.ctf_range_sessions
  WHERE id=p_session_id AND status='provisioning'
    AND worker_fence_id=p_fence_id
    AND expires_at>v_now
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','session_not_claimed');
  END IF;

  SELECT count(*),coalesce(sum(reserved_micro_usd),0)
    INTO v_count,v_total
  FROM public.ctf_hosted_spend_reservations
  WHERE reserved_at > v_now - interval '24 hours';

  IF p_reserved_micro_usd>v_policy.max_single_session_micro_usd
     OR v_count >= v_policy.max_reservations_per_24h
     OR v_total+p_reserved_micro_usd>v_policy.max_24h_micro_usd
  THEN RETURN pg_catalog.jsonb_build_object('ok',false,'reason','hosted_budget_exhausted'); END IF;

  INSERT INTO public.ctf_hosted_spend_reservations (
    session_id,quote_nonce,quote_sha256,reserved_micro_usd,
    quote_expires_at,reserved_at,owner_id,worker_fence_id
  ) VALUES (
    p_session_id,p_quote_nonce,p_quote_sha256,p_reserved_micro_usd,
    p_quote_expires_at,v_now,p_owner_id,p_fence_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'reserved_micro_usd',p_reserved_micro_usd,
    'reservationRecorded',true,
    'providerHardLimitVerified',false,
    'cloudProvisioningAllowed',false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ctf_hosted_reserve_quote(
  text,uuid,uuid,text,text,bigint,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_hosted_reserve_quote(
  text,uuid,uuid,text,text,bigint,timestamptz
) TO service_role;

COMMENT ON TABLE public.ctf_hosted_spend_policy IS
  'Default-off singleton soft USD reservation policy; NOT a cloud billing spending guarantee.';
COMMENT ON TABLE public.ctf_hosted_spend_reservations IS
  'Append-only preauthorization receipts, one per fenced session and unique quote nonce; no automatic refund/expiry clearing.';
COMMENT ON FUNCTION public.ctf_hosted_reserve_quote(
  text,uuid,uuid,text,text,bigint,timestamptz
) IS
  'Service-only and fenced atomic USD reservation; signed quote must be verified by trusted worker; no VM start authorization.';
