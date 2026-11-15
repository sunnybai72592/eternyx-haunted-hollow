-- Preserve worker leases across non-terminal AI job transitions.
-- Review-only: do not apply until the AI execution rollout is explicitly approved.
-- Terminal outcomes must use finalize_ai_generation_job for atomic credit accounting.
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
  v_previous_status TEXT;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL
     OR p_next_status IS NULL OR p_next_status NOT IN (
       'submitted', 'processing', 'cancel_requested', 'reconciliation_required', 'queued'
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
    WHEN 'reserved' THEN p_next_status IN ('submitted', 'processing', 'cancel_requested', 'reconciliation_required', 'queued')
    WHEN 'submitted' THEN p_next_status IN ('processing', 'cancel_requested', 'reconciliation_required')
    WHEN 'processing' THEN p_next_status IN ('cancel_requested', 'reconciliation_required')
    WHEN 'cancel_requested' THEN p_next_status IN ('reconciliation_required')
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'AI job state transition is not allowed';
  END IF;

  v_previous_status := v_job.status;

  IF p_next_status = 'queued' AND v_job.attempt_count >= v_job.max_attempts THEN
    RAISE EXCEPTION 'AI job retry limit has been reached';
  END IF;

  IF p_next_status = 'reconciliation_required' AND p_failure_code IS NULL THEN
    RAISE EXCEPTION 'Failed or uncertain AI job requires a failure code';
  END IF;

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
      completed_at = NULL,
      -- Keep the active lease while the worker is submitting, polling, or cancelling.
      -- Requeue and quarantine release it so another controlled process can proceed.
      lease_owner = CASE WHEN p_next_status IN ('queued', 'reconciliation_required') THEN NULL ELSE lease_owner END,
      lease_token = CASE WHEN p_next_status IN ('queued', 'reconciliation_required') THEN NULL ELSE lease_token END,
      lease_expires_at = CASE WHEN p_next_status IN ('queued', 'reconciliation_required') THEN NULL ELSE lease_expires_at END,
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
  VALUES (v_job.id, v_previous_status, p_next_status, p_event_code);

  RETURN jsonb_build_object('job_id', v_job.id, 'status', v_job.status);
END;
$$;


COMMENT ON FUNCTION public.transition_ai_generation_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) IS
  'Lease-protected non-terminal AI job transition; worker leases persist through provider submission, polling, and cancellation. Terminal outcomes use atomic finalization.';
