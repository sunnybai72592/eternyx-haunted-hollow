-- ETERNYX Automation Phase 2H: deterministic saved workflow -> approved GitHub
-- issue drafts, plus quota-metered authenticated status readback.
-- This adds NO unattended GitHub write, no token export, and no new provider.
ALTER TABLE public.automation_github_issue_drafts
  ADD COLUMN source_workflow_id uuid,
  ADD COLUMN source_workflow_revision integer
    CHECK (source_workflow_revision IS NULL OR source_workflow_revision>0),
  ADD COLUMN source_input_sha256 text
    CHECK (source_input_sha256 IS NULL OR source_input_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN last_known_issue_state text
    CHECK (last_known_issue_state IS NULL OR last_known_issue_state IN ('open','closed')),
  ADD COLUMN last_checked_at timestamptz,
  ADD CONSTRAINT automation_issue_source_complete CHECK (
    (source_workflow_id IS NULL AND source_workflow_revision IS NULL AND source_input_sha256 IS NULL)
    OR (source_workflow_id IS NOT NULL AND source_workflow_revision IS NOT NULL
        AND source_input_sha256 IS NOT NULL)
  ),
  ADD CONSTRAINT automation_issue_readback_complete CHECK (
    (last_known_issue_state IS NULL AND last_checked_at IS NULL)
    OR (last_known_issue_state IS NOT NULL AND last_checked_at IS NOT NULL
        AND status='succeeded')
  );

CREATE OR REPLACE FUNCTION public.automation_prepare_github_workflow_issue(
  p_user_id uuid,p_request_key uuid,p_fingerprint text,p_ciphertext text,
  p_nonce text,p_workflow_id uuid,p_workflow_revision integer,p_input_hash text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $prepare$
DECLARE w public.automation_workflows%ROWTYPE;
  result jsonb;
  d public.automation_github_issue_drafts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL OR p_workflow_id IS NULL
      OR p_workflow_revision IS NULL OR p_workflow_revision<1
      OR p_input_hash IS NULL OR p_input_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO w FROM public.automation_workflows
    WHERE id=p_workflow_id AND user_id=p_user_id AND active=true
      AND trigger_kind='manual' AND revision=p_workflow_revision;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_workflow'); END IF;
  SELECT public.automation_prepare_github_issue(
    p_user_id,p_request_key,p_fingerprint,p_ciphertext,p_nonce
  ) INTO result;
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RETURN result; END IF;
  SELECT * INTO d FROM public.automation_github_issue_drafts
    WHERE id=(result->>'draft_id')::uuid AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF result->>'replayed'='true' THEN
    IF d.source_workflow_id IS DISTINCT FROM p_workflow_id
       OR d.source_workflow_revision IS DISTINCT FROM p_workflow_revision
       OR d.source_input_sha256 IS DISTINCT FROM p_input_hash THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN result;
  END IF;
  UPDATE public.automation_github_issue_drafts
    SET source_workflow_id=p_workflow_id,
        source_workflow_revision=p_workflow_revision,
        source_input_sha256=p_input_hash
    WHERE id=d.id AND user_id=p_user_id AND status='pending';
  RETURN result;
END;
$prepare$;
REVOKE ALL ON FUNCTION public.automation_prepare_github_workflow_issue(
  uuid,uuid,text,text,text,uuid,integer,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_prepare_github_workflow_issue(
  uuid,uuid,text,text,text,uuid,integer,text
) TO service_role;

-- Readback quota is distinct from the more expensive issue-write budget.
-- Store only a fixed issue owner/repo/number reference and a small state enum.
CREATE TABLE public.automation_github_issue_status_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL REFERENCES public.automation_github_issue_drafts(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved','succeeded','failed')),
  observed_state text CHECK (observed_state IS NULL OR observed_state IN ('open','closed')),
  error_code text CHECK (error_code IS NULL OR error_code IN (
    'github_not_found','github_forbidden','github_rate_limit',
    'github_unavailable','github_invalid_response','request_timeout'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(user_id,request_key),
  CHECK (
    (state='reserved' AND finished_at IS NULL AND observed_state IS NULL AND error_code IS NULL)
    OR (state='succeeded' AND finished_at IS NOT NULL
       AND observed_state IS NOT NULL AND error_code IS NULL)
    OR (state='failed' AND finished_at IS NOT NULL
       AND observed_state IS NULL AND error_code IS NOT NULL)
  )
);
CREATE INDEX automation_github_check_owner_recent
  ON public.automation_github_issue_status_checks(user_id,created_at DESC);
ALTER TABLE public.automation_github_issue_status_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_github_issue_status_checks FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_github_issue_status_checks TO service_role;

CREATE OR REPLACE FUNCTION public.automation_reserve_github_issue_status(
  p_user_id uuid,p_draft_id uuid,p_request_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $reserve$
DECLARE d public.automation_github_issue_drafts%ROWTYPE;
  c public.automation_github_issue_connections%ROWTYPE;
  q public.automation_github_issue_status_checks%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_draft_id IS NULL OR p_request_key IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO d FROM public.automation_github_issue_drafts
    WHERE id=p_draft_id AND user_id=p_user_id AND status='succeeded'
      AND issue_number IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_confirmed'); END IF;
  SELECT * INTO c FROM public.automation_github_issue_connections
    WHERE user_id=p_user_id
      AND lower(repo_owner)=lower(d.repo_owner)
      AND lower(repo_name)=lower(d.repo_name);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','connection_changed'); END IF;
  SELECT * INTO q FROM public.automation_github_issue_status_checks
    WHERE user_id=p_user_id AND request_key=p_request_key;
  IF FOUND THEN
    IF q.draft_id IS DISTINCT FROM p_draft_id THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,'check_id',q.id,
      'state',q.state,'observed_state',q.observed_state,'error_code',q.error_code);
  END IF;
  UPDATE public.automation_github_issue_status_checks
    SET state='failed',error_code='request_timeout',
        finished_at=pg_catalog.statement_timestamp()
    WHERE user_id=p_user_id AND state='reserved'
      AND created_at<=pg_catalog.statement_timestamp()-interval '30 seconds';
  IF EXISTS (SELECT 1 FROM public.automation_github_issue_status_checks
      WHERE user_id=p_user_id AND state='reserved') THEN
    RETURN jsonb_build_object('ok',false,'reason','read_in_flight');
  END IF;
  IF (SELECT count(*) FROM public.automation_github_issue_status_checks
      WHERE user_id=p_user_id AND created_at>
        pg_catalog.statement_timestamp()-interval '24 hours')>=12 THEN
    RETURN jsonb_build_object('ok',false,'reason','read_limit');
  END IF;
  INSERT INTO public.automation_github_issue_status_checks(user_id,draft_id,request_key)
    VALUES (p_user_id,p_draft_id,p_request_key) RETURNING * INTO q;
  RETURN jsonb_build_object('ok',true,'replayed',false,'check_id',q.id,
    'state','reserved','owner',d.repo_owner,'repo',d.repo_name,
    'issue_number',d.issue_number);
END;
$reserve$;
REVOKE ALL ON FUNCTION public.automation_reserve_github_issue_status(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_reserve_github_issue_status(uuid,uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_finish_github_issue_status(
  p_user_id uuid,p_check_id uuid,p_observed_state text,p_error_code text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $finish$
DECLARE q public.automation_github_issue_status_checks%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_check_id IS NULL OR
     ((p_observed_state IN ('open','closed') AND p_error_code IS NULL) IS NOT TRUE
      AND (p_observed_state IS NULL AND p_error_code IN (
        'github_not_found','github_forbidden','github_rate_limit',
        'github_unavailable','github_invalid_response','request_timeout')) IS NOT TRUE)
    THEN RETURN jsonb_build_object('ok',false,'reason','invalid_result');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_github_issue_status_checks SET
    state=CASE WHEN p_observed_state IS NOT NULL THEN 'succeeded' ELSE 'failed' END,
    observed_state=p_observed_state,error_code=p_error_code,
    finished_at=pg_catalog.statement_timestamp()
    WHERE id=p_check_id AND user_id=p_user_id AND state='reserved'
      AND created_at>pg_catalog.statement_timestamp()-interval '30 seconds'
    RETURNING * INTO q;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_check'); END IF;
  IF q.state='succeeded' THEN
    UPDATE public.automation_github_issue_drafts SET
      last_known_issue_state=q.observed_state,last_checked_at=q.finished_at
      WHERE id=q.draft_id AND user_id=p_user_id AND status='succeeded';
  END IF;
  RETURN jsonb_build_object('ok',true,'check_id',q.id,'status',q.state,
    'observed_state',q.observed_state,'error_code',q.error_code);
END;
$finish$;
REVOKE ALL ON FUNCTION public.automation_finish_github_issue_status(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_finish_github_issue_status(uuid,uuid,text,text)
  TO service_role;

-- Owner-triggered cleanup; no hidden scheduled job. Preserve counts across the
-- 24-hour budget period and retain only seven days of small receipt metadata.
CREATE OR REPLACE FUNCTION public.automation_housekeep_github_issue_status(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $clean$
DECLARE stale integer;removed integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_github_issue_status_checks
    SET state='failed',error_code='request_timeout',
        finished_at=pg_catalog.statement_timestamp()
    WHERE user_id=p_user_id AND state='reserved'
      AND created_at<=pg_catalog.statement_timestamp()-interval '30 seconds';
  GET DIAGNOSTICS stale=ROW_COUNT;
  DELETE FROM public.automation_github_issue_status_checks
    WHERE user_id=p_user_id AND state<>'reserved'
      AND created_at<=pg_catalog.statement_timestamp()-interval '7 days';
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'stale',stale,'removed',removed);
END;
$clean$;
REVOKE ALL ON FUNCTION public.automation_housekeep_github_issue_status(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_housekeep_github_issue_status(uuid)
  TO service_role;
