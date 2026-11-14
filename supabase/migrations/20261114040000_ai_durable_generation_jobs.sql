-- Durable asynchronous AI generation jobs.
-- Review-only foundation: do not apply until the AI execution rollout is approved.
-- Provider execution, credit reservation/settlement, and worker deployment are separate milestones.

CREATE TABLE IF NOT EXISTS public.ai_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'reserved', 'submitted', 'processing',
      'cancel_requested', 'succeeded', 'failed', 'cancelled',
      'reconciliation_required'
    )),
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(input_payload) = 'object'),
  provider_id TEXT CHECK (provider_id IS NULL OR provider_id ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  model_id TEXT CHECK (model_id IS NULL OR length(model_id) BETWEEN 1 AND 150),
  provider_task_id TEXT CHECK (provider_task_id IS NULL OR length(provider_task_id) BETWEEN 1 AND 255),
  output_object_key TEXT CHECK (output_object_key IS NULL OR length(output_object_key) BETWEEN 1 AND 500),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z0-9_]{1,80}$'),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT ai_generation_jobs_user_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT ai_generation_jobs_lease_consistency CHECK (
    (lease_owner IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT ai_generation_jobs_completion_consistency CHECK (
    (status IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    OR (status NOT IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS ai_generation_jobs_queue_idx
  ON public.ai_generation_jobs (available_at, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS ai_generation_jobs_expired_lease_idx
  ON public.ai_generation_jobs (lease_expires_at)
  WHERE status IN ('reserved', 'submitted', 'processing', 'cancel_requested');
CREATE INDEX IF NOT EXISTS ai_generation_jobs_user_created_idx
  ON public.ai_generation_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_generation_job_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.ai_generation_jobs(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  event_code TEXT NOT NULL CHECK (event_code ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_generation_job_events_job_created_idx
  ON public.ai_generation_job_events (job_id, created_at);

ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_job_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_generation_jobs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ai_generation_job_events FROM PUBLIC, anon, authenticated, service_role;

-- Trusted server-side creation. Repeated user/idempotency pairs return the original job.
CREATE OR REPLACE FUNCTION public.create_ai_generation_job(
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
BEGIN
  IF p_user_id IS NULL
     OR p_feature_key IS NULL
     OR p_feature_key !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
     OR p_idempotency_key IS NULL
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 200
     OR p_input_payload IS NULL
     OR jsonb_typeof(p_input_payload) <> 'object'
     OR p_max_attempts NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Invalid AI generation job request';
  END IF;

  INSERT INTO public.ai_generation_jobs (
    user_id, feature_key, idempotency_key, input_payload, max_attempts
  ) VALUES (
    p_user_id, p_feature_key, p_idempotency_key, p_input_payload, p_max_attempts
  )
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    SELECT * INTO v_job
    FROM public.ai_generation_jobs
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF v_job.feature_key IS DISTINCT FROM p_feature_key THEN
      RAISE EXCEPTION 'AI job idempotency key was used for another feature';
    END IF;

    RETURN jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'already_exists', true);
  END IF;

  INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
  VALUES (v_job.id, NULL, 'queued', 'job.created');

  RETURN jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'already_exists', false);
END;
$$;

-- Atomically lease queued work or recover an expired worker lease.
-- Expired submitted/processing jobs retain provider_task_id so workers can
-- reconcile provider state instead of blindly submitting a duplicate request.
CREATE OR REPLACE FUNCTION public.claim_ai_generation_jobs(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 60,
  p_limit INTEGER DEFAULT 5
)
RETURNS SETOF public.ai_generation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_next_status TEXT;
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 120
     OR p_lease_seconds NOT BETWEEN 10 AND 900
     OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid AI job claim request';
  END IF;

  FOR v_job IN
    SELECT *
    FROM public.ai_generation_jobs
    WHERE (
      (status = 'queued' AND available_at <= now())
      OR (status IN ('reserved', 'submitted', 'processing', 'cancel_requested')
          AND lease_expires_at < now())
    )
    AND (status <> 'queued' OR attempt_count < max_attempts)
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    v_next_status := CASE WHEN v_job.status = 'queued' THEN 'reserved' ELSE v_job.status END;

    UPDATE public.ai_generation_jobs
    SET status = v_next_status,
        attempt_count = attempt_count + CASE WHEN v_job.status = 'queued' THEN 1 ELSE 0 END,
        lease_owner = p_worker_id,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        started_at = COALESCE(started_at, now()),
        updated_at = now()
    WHERE id = v_job.id
    RETURNING * INTO v_job;

    IF v_next_status <> 'reserved' OR v_job.attempt_count > 1 THEN
      INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
      VALUES (v_job.id, v_job.status, v_job.status, 'job.lease_recovered');
    ELSE
      INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
      VALUES (v_job.id, 'queued', 'reserved', 'job.claimed');
    END IF;

    RETURN NEXT v_job;
  END LOOP;
END;
$$;

-- Every worker mutation requires the current lease token. State changes are
-- constrained here so stale workers cannot overwrite a newer attempt.
CREATE OR REPLACE FUNCTION public.transition_ai_generation_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_next_status TEXT,
  p_event_code TEXT,
  p_provider_id TEXT DEFAULT NULL,
  p_model_id TEXT DEFAULT NULL,
  p_provider_task_id TEXT DEFAULT NULL,
  p_output_object_key TEXT DEFAULT NULL,
  p_failure_code TEXT DEFAULT NULL,
  p_retry_after_seconds INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_allowed BOOLEAN := false;
  v_completed_at TIMESTAMPTZ;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL
     OR p_next_status NOT IN (
       'submitted', 'processing', 'cancel_requested',
       'succeeded', 'failed', 'cancelled', 'reconciliation_required', 'queued'
     )
     OR p_event_code IS NULL OR p_event_code !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     OR (p_retry_after_seconds IS NOT NULL AND p_retry_after_seconds NOT BETWEEN 1 AND 86400) THEN
    RAISE EXCEPTION 'Invalid AI job transition request';
  END IF;

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE id = p_job_id AND lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND OR v_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'AI job lease is missing or expired';
  END IF;

  v_allowed := CASE v_job.status
    WHEN 'reserved' THEN p_next_status IN ('submitted', 'processing', 'failed', 'cancelled', 'reconciliation_required', 'queued')
    WHEN 'submitted' THEN p_next_status IN ('processing', 'succeeded', 'failed', 'cancel_requested', 'cancelled', 'reconciliation_required')
    WHEN 'processing' THEN p_next_status IN ('succeeded', 'failed', 'cancel_requested', 'cancelled', 'reconciliation_required')
    WHEN 'cancel_requested' THEN p_next_status IN ('cancelled', 'succeeded', 'failed', 'reconciliation_required')
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'AI job state transition is not allowed';
  END IF;

  IF p_next_status = 'succeeded' AND
     COALESCE(p_output_object_key, v_job.output_object_key) IS NULL THEN
    RAISE EXCEPTION 'Successful AI job requires an output object key';
  END IF;

  IF p_next_status IN ('failed', 'reconciliation_required') AND p_failure_code IS NULL THEN
    RAISE EXCEPTION 'Failed or uncertain AI job requires a failure code';
  END IF;

  v_completed_at := CASE WHEN p_next_status IN ('succeeded', 'failed', 'cancelled')
    THEN now() ELSE NULL END;

  UPDATE public.ai_generation_jobs
  SET status = CASE WHEN p_next_status = 'queued' THEN 'queued' ELSE p_next_status END,
      provider_id = COALESCE(p_provider_id, provider_id),
      model_id = COALESCE(p_model_id, model_id),
      provider_task_id = COALESCE(p_provider_task_id, provider_task_id),
      output_object_key = COALESCE(p_output_object_key, output_object_key),
      failure_code = p_failure_code,
      available_at = CASE WHEN p_next_status = 'queued'
        THEN now() + make_interval(secs => COALESCE(p_retry_after_seconds, 1))
        ELSE available_at END,
      completed_at = v_completed_at,
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
  VALUES (v_job.id, (SELECT status FROM public.ai_generation_jobs WHERE id = v_job.id), p_next_status, p_event_code);

  RETURN jsonb_build_object('job_id', v_job.id, 'status', v_job.status);
END;
$$;

REVOKE ALL ON FUNCTION public.create_ai_generation_job(UUID, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ai_generation_jobs(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_ai_generation_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_generation_job(UUID, TEXT, TEXT, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ai_generation_jobs(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_ai_generation_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;

COMMENT ON TABLE public.ai_generation_jobs IS
  'Private durable AI job records. No browser-role access; worker and API access is through trusted service-role RPCs.';
COMMENT ON TABLE public.ai_generation_job_events IS
  'Append-only lifecycle event history for durable AI jobs. Event details must not contain prompts, credentials, or private output.';
