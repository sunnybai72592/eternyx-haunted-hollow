-- Durable per-request claims make tool idempotency work even when an
-- entitlement has a zero-credit cost. Review-only: do not apply before rollout approval.

CREATE TABLE IF NOT EXISTS public.tool_request_claims (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  transaction_id UUID REFERENCES public.credit_ledger(transaction_id) ON DELETE SET NULL,
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key),
  CONSTRAINT tool_request_claims_key_length CHECK (
    length(idempotency_key) BETWEEN 1 AND 200
  )
);

ALTER TABLE public.tool_request_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tool_request_claims FROM PUBLIC, anon, authenticated, service_role;

-- Replace the original consumer with a durable request claim. The per-user
-- credit-account lock serializes duplicate claims and balance changes.
CREATE OR REPLACE FUNCTION public.consume_tool_credits(
  p_user_id UUID,
  p_feature_key TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_count INTEGER;
  v_plan_id TEXT;
  v_enabled BOOLEAN;
  v_cost INTEGER;
  v_balance INTEGER;
  v_claim public.tool_request_claims%ROWTYPE;
  v_existing public.credit_ledger%ROWTYPE;
  v_transaction_id UUID;
BEGIN
  IF p_user_id IS NULL
     OR p_feature_key IS NULL
     OR p_feature_key !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
     OR p_idempotency_key IS NULL
     OR length(p_idempotency_key) < 1
     OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'Invalid entitlement request';
  END IF;

  INSERT INTO public.credit_accounts (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.credit_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT * INTO v_claim
  FROM public.tool_request_claims
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_claim.feature_key IS DISTINCT FROM p_feature_key THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different operation';
    END IF;
    RETURN jsonb_build_object(
      'allowed', true,
      'already_processed', true,
      'transaction_id', v_claim.transaction_id,
      'credits_charged', v_claim.credits_charged,
      'balance', v_balance
    );
  END IF;

  -- Preserve idempotency for paid spends created before this migration.
  SELECT * INTO v_existing
  FROM public.credit_ledger
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.transaction_type <> 'spend'
       OR v_existing.feature_key IS DISTINCT FROM p_feature_key THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different operation';
    END IF;

    INSERT INTO public.tool_request_claims (
      user_id, idempotency_key, feature_key, transaction_id, credits_charged
    ) VALUES (
      p_user_id, p_idempotency_key, p_feature_key,
      v_existing.transaction_id, v_existing.credits
    );

    RETURN jsonb_build_object(
      'allowed', true,
      'already_processed', true,
      'transaction_id', v_existing.transaction_id,
      'credits_charged', v_existing.credits,
      'balance', v_balance
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

  IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Feature is not enabled for the current plan';
  END IF;

  IF v_cost = 0 THEN
    INSERT INTO public.tool_request_claims (
      user_id, idempotency_key, feature_key, transaction_id, credits_charged
    ) VALUES (p_user_id, p_idempotency_key, p_feature_key, NULL, 0);

    RETURN jsonb_build_object(
      'allowed', true,
      'already_processed', false,
      'transaction_id', NULL,
      'credits_charged', 0,
      'balance', v_balance,
      'plan_id', v_plan_id
    );
  END IF;

  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  UPDATE public.credit_accounts
  SET balance = balance - v_cost, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_ledger (
    user_id, idempotency_key, transaction_type, credits,
    balance_after, feature_key, source_key
  ) VALUES (
    p_user_id, p_idempotency_key, 'spend', v_cost,
    v_balance, p_feature_key, 'tool_usage'
  )
  RETURNING transaction_id INTO v_transaction_id;

  INSERT INTO public.tool_request_claims (
    user_id, idempotency_key, feature_key, transaction_id, credits_charged
  ) VALUES (
    p_user_id, p_idempotency_key, p_feature_key, v_transaction_id, v_cost
  );

  RETURN jsonb_build_object(
    'allowed', true,
    'already_processed', false,
    'transaction_id', v_transaction_id,
    'credits_charged', v_cost,
    'balance', v_balance,
    'plan_id', v_plan_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_tool_credits(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_tool_credits(UUID, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.tool_request_claims IS
  'Server-only idempotency claims for tool requests, including zero-credit entitlements. No feature pricing or plan access is enabled by this migration.';
