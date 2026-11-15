-- User-authorized cancellation requests for durable AI generation jobs.
-- Review-only: do not apply until the AI execution rollout is explicitly approved.
-- Queued jobs are cancelled and their reservation released atomically.
-- Active jobs receive a cancellation request; a trusted worker must reconcile provider state.

CREATE OR REPLACE FUNCTION public.request_ai_generation_job_cancellation(
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
  v_credit_result JSONB;
  v_has_reservation BOOLEAN := false;
  v_next_status TEXT;
BEGIN
  IF p_job_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid AI job cancellation request';
  END IF;

  SELECT * INTO v_job
  FROM public.ai_generation_jobs
  WHERE id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI job was not found';
  END IF;

  IF v_job.status IN ('succeeded', 'failed', 'cancelled', 'reconciliation_required') THEN
    RETURN jsonb_build_object(
      'job_id', p_job_id,
      'status', v_job.status,
      'already_terminal', true,
      'cancellation_requested', v_job.status = 'cancelled'
    );
  END IF;

  IF v_job.status = 'queued' THEN
    UPDATE public.ai_generation_jobs
    SET status = 'cancelled',
        completed_at = now(),
        lease_owner = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE id = p_job_id;

    SELECT EXISTS (
      SELECT 1 FROM public.ai_generation_job_credit_reservations
      WHERE job_id = p_job_id AND user_id = p_user_id
    ) INTO v_has_reservation;

    IF v_has_reservation THEN
      v_credit_result := public.release_ai_generation_job_credits(p_job_id, p_user_id);
    END IF;

    INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
    VALUES (p_job_id, 'queued', 'cancelled', 'job.cancelled_by_user');

    RETURN jsonb_build_object(
      'job_id', p_job_id,
      'status', 'cancelled',
      'already_terminal', false,
      'cancellation_requested', true,
      'credit_result', v_credit_result
    );
  END IF;

  IF v_job.status NOT IN ('reserved', 'submitted', 'processing', 'cancel_requested') THEN
    RAISE EXCEPTION 'AI job cannot be cancelled from its current state';
  END IF;

  IF v_job.status <> 'cancel_requested' THEN
    v_next_status := 'cancel_requested';
    UPDATE public.ai_generation_jobs
    SET status = v_next_status, updated_at = now()
    WHERE id = p_job_id;

    INSERT INTO public.ai_generation_job_events (job_id, from_status, to_status, event_code)
    VALUES (p_job_id, v_job.status, v_next_status, 'job.cancellation_requested');
  END IF;

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'status', 'cancel_requested',
    'already_terminal', false,
    'cancellation_requested', true,
    'provider_reconciliation_required', v_job.provider_task_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_ai_generation_job_cancellation(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_ai_generation_job_cancellation(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.request_ai_generation_job_cancellation(UUID, UUID) IS
  'Allows a user to request cancellation of their own AI job; queued jobs and their reserved credits are cancelled atomically, active jobs await trusted worker reconciliation.';
