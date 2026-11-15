-- Bind an idempotency key to the exact accepted generation payload.
-- Review-only: do not apply until AI execution and billing rollout are explicitly approved.
-- Replays of the same request return the original receipt; changed requests are rejected.

CREATE OR REPLACE FUNCTION public.enqueue_ai_generation_job_with_credits(
  p_user_id UUID,
  p_feature_key TEXT,
  p_idempotency_key TEXT,
  p_input_payload JSONB DEFAULT '{}'::jsonb,
  p_max_attempts INTEGER DEFAULT 3
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
  v_already_exists BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL
     OR p_feature_key IS NULL
     OR p_feature_key !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
     OR p_idempotency_key IS NULL
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 200
     OR p_input_payload IS NULL
     OR jsonb_typeof(p_input_payload) <> 'object'
     OR pg_column_size(p_input_payload) > 65536
     OR p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Invalid AI generation enqueue request';
  END IF;

  INSERT INTO public.ai_generation_jobs (
    user_id, feature_key, idempotency_key, input_payload, max_attempts
  ) VALUES (
    p_user_id, p_feature_key, p_idempotency_key, p_input_payload, p_max_attempts
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    v_already_exists := true;
    SELECT * INTO v_job
    FROM public.ai_generation_jobs
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF NOT FOUND OR v_job.feature_key IS DISTINCT FROM p_feature_key THEN
      RAISE EXCEPTION 'AI job idempotency key conflicts with another feature';
    END IF;

    IF v_job.input_payload IS DISTINCT FROM p_input_payload
       OR v_job.max_attempts IS DISTINCT FROM p_max_attempts THEN
      RAISE EXCEPTION 'AI job idempotency key was reused with a different request';
    END IF;

    SELECT * INTO v_reservation
    FROM public.ai_generation_job_credit_reservations
    WHERE job_id = v_job.id
    FOR UPDATE;

    IF NOT FOUND
       OR v_reservation.user_id IS DISTINCT FROM p_user_id
       OR v_reservation.idempotency_key IS DISTINCT FROM p_idempotency_key
       OR v_reservation.feature_key IS DISTINCT FROM p_feature_key THEN
      RAISE EXCEPTION 'Existing AI job requires credit reservation reconciliation';
    END IF;

    SELECT balance INTO v_balance
    FROM public.credit_accounts
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'job_id', v_job.id,
      'status', v_job.status,
      'already_exists', true,
      'reservation_status', v_reservation.status,
      'reserved_credits', v_reservation.reserved_credits,
      'balance', COALESCE(v_balance, 0)
    );
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
  WHERE plan_id = v_plan_id AND feature_key = p_feature_key;

  IF NOT FOUND OR v_enabled IS DISTINCT FROM true OR v_cost IS NULL OR v_cost < 0 THEN
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
      p_user_id, 'ai-job:' || v_job.id::TEXT || ':reserve', 'spend', v_cost,
      v_balance, p_feature_key, 'ai_generation_job_reservation'
    )
    RETURNING transaction_id INTO v_spend_id;
  END IF;

  INSERT INTO public.ai_generation_job_credit_reservations (
    job_id, user_id, feature_key, idempotency_key,
    reserved_credits, spend_transaction_id
  ) VALUES (
    v_job.id, p_user_id, p_feature_key, p_idempotency_key,
    v_cost, v_spend_id
  );

  INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
  VALUES (v_job.id, NULL, 'queued', 'job.created');

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'status', 'queued',
    'already_exists', v_already_exists,
    'reservation_status', 'reserved',
    'reserved_credits', v_cost,
    'balance', v_balance,
    'plan_id', v_plan_id
  );
END;
$$;

COMMENT ON FUNCTION public.enqueue_ai_generation_job_with_credits(UUID, TEXT, TEXT, JSONB, INTEGER) IS
  'Atomically creates an idempotent queued AI job and reserves central credits; idempotency replays must match the original payload.';
