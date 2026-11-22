-- Phase 2E: bounded webhooks and privacy-safe approval records.
-- Service-only text operations. This migration does NOT grant outbound actions.

ALTER TABLE public.automation_webhook_triggers
  ADD COLUMN allowed_scope text NOT NULL DEFAULT 'text_transform'
    CONSTRAINT automation_text_scope_only CHECK (allowed_scope='text_transform'),
  ADD COLUMN daily_execution_limit smallint NOT NULL DEFAULT 30
    CONSTRAINT automation_daily_executions CHECK (daily_execution_limit BETWEEN 1 AND 30),
  ADD COLUMN daily_submission_limit smallint NOT NULL DEFAULT 40
    CONSTRAINT automation_daily_submissions CHECK (daily_submission_limit BETWEEN 1 AND 40);

-- Nonpending encrypted event input was previously retained. Scrub it now,
-- and ensure every future approved/rejected/expired event has no ciphertext.
ALTER TABLE public.automation_approval_requests
  ALTER COLUMN input_ciphertext DROP NOT NULL,
  ALTER COLUMN input_nonce DROP NOT NULL;
UPDATE public.automation_approval_requests
  SET status='expired',decided_at=COALESCE(decided_at,pg_catalog.statement_timestamp()),
      input_ciphertext=NULL,input_nonce=NULL
  WHERE status='pending' AND expires_at<=pg_catalog.statement_timestamp();
UPDATE public.automation_approval_requests
  SET input_ciphertext=NULL,input_nonce=NULL WHERE status<>'pending';
ALTER TABLE public.automation_approval_requests
  ADD CONSTRAINT automation_payload_only_while_pending
  CHECK (
    (status='pending' AND input_ciphertext IS NOT NULL AND input_nonce IS NOT NULL)
    OR
    (status<>'pending' AND input_ciphertext IS NULL AND input_nonce IS NULL)
  );
CREATE INDEX automation_approval_retention_date
  ON public.automation_approval_requests(created_at) WHERE status<>'pending';

CREATE OR REPLACE FUNCTION public.automation_set_webhook_limits(
  p_user_id uuid,p_trigger_id uuid,p_executions integer,p_submissions integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $limits$
DECLARE t public.automation_webhook_triggers%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_trigger_id IS NULL
    OR p_executions IS NULL OR p_executions NOT BETWEEN 1 AND 30
    OR p_submissions IS NULL OR p_submissions NOT BETWEEN 1 AND 40 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_webhook_triggers
    SET daily_execution_limit=p_executions,daily_submission_limit=p_submissions
    WHERE id=p_trigger_id AND user_id=p_user_id AND allowed_scope='text_transform'
    RETURNING * INTO t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'trigger_id',t.id,'allowed_scope',t.allowed_scope,
    'daily_execution_limit',t.daily_execution_limit,
    'daily_submission_limit',t.daily_submission_limit);
END;
$limits$;
REVOKE ALL ON FUNCTION public.automation_set_webhook_limits(uuid,uuid,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_set_webhook_limits(uuid,uuid,integer,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_webhook_usage(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $usage$
DECLARE result jsonb;
BEGIN
  IF p_user_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'trigger_id',t.id,
    'executions_24h',(SELECT count(*) FROM public.automation_runs r
      WHERE r.user_id=p_user_id AND r.webhook_trigger_id=t.id
        AND r.created_at>pg_catalog.statement_timestamp()-interval '24 hours'),
    'submissions_24h',(SELECT count(*) FROM public.automation_approval_requests a
      WHERE a.user_id=p_user_id AND a.trigger_id=t.id
        AND a.created_at>pg_catalog.statement_timestamp()-interval '24 hours'),
    'pending',(SELECT count(*) FROM public.automation_approval_requests a
      WHERE a.user_id=p_user_id AND a.trigger_id=t.id AND a.status='pending'
        AND a.expires_at>pg_catalog.statement_timestamp())
  )), '[]'::jsonb) INTO result
  FROM public.automation_webhook_triggers t WHERE t.user_id=p_user_id;
  RETURN result;
END;
$usage$;
REVOKE ALL ON FUNCTION public.automation_webhook_usage(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_webhook_usage(uuid) TO service_role;

-- Opportunistic privacy cleanup: called when the owner loads the inbox.
-- No background cron is created by this migration.
CREATE OR REPLACE FUNCTION public.automation_housekeep_approval_inbox(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $housekeep$
DECLARE scrubbed integer;pruned integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_approval_requests
    SET status='expired',decided_at=pg_catalog.statement_timestamp(),
        input_ciphertext=NULL,input_nonce=NULL
    WHERE user_id=p_user_id AND status='pending'
      AND expires_at<=pg_catalog.statement_timestamp();
  GET DIAGNOSTICS scrubbed=ROW_COUNT;
  DELETE FROM public.automation_approval_requests
    WHERE user_id=p_user_id AND status<>'pending'
      AND created_at<pg_catalog.statement_timestamp()-interval '7 days';
  GET DIAGNOSTICS pruned=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'expired',scrubbed,'deleted',pruned);
END;
$housekeep$;
REVOKE ALL ON FUNCTION public.automation_housekeep_approval_inbox(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_housekeep_approval_inbox(uuid) TO service_role;

-- Owner can immediately clear resolved/expired approval metadata.
-- Completed run history remains separate and unchanged.
CREATE OR REPLACE FUNCTION public.automation_clear_resolved_approvals(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $clear$
DECLARE removed integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_approval_requests
    SET status='expired',decided_at=pg_catalog.statement_timestamp(),
        input_ciphertext=NULL,input_nonce=NULL
    WHERE user_id=p_user_id AND status='pending'
      AND expires_at<=pg_catalog.statement_timestamp();
  DELETE FROM public.automation_approval_requests
    WHERE user_id=p_user_id AND status<>'pending';
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'deleted',removed);
END;
$clear$;
REVOKE ALL ON FUNCTION public.automation_clear_resolved_approvals(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_clear_resolved_approvals(uuid)
  TO service_role;
