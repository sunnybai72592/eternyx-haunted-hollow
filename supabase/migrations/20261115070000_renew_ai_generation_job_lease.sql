-- Bounded renewal for an existing AI generation worker lease.
-- Review-only: do not apply until the AI execution rollout is explicitly approved.
-- Renewal never creates or reclaims a lease and cannot revive an expired token.

CREATE OR REPLACE FUNCTION public.renew_ai_generation_job_lease(
  p_job_id UUID,
  p_lease_token UUID,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_lease_expires_at TIMESTAMPTZ;
BEGIN
  IF p_job_id IS NULL
     OR p_lease_token IS NULL
     OR p_lease_seconds IS NULL
     OR p_lease_seconds NOT BETWEEN 10 AND 900 THEN
    RAISE EXCEPTION 'Invalid AI job lease renewal request';
  END IF;

  -- Lock by both job and unguessable lease token. If another worker has
  -- reclaimed the job, its rotated token makes this update impossible.
  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE id = p_job_id
    AND lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND
     OR v_job.lease_expires_at IS NULL
     OR v_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'AI job lease is missing or expired';
  END IF;

  IF v_job.status NOT IN ('reserved', 'submitted', 'processing', 'cancel_requested') THEN
    RAISE EXCEPTION 'AI job state does not permit lease renewal';
  END IF;

  UPDATE public.ai_generation_jobs
  SET lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  WHERE id = p_job_id
    AND lease_token = p_lease_token
  RETURNING lease_expires_at INTO v_lease_expires_at;

  IF v_lease_expires_at IS NULL THEN
    RAISE EXCEPTION 'AI job lease renewal failed';
  END IF;

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'status', v_job.status,
    'lease_expires_at', v_lease_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.renew_ai_generation_job_lease(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_ai_generation_job_lease(UUID, UUID, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.renew_ai_generation_job_lease(UUID, UUID, INTEGER) IS
  'Renews only a current, unexpired AI worker lease with its exact token; cannot reclaim or revive expired work.';
