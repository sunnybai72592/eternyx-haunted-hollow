-- ETERNYX Automation Phase 2A: authenticated MANUAL workflows and factual run history.
-- No cron, webhook receiver, outbound URL, arbitrary scripts, secret storage or
-- paid provider is enabled. Manual execution is inside an authenticated Edge Function.
-- The browser never writes workflow or run records directly.

CREATE TABLE public.automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  steps jsonb NOT NULL CHECK (
    jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) BETWEEN 1 AND 12
    AND char_length(steps::text) <= 12000
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483647),
  active boolean NOT NULL DEFAULT true,
  trigger_kind text NOT NULL DEFAULT 'manual' CHECK (trigger_kind = 'manual'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_workflows_owner_updated
ON public.automation_workflows(user_id, updated_at DESC);
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_workflows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.automation_workflows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_workflows TO service_role;
CREATE POLICY "Read only owned automation workflows" ON public.automation_workflows
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.automation_workflows(id) ON DELETE SET NULL,
  workflow_revision integer NOT NULL CHECK (workflow_revision > 0),
  request_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'completed' CHECK (status = 'completed'),
  input_lines integer NOT NULL CHECK (input_lines BETWEEN 0 AND 2500),
  output_lines integer NOT NULL CHECK (output_lines BETWEEN 0 AND 2500),
  input_characters integer NOT NULL CHECK (input_characters BETWEEN 0 AND 12000),
  output_characters integer NOT NULL CHECK (output_characters BETWEEN 0 AND 30000),
  -- Privacy boundary: store only counts and step IDs/types; never raw inputs or outputs.
  trace jsonb NOT NULL CHECK (
    jsonb_typeof(trace) = 'array' AND jsonb_array_length(trace) BETWEEN 1 AND 12
    AND char_length(trace::text) <= 12000
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_key)
);
CREATE INDEX automation_runs_owner_recent
ON public.automation_runs(user_id, created_at DESC);
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.automation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO service_role;
CREATE POLICY "Read only owned automation runs" ON public.automation_runs
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Lock by authenticated user for atomic per-owner quotas and run/save revision ordering.
-- SQL functions are invoker-only and executable solely as the service role.
CREATE OR REPLACE FUNCTION public.automation_save_workflow(
  p_user_id uuid, p_name text, p_steps jsonb, p_workflow_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_workflow public.automation_workflows%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_name IS NULL OR char_length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 80
     OR p_steps IS NULL OR jsonb_typeof(p_steps) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 12
     OR char_length(p_steps::text) > 12000 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, pg_catalog.hashtext(p_user_id::text));
  IF p_workflow_id IS NULL THEN
    IF (SELECT count(*) FROM public.automation_workflows WHERE user_id = p_user_id) >= 20 THEN
      RETURN jsonb_build_object('ok',false,'reason','workflow_limit');
    END IF;
    INSERT INTO public.automation_workflows(user_id,name,steps)
    VALUES (p_user_id, pg_catalog.btrim(p_name), p_steps) RETURNING * INTO v_workflow;
  ELSE
    UPDATE public.automation_workflows
    SET name = pg_catalog.btrim(p_name), steps = p_steps,
        revision = revision + 1, updated_at = pg_catalog.statement_timestamp()
    WHERE id = p_workflow_id AND user_id = p_user_id AND revision < 2147483647
    RETURNING * INTO v_workflow;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'workflow_id',v_workflow.id,
      'revision',v_workflow.revision,'active',v_workflow.active);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_save_workflow(uuid,text,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_save_workflow(uuid,text,jsonb,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_toggle_workflow(
  p_user_id uuid, p_workflow_id uuid, p_active boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_workflow public.automation_workflows%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_workflow_id IS NULL OR p_active IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_workflows
  SET active = p_active, updated_at = pg_catalog.statement_timestamp()
  WHERE id = p_workflow_id AND user_id = p_user_id RETURNING * INTO v_workflow;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'workflow_id',v_workflow.id,
    'active',v_workflow.active,'revision',v_workflow.revision);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_toggle_workflow(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_toggle_workflow(uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_delete_workflow(
  p_user_id uuid, p_workflow_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_workflow_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  DELETE FROM public.automation_workflows
  WHERE id = p_workflow_id AND user_id = p_user_id RETURNING id INTO v_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  -- Historical run metadata remains owned by the user but workflow_id becomes NULL.
  RETURN jsonb_build_object('ok',true,'workflow_id',v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_delete_workflow(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_delete_workflow(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_record_run(
  p_user_id uuid, p_workflow_id uuid, p_revision integer, p_request_key uuid,
  p_fingerprint text, p_input_lines integer, p_output_lines integer,
  p_input_characters integer, p_output_characters integer, p_trace jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_workflow public.automation_workflows%ROWTYPE;
  v_run public.automation_runs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_workflow_id IS NULL OR p_revision IS NULL
     OR p_request_key IS NULL OR p_fingerprint IS NULL
     OR p_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_input_lines NOT BETWEEN 0 AND 2500 OR p_output_lines NOT BETWEEN 0 AND 2500
     OR p_input_characters NOT BETWEEN 0 AND 12000 OR p_output_characters NOT BETWEEN 0 AND 30000
     OR p_trace IS NULL OR jsonb_typeof(p_trace) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_trace) NOT BETWEEN 1 AND 12
     OR char_length(p_trace::text) > 12000 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  -- Replay protection checked before quota. A key can be reused only for
  -- the exact same input and workflow revision; the browser may retry safely.
  SELECT * INTO v_run FROM public.automation_runs
  WHERE user_id=p_user_id AND request_key=p_request_key LIMIT 1;
  IF FOUND THEN
    IF v_run.request_fingerprint IS DISTINCT FROM p_fingerprint OR
       v_run.workflow_revision IS DISTINCT FROM p_revision OR
       v_run.workflow_id IS DISTINCT FROM p_workflow_id THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok',true,'run_id',v_run.id,'already_recorded',true,
      'created_at',v_run.created_at);
  END IF;
  SELECT * INTO v_workflow FROM public.automation_workflows
  WHERE id=p_workflow_id AND user_id=p_user_id AND active=true
    AND trigger_kind='manual' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found_or_paused'); END IF;
  IF v_workflow.revision <> p_revision THEN
    RETURN jsonb_build_object('ok',false,'reason','stale_workflow');
  END IF;
  IF (SELECT count(*) FROM public.automation_runs
      WHERE user_id=p_user_id AND created_at > pg_catalog.statement_timestamp() - interval '24 hours') >= 30 THEN
    RETURN jsonb_build_object('ok',false,'reason','daily_run_limit');
  END IF;
  INSERT INTO public.automation_runs(
    user_id,workflow_id,workflow_revision,request_key,request_fingerprint,
    input_lines,output_lines,input_characters,output_characters,trace
  ) VALUES (
    p_user_id,p_workflow_id,p_revision,p_request_key,p_fingerprint,
    p_input_lines,p_output_lines,p_input_characters,p_output_characters,p_trace
  ) RETURNING * INTO v_run;
  RETURN jsonb_build_object('ok',true,'run_id',v_run.id,'already_recorded',false,
    'created_at',v_run.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_record_run(
  uuid,uuid,integer,uuid,text,integer,integer,integer,integer,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_record_run(
  uuid,uuid,integer,uuid,text,integer,integer,integer,integer,jsonb
) TO service_role;

COMMENT ON TABLE public.automation_workflows IS
  'Saved, validated deterministic text workflows; manual only, maximum 20/account. No background runner.';
COMMENT ON TABLE public.automation_runs IS
  'Actual authenticated server-run trace metadata (no raw input/output), maximum 30/account/24h.';
