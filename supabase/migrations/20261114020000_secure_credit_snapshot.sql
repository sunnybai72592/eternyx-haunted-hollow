-- Read-only, server-authoritative snapshot for the Subscription Hub.
-- Review-only: do not apply until the billing rollout is explicitly approved.

CREATE OR REPLACE FUNCTION public.get_credit_snapshot(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_count INTEGER;
  v_plan_id TEXT;
  v_balance INTEGER;
  v_features JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid credit snapshot request';
  END IF;

  SELECT count(*), min(plan_id)
  INTO v_active_count, v_plan_id
  FROM public.billing_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing');

  IF v_active_count > 1 THEN
    RAISE EXCEPTION 'Multiple active subscriptions require reconciliation';
  ELSIF v_active_count = 0 THEN
    v_plan_id := 'free';
  ELSIF v_plan_id IS NULL OR v_plan_id NOT IN ('premium', 'elite') THEN
    RAISE EXCEPTION 'Active subscription plan is not recognized';
  END IF;

  SELECT balance
  INTO v_balance
  FROM public.credit_accounts
  WHERE user_id = p_user_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'feature_key', feature_key,
        'credits_per_use', credits_per_use
      )
      ORDER BY feature_key
    ),
    '[]'::jsonb
  )
  INTO v_features
  FROM public.plan_entitlements
  WHERE plan_id = v_plan_id
    AND enabled = true;

  RETURN jsonb_build_object(
    'plan_id', v_plan_id,
    'balance', COALESCE(v_balance, 0),
    'features', v_features
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_credit_snapshot(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_snapshot(UUID) TO service_role;

COMMENT ON FUNCTION public.get_credit_snapshot(UUID) IS
  'Returns the verified plan, actual credit balance, and enabled feature policy for a user; executable only by trusted server functions.';
