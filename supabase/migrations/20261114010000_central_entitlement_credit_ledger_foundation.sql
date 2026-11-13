-- Central, server-managed entitlement configuration and credit ledger.
-- Review-only foundation: do not apply until the complete billing rollout is approved.

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  plan_id TEXT NOT NULL CHECK (plan_id IN ('free', 'premium', 'elite')),
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  credits_per_use INTEGER NOT NULL DEFAULT 0 CHECK (credits_per_use >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('grant', 'spend', 'refund')),
  credits INTEGER NOT NULL CHECK (credits > 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  feature_key TEXT,
  source_key TEXT,
  original_transaction_id UUID REFERENCES public.credit_ledger(transaction_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_user_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT credit_ledger_refund_source_unique UNIQUE (original_transaction_id)
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
  ON public.credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_user_type_idx
  ON public.credit_ledger (user_id, transaction_type, created_at DESC);

ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plan_entitlements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.credit_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.credit_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.plan_entitlements TO service_role;
-- Balance and ledger access is available only through the SECURITY DEFINER RPCs.
REVOKE ALL ON TABLE public.credit_accounts FROM service_role;
REVOKE ALL ON TABLE public.credit_ledger FROM service_role;

-- Resolve the current plan, enforce the feature grant, and debit credits in one
-- transaction. The caller must be a trusted server function and pass the
-- authenticated user's UUID; browser roles cannot execute this RPC.
CREATE OR REPLACE FUNCTION public.consume_tool_credits(
  p_user_id UUID,
  p_feature_key TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INTEGER;
  v_plan_id TEXT;
  v_enabled BOOLEAN;
  v_cost INTEGER;
  v_balance INTEGER;
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

  -- The per-user account lock serializes concurrent spends and duplicate retries.
  INSERT INTO public.credit_accounts (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.credit_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT * INTO v_existing
  FROM public.credit_ledger
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.transaction_type <> 'spend'
       OR v_existing.feature_key IS DISTINCT FROM p_feature_key THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different operation';
    END IF;
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

-- Trusted server-side grants support future subscription allowances, promotions,
-- and approved adjustments. Idempotency prevents duplicate webhook grants.
CREATE OR REPLACE FUNCTION public.grant_tool_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_idempotency_key TEXT,
  p_source_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_existing public.credit_ledger%ROWTYPE;
  v_transaction_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_credits IS NULL OR p_credits < 1 OR p_credits > 100000000
     OR p_idempotency_key IS NULL OR length(p_idempotency_key) < 1
     OR length(p_idempotency_key) > 200
     OR p_source_key IS NULL OR length(p_source_key) < 1 OR length(p_source_key) > 100 THEN
    RAISE EXCEPTION 'Invalid credit grant';
  END IF;

  INSERT INTO public.credit_accounts (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.credit_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT * INTO v_existing
  FROM public.credit_ledger
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.transaction_type <> 'grant' OR v_existing.credits <> p_credits THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different operation';
    END IF;
    RETURN jsonb_build_object(
      'already_processed', true,
      'transaction_id', v_existing.transaction_id,
      'balance', v_balance
    );
  END IF;

  IF v_balance > 2147483647 - p_credits THEN
    RAISE EXCEPTION 'Credit balance limit exceeded';
  END IF;

  UPDATE public.credit_accounts
  SET balance = balance + p_credits, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_ledger (
    user_id, idempotency_key, transaction_type, credits,
    balance_after, source_key
  ) VALUES (
    p_user_id, p_idempotency_key, 'grant', p_credits,
    v_balance, p_source_key
  )
  RETURNING transaction_id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'already_processed', false,
    'transaction_id', v_transaction_id,
    'credits_granted', p_credits,
    'balance', v_balance
  );
END;
$$;

-- Refund the full amount of one successful spend at most once.
CREATE OR REPLACE FUNCTION public.refund_tool_credits(
  p_user_id UUID,
  p_spend_transaction_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spend public.credit_ledger%ROWTYPE;
  v_existing public.credit_ledger%ROWTYPE;
  v_balance INTEGER;
  v_refund_id UUID;
  v_refund_key TEXT;
BEGIN
  IF p_user_id IS NULL OR p_spend_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Invalid credit refund';
  END IF;

  INSERT INTO public.credit_accounts (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM public.credit_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT * INTO v_spend
  FROM public.credit_ledger
  WHERE transaction_id = p_spend_transaction_id
    AND user_id = p_user_id
    AND transaction_type = 'spend';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original spend transaction was not found';
  END IF;

  SELECT * INTO v_existing
  FROM public.credit_ledger
  WHERE original_transaction_id = p_spend_transaction_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'already_refunded', true,
      'transaction_id', v_existing.transaction_id,
      'balance', v_balance
    );
  END IF;

  IF v_balance > 2147483647 - v_spend.credits THEN
    RAISE EXCEPTION 'Credit balance limit exceeded';
  END IF;

  v_refund_key := 'refund:' || p_spend_transaction_id::TEXT;

  UPDATE public.credit_accounts
  SET balance = balance + v_spend.credits, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_ledger (
    user_id, idempotency_key, transaction_type, credits,
    balance_after, feature_key, source_key, original_transaction_id
  ) VALUES (
    p_user_id, v_refund_key, 'refund', v_spend.credits,
    v_balance, v_spend.feature_key, 'failed_tool_job', p_spend_transaction_id
  )
  RETURNING transaction_id INTO v_refund_id;

  RETURN jsonb_build_object(
    'already_refunded', false,
    'transaction_id', v_refund_id,
    'credits_refunded', v_spend.credits,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_tool_credits(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_tool_credits(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_tool_credits(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_tool_credits(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_tool_credits(UUID, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_tool_credits(UUID, UUID) TO service_role;

COMMENT ON TABLE public.plan_entitlements IS
  'Server-managed plan-to-feature policy. Empty by default; no plan grants are invented or enabled before approval.';
COMMENT ON TABLE public.credit_accounts IS
  'Server-managed current credit balances; browser roles have no access.';
COMMENT ON TABLE public.credit_ledger IS
  'Append-only server-managed credit grants, spends, and one-time refunds.';
