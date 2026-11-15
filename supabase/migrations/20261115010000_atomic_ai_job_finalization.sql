-- Atomically finalize durable AI jobs and their existing central credit reservations.
-- Review-only: do not apply until the AI execution and billing rollout is explicitly approved.
-- The job transition and settlement/release run in one PostgreSQL transaction. If accounting
-- fails, the job transition rolls back too. Uncertain provider outcomes retain their hold.

CREATE OR REPLACE FUNCTION public.finalize_ai_generation_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_next_status TEXT,
  p_event_code TEXT,
  p_output_object_key TEXT DEFAULT NULL,
  p_failure_code TEXT DEFAULT NULL,
  p_final_credits INTEGER DEFAULT NULL,
  p_provider_id TEXT DEFAULT NULL,
  p_model_id TEXT DEFAULT NULL,
  p_provider_task_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.ai_generation_jobs%ROWTYPE;
  v_previous_status TEXT;
  v_allowed BOOLEAN := false;
  v_credit_result JSONB;
  v_has_reservation BOOLEAN;
BEGIN
  IF p_job_id IS NULL
     OR p_next_status IS NULL
     OR p_next_status NOT IN ('succeeded', 'failed', 'cancelled', 'reconciliation_required')
     OR p_event_code IS NULL
     OR p_event_code !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     OR (p_output_object_key IS NOT NULL AND length(p_output_object_key) NOT BETWEEN 1 AND 500)
     OR (p_failure_code IS NOT NULL AND p_failure_code !~ '^[A-Z0-9_]{1,80}$')
     OR (p_final_credits IS NOT NULL AND p_final_credits < 0) THEN
    RAISE EXCEPTION 'Invalid AI job finalization request';
  END IF;

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI job was not found';
  END IF;

  -- A retry after a committed finalization must be safe even though the
  -- original worker lease has already been cleared.
  IF v_job.status IN ('succeeded', 'failed', 'cancelled', 'reconciliation_required') THEN
    IF v_job.status <> p_next_status THEN
      RAISE EXCEPTION 'AI job was already finalized with a different outcome';
    END IF;

    IF v_job.status = 'succeeded' THEN
      IF p_final_credits IS NULL THEN
        RAISE EXCEPTION 'Successful AI job finalization requires final credits';
      END IF;
      v_credit_result := public.settle_ai_generation_job_credits(
        p_job_id, v_job.user_id, p_final_credits
      );
    ELSIF v_job.status IN ('failed', 'cancelled') THEN
      SELECT EXISTS (
        SELECT 1 FROM public.ai_generation_job_credit_reservations
        WHERE job_id = p_job_id AND user_id = v_job.user_id
      ) INTO v_has_reservation;
      IF v_has_reservation THEN
        v_credit_result := public.release_ai_generation_job_credits(p_job_id, v_job.user_id);
      END IF;
    ELSE
      -- reconciliation_required deliberately keeps any reservation on hold.
      SELECT EXISTS (
        SELECT 1 FROM public.ai_generation_job_credit_reservations
        WHERE job_id = p_job_id AND user_id = v_job.user_id AND status = 'reserved'
      ) INTO v_has_reservation;
      RETURN jsonb_build_object(
        'job_id', p_job_id, 'status', v_job.status,
        'already_processed', true, 'credit_hold_preserved', v_has_reservation
      );
    END IF;

    RETURN jsonb_build_object(
      'job_id', p_job_id, 'status', v_job.status,
      'already_processed', true, 'credit_result', v_credit_result
    );
  END IF;

  IF p_lease_token IS NULL
     OR v_job.lease_token IS DISTINCT FROM p_lease_token
     OR v_job.lease_expires_at IS NULL
     OR v_job.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'AI job lease is missing or expired';
  END IF;

  v_allowed := CASE v_job.status
    WHEN 'reserved' THEN p_next_status IN ('failed', 'cancelled', 'reconciliation_required')
    WHEN 'submitted' THEN p_next_status IN ('succeeded', 'failed', 'cancelled', 'reconciliation_required')
    WHEN 'processing' THEN p_next_status IN ('succeeded', 'failed', 'cancelled', 'reconciliation_required')
    WHEN 'cancel_requested' THEN p_next_status IN ('succeeded', 'failed', 'cancelled', 'reconciliation_required')
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'AI job state transition is not allowed';
  END IF;

  IF p_next_status = 'succeeded' THEN
    IF COALESCE(p_output_object_key, v_job.output_object_key) IS NULL
       OR p_final_credits IS NULL THEN
      RAISE EXCEPTION 'Successful AI job requires an output object key and final credits';
    END IF;
  END IF;

  IF p_next_status IN ('failed', 'reconciliation_required') AND p_failure_code IS NULL THEN
    RAISE EXCEPTION 'Failed or uncertain AI job requires a failure code';
  END IF;

  v_previous_status := v_job.status;

  UPDATE public.ai_generation_jobs
  SET status = p_next_status,
      provider_id = COALESCE(p_provider_id, provider_id),
      model_id = COALESCE(p_model_id, model_id),
      provider_task_id = COALESCE(p_provider_task_id, provider_task_id),
      output_object_key = COALESCE(p_output_object_key, output_object_key),
      failure_code = p_failure_code,
      completed_at = CASE WHEN p_next_status IN ('succeeded', 'failed', 'cancelled')
        THEN now() ELSE NULL END,
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_job_id;

  INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
  VALUES (p_job_id, v_previous_status, p_next_status, p_event_code);

  -- These RPCs execute in this same transaction. Any accounting exception
  -- rolls back the status update and event insert above.
  IF p_next_status = 'succeeded' THEN
    v_credit_result := public.settle_ai_generation_job_credits(
      p_job_id, v_job.user_id, p_final_credits
    );
  ELSIF p_next_status IN ('failed', 'cancelled') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ai_generation_job_credit_reservations
      WHERE job_id = p_job_id AND user_id = v_job.user_id
    ) INTO v_has_reservation;
    IF v_has_reservation THEN
      v_credit_result := public.release_ai_generation_job_credits(p_job_id, v_job.user_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'status', p_next_status,
    'already_processed', false,
    'credit_result', v_credit_result,
    'credit_hold_preserved', (p_next_status = 'reconciliation_required' AND EXISTS (
      SELECT 1 FROM public.ai_generation_job_credit_reservations
      WHERE job_id = p_job_id AND user_id = v_job.user_id AND status = 'reserved'
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_ai_generation_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_generation_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.finalize_ai_generation_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) IS
  'Atomically finalizes a durable AI job and settles/releases its central credit reservation; uncertain outcomes retain the hold.';
