-- Prepare a server-authoritative Polar subscription projection and idempotent webhook inbox.
-- Additive Polar sandbox projection with private server-managed access.

CREATE TABLE IF NOT EXISTS public.polar_billing_subscriptions (
  polar_subscription_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  polar_customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_id TEXT CHECK (plan_id IN ('premium', 'elite')),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS polar_billing_subscriptions_user_status_idx
  ON public.polar_billing_subscriptions (user_id, status, updated_at DESC);

ALTER TABLE public.polar_billing_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.polar_billing_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.polar_billing_subscriptions TO service_role;

CREATE TABLE IF NOT EXISTS public.polar_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  processing_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.polar_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.polar_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.polar_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_polar_webhook_event(
  p_event_id TEXT,
  p_event_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_existing_status TEXT;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) < 5 OR length(p_event_id) > 255
     OR p_event_type IS NULL OR length(p_event_type) < 3 OR length(p_event_type) > 255 THEN
    RAISE EXCEPTION 'Invalid Polar event identity';
  END IF;

  INSERT INTO public.polar_webhook_events (
    event_id, event_type, status, attempts, processing_started_at, updated_at
  ) VALUES (
    p_event_id, p_event_type, 'processing', 1, now(), now()
  )
  ON CONFLICT (event_id) DO UPDATE SET
    event_type = EXCLUDED.event_type,
    status = 'processing',
    attempts = public.polar_webhook_events.attempts + 1,
    processing_started_at = now(),
    processed_at = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE public.polar_webhook_events.status = 'failed'
     OR (
       public.polar_webhook_events.status = 'processing'
       AND public.polar_webhook_events.processing_started_at < now() - interval '10 minutes'
     )
  RETURNING 'claimed' INTO v_result;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  SELECT status INTO v_existing_status
  FROM public.polar_webhook_events
  WHERE event_id = p_event_id;

  RETURN COALESCE(v_existing_status, 'processing');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_polar_webhook_event(p_event_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.polar_webhook_events
  SET status = 'processed',
      processed_at = now(),
      last_error = NULL,
      updated_at = now()
  WHERE event_id = p_event_id AND status = 'processing';
$$;

CREATE OR REPLACE FUNCTION public.fail_polar_webhook_event(
  p_event_id TEXT,
  p_error TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.polar_webhook_events
  SET status = 'failed',
      last_error = left(COALESCE(p_error, 'Unknown processing error'), 1000),
      updated_at = now()
  WHERE event_id = p_event_id AND status = 'processing';
$$;

REVOKE ALL ON FUNCTION public.claim_polar_webhook_event(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_polar_webhook_event(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_polar_webhook_event(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_polar_webhook_event(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_polar_webhook_event(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_polar_webhook_event(TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.polar_billing_subscriptions IS
  'Server-managed projection of verified Polar subscription lifecycle events; not writable by browser roles.';
COMMENT ON TABLE public.polar_webhook_events IS
  'Server-managed Polar webhook inbox for signature-verified, idempotent event processing.';
