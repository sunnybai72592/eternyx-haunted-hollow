-- AI generation job credit reservations using the existing central credit ledger.
-- Review-only foundation: do not apply until the billing and AI execution rollout is approved.
-- Reservations debit available credits up front; confirmed completion settles them,
-- confirmed terminal failure/cancellation releases them, and uncertain jobs retain the hold.

CREATE TABLE IF NOT EXISTS public.ai_generation_job_credit_reservations (
  job_id UUID PRIMARY KEY REFERENCES public.ai_generation_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  reserved_credits INTEGER NOT NULL CHECK (reserved_credits >= 0),
  final_credits INTEGER CHECK (final_credits IS NULL OR final_credits BETWEEN 0 AND reserved_credits),
  spend_transaction_id UUID UNIQUE REFERENCES public.credit_ledger(transaction_id),
  adjustment_transaction_id UUID UNIQUE REFERENCES public.credit_ledger(transaction_id),
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'settled', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  CONSTRAINT ai_job_credit_reservation_user_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT ai_job_credit_reservation_state_consistency CHECK (
    (status = 'reserved' AND final_credits IS NULL AND settled_at IS NULL AND adjustment_transaction_id IS NULL)
    OR (status = 'settled' AND final_credits IS NOT NULL AND settled_at IS NOT NULL)
    OR (status = 'released' AND final_credits IS NULL AND settled_at IS NOT NULL)
  ),
  CONSTRAINT ai_job_credit_reservation_zero_cost_consistency CHECK (
    (reserved_credits = 0 AND spend_transaction_id IS NULL)
    OR (reserved_credits > 0 AND spend_transaction_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ai_job_credit_reservations_user_created_idx
  ON public.ai_generation_job_credit_reservations (user_id, created_at DESC);

ALTER TABLE public.ai_generation_job_credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_generation_job_credit_reservations FROM PUBLIC, anon, authenticated, service_role;

-- Reserve the feature's configured per-use credits before any provider submission.
-- The job must already be leased by a trusted worker. The ledger spend is held
-- in the reservation row until settlement or a confirmed terminal outcome.
CREATE OR REPLACE FUNCTION public.reserve_ai_generation_job_credits(
  p_job_id UUID,
  p_user_id UUID,
  p_lease_token UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_reservation public.ai_generation_job_credit_reservations%ROWTYPE;
  v_active_count INTEGER;
  v_plan_id TEXT;
  v_enabled BOOLEAN;
  v_cost INTEGER;
  v_balance INTEGER;
  v_spend_id UUID;
BEGIN
  IF p_job_id IS NULL OR p_user_id IS NULL OR p_lease_token IS NULL
     OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid AI job credit reservation request';
  END IF;

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI job was not found for this user';
  END IF;

  -- Return the original reservation before checking the lease: retries remain
  -- idempotent even if the worker already advanced the job lifecycle.
  SELECT * INTO v_reservation
  FROM public.ai_generation_job_credit_reservations
  WHERE job_id = p_job_id;

  IF FOUND THEN
    IF v_reservation.user_id <> p_user_id
       OR v_reservation.feature_key <> v_job.feature_key
       OR v_reservation.idempotency_key <> p_idempotency_key THEN
      RAISE EXCEPTION 'AI job credit reservation idempotency conflict';
    END IF;
    RETURN jsonb_build_object(
      'job_id', p_job_id,
      'status', v_reservation.status,
      'already_processed', true,
      'reserved_credits', v_reservation.reserved_credits,
      'balance', (SELECT balance FROM public.credit_accounts WHERE user_id = p_user_id)
    );
  END IF;

  IF v_job.status <> 'reserved'
     OR v_job.lease_token IS DISTINCT FROM p_lease_token
     OR v_job.lease_expires_at IS NULL OR v_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'AI job is not held by the active worker lease';
  END IF;

  SELECT count(*), min(plan_id)
  INTO v_active_count, v_plan_id
  FROM public.billing_subscriptions
  WHERE user_id = p_user_id AND status IN ('active', 'trialing');

  IF v_active_count > 1 THEN
    RAISE EXCEPTION 'Multiple active subscriptions require reconciliation';
  ELSIF v_active_count = 0 THEN
    v_plan_id := 'free';
  ELSIF v_plan_id IS NULL OR v_plan_id NOT IN ('premium', 'elite') THEN
    RAISE EXCEPTION 'Active subscription plan is not recognized';
  END IF;

  SELECT enabled, credits_per_use
  INTO v_enabled, v_cost
  FROM public.plan_entitlements
  WHERE plan_id = v_plan_id AND feature_key = v_job.feature_key;

  IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Feature is not enabled for the current plan';
  END IF;

  INSERT INTO public.credit_accounts (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.credit_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  IF v_cost > 0 THEN
    UPDATE public.credit_accounts
    SET balance = balance - v_cost, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;

    INSERT INTO public.credit_ledger (
      user_id, idempotency_key, transaction_type, credits,
      balance_after, feature_key, source_key
    ) VALUES (
      p_user_id, 'ai-job:' || p_job_id::TEXT || ':reserve', 'spend', v_cost,
      v_balance, v_job.feature_key, 'ai_generation_job_reservation'
    )
    RETURNING transaction_id INTO v_spend_id;
  END IF;

  INSERT INTO public.ai_generation_job_credit_reservations (
    job_id, user_id, feature_key, idempotency_key,
    reserved_credits, spend_transaction_id
  ) VALUES (
    p_job_id, p_user_id, v_job.feature_key, p_idempotency_key,
    v_cost, v_spend_id
  );

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'status', 'reserved',
    'already_processed', false,
    'reserved_credits', v_cost,
    'balance', v_balance,
    'plan_id', v_plan_id
  );
END;
$$;

-- Settle only after the job is confirmed successful. Final user charge may be
-- lower than the reservation; the difference is released exactly once.
-- It may never exceed the reservation, preventing an unapproved overdraft.
CREATE OR REPLACE FUNCTION public.settle_ai_generation_job_credits(
  p_job_id UUID,
  p_user_id UUID,
  p_final_credits INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_reservation public.ai_generation_job_credit_reservations%ROWTYPE;
  v_balance INTEGER;
  v_adjustment_id UUID;
  v_release INTEGER;
BEGIN
  IF p_job_id IS NULL OR p_user_id IS NULL
     OR p_final_credits IS NULL OR p_final_credits < 0 THEN
    RAISE EXCEPTION 'Invalid AI job credit settlement request';
  END IF;

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_job.status <> 'succeeded' THEN
    RAISE EXCEPTION 'AI job must be confirmed successful before settlement';
  END IF;

  SELECT * INTO v_reservation
  FROM public.ai_generation_job_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI job credit reservation was not found';
  END IF;

  IF v_reservation.status = 'settled' THEN
    IF v_reservation.final_credits <> p_final_credits THEN
      RAISE EXCEPTION 'AI job settlement amount conflicts with prior settlement';
    END IF;
    SELECT balance INTO v_balance FROM public.credit_accounts WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status', 'settled', 'already_processed', true,
      'final_credits', v_reservation.final_credits, 'balance', v_balance);
  ELSIF v_reservation.status <> 'reserved' THEN
    RAISE EXCEPTION 'Released AI job credits cannot be settled';
  END IF;

  IF p_final_credits > v_reservation.reserved_credits THEN
    RAISE EXCEPTION 'Final AI job charge exceeds reserved credits';
  END IF;

  v_release := v_reservation.reserved_credits - p_final_credits;

  IF v_release > 0 THEN
    INSERT INTO public.credit_accounts (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance INTO v_balance
    FROM public.credit_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_balance > 2147483647 - v_release THEN
      RAISE EXCEPTION 'Credit balance limit exceeded';
    END IF;

    UPDATE public.credit_accounts
    SET balance = balance + v_release, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;

    INSERT INTO public.credit_ledger (
      user_id, idempotency_key, transaction_type, credits,
      balance_after, feature_key, source_key, original_transaction_id
    ) VALUES (
      p_user_id, 'ai-job:' || p_job_id::TEXT || ':settlement-release',
      'refund', v_release, v_balance, v_reservation.feature_key,
      'ai_generation_job_settlement_release', v_reservation.spend_transaction_id
    )
    RETURNING transaction_id INTO v_adjustment_id;
  ELSE
    SELECT balance INTO v_balance
    FROM public.credit_accounts
    WHERE user_id = p_user_id;
  END IF;

  UPDATE public.ai_generation_job_credit_reservations
  SET status = 'settled',
      final_credits = p_final_credits,
      adjustment_transaction_id = v_adjustment_id,
      settled_at = now(),
      updated_at = now()
  WHERE job_id = p_job_id;

  RETURN jsonb_build_object('status', 'settled', 'already_processed', false,
    'reserved_credits', v_reservation.reserved_credits,
    'final_credits', p_final_credits, 'credits_released', v_release, 'balance', v_balance);
END;
$$;

-- Release only after a confirmed terminal failure or cancellation. A
-- reconciliation_required job intentionally keeps its reservation on hold.
CREATE OR REPLACE FUNCTION public.release_ai_generation_job_credits(
  p_job_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_reservation public.ai_generation_job_credit_reservations%ROWTYPE;
  v_balance INTEGER;
  v_refund_id UUID;
BEGIN
  IF p_job_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid AI job credit release request';
  END IF;

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_job.status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'AI job must be confirmed failed or cancelled before credit release';
  END IF;

  SELECT * INTO v_reservation
  FROM public.ai_generation_job_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI job credit reservation was not found';
  END IF;

  IF v_reservation.status = 'released' THEN
    SELECT balance INTO v_balance FROM public.credit_accounts WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status', 'released', 'already_processed', true,
      'credits_released', v_reservation.reserved_credits, 'balance', v_balance);
  ELSIF v_reservation.status <> 'reserved' THEN
    RAISE EXCEPTION 'Settled AI job credits cannot be released';
  END IF;

  INSERT INTO public.credit_accounts (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.credit_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_reservation.reserved_credits > 0 THEN
    IF v_balance > 2147483647 - v_reservation.reserved_credits THEN
      RAISE EXCEPTION 'Credit balance limit exceeded';
    END IF;

    UPDATE public.credit_accounts
    SET balance = balance + v_reservation.reserved_credits, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;

    INSERT INTO public.credit_ledger (
      user_id, idempotency_key, transaction_type, credits,
      balance_after, feature_key, source_key, original_transaction_id
    ) VALUES (
      p_user_id, 'ai-job:' || p_job_id::TEXT || ':release',
      'refund', v_reservation.reserved_credits, v_balance,
      v_reservation.feature_key, 'ai_generation_job_confirmed_failure',
      v_reservation.spend_transaction_id
    )
    RETURNING transaction_id INTO v_refund_id;
  END IF;

  UPDATE public.ai_generation_job_credit_reservations
  SET status = 'released',
      settled_at = now(),
      adjustment_transaction_id = v_refund_id,
      updated_at = now()
  WHERE job_id = p_job_id;

  RETURN jsonb_build_object('status', 'released', 'already_processed', false,
    'credits_released', v_reservation.reserved_credits, 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_generation_job_credits(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_generation_job_credits(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ai_generation_job_credits(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_generation_job_credits(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_generation_job_credits(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_generation_job_credits(UUID, UUID) TO service_role;

COMMENT ON TABLE public.ai_generation_job_credit_reservations IS
  'Private holds against the central credit ledger for durable AI jobs. Unknown provider outcomes retain holds pending reconciliation.';
