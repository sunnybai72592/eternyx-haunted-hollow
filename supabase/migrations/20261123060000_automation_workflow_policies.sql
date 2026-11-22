-- Automation Phase 2J. Owner-scoped policy settings, READINESS snapshot,
-- transactional run enforcement across manual/scheduled/webhook executions.
-- No new trigger is activated; channel restrictions apply even if an existing
-- trigger was enabled before this migration. Existing defaults are preserved.
CREATE TABLE public.automation_workflow_policies (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  max_input_characters integer NOT NULL DEFAULT 12000
    CHECK (max_input_characters BETWEEN 0 AND 12000),
  max_output_characters integer NOT NULL DEFAULT 30000
    CHECK (max_output_characters BETWEEN 0 AND 30000),
  daily_run_limit integer NOT NULL DEFAULT 30
    CHECK (daily_run_limit BETWEEN 1 AND 30),
  allow_webhook boolean NOT NULL DEFAULT true,
  allow_schedule boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,workflow_id)
);
-- Stable composite FK must be backed by a unique owner key.

ALTER TABLE public.automation_workflow_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_workflow_policies FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_workflow_policies TO service_role;

CREATE OR REPLACE FUNCTION public.automation_set_workflow_policy(
  p_user_id uuid,p_workflow_id uuid,p_max_input integer,
  p_max_output integer,p_daily_limit integer,
  p_allow_webhook boolean,p_allow_schedule boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $set$
DECLARE p public.automation_workflow_policies%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_workflow_id IS NULL OR
     p_max_input IS NULL OR p_max_input NOT BETWEEN 0 AND 12000 OR
     p_max_output IS NULL OR p_max_output NOT BETWEEN 0 AND 30000 OR
     p_daily_limit IS NULL OR p_daily_limit NOT BETWEEN 1 AND 30 OR
     p_allow_webhook IS NULL OR p_allow_schedule IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_policy');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  IF NOT EXISTS(SELECT 1 FROM public.automation_workflows
    WHERE id=p_workflow_id AND user_id=p_user_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','not_found');
  END IF;
  INSERT INTO public.automation_workflow_policies(
    user_id,workflow_id,max_input_characters,max_output_characters,
    daily_run_limit,allow_webhook,allow_schedule)
    VALUES(p_user_id,p_workflow_id,p_max_input,p_max_output,
      p_daily_limit,p_allow_webhook,p_allow_schedule)
  ON CONFLICT(user_id,workflow_id) DO UPDATE SET
    max_input_characters=EXCLUDED.max_input_characters,
    max_output_characters=EXCLUDED.max_output_characters,
    daily_run_limit=EXCLUDED.daily_run_limit,
    allow_webhook=EXCLUDED.allow_webhook,
    allow_schedule=EXCLUDED.allow_schedule,
    updated_at=pg_catalog.statement_timestamp()
  RETURNING * INTO p;
  RETURN jsonb_build_object('ok',true,'workflow_id',p.workflow_id,
    'maxInputCharacters',p.max_input_characters,
    'maxOutputCharacters',p.max_output_characters,
    'dailyRunLimit',p.daily_run_limit,
    'allowWebhook',p.allow_webhook,'allowSchedule',p.allow_schedule);
END;
$set$;
REVOKE ALL ON FUNCTION public.automation_set_workflow_policy(
  uuid,uuid,integer,integer,integer,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_set_workflow_policy(
  uuid,uuid,integer,integer,integer,boolean,boolean) TO service_role;

-- Every channel ultimately calls automation_record_run. Its owner lock already
-- serializes writes, so per-workflow run budgets cannot be raced around.
-- Full original idempotency logic and global account limits are retained.
CREATE OR REPLACE FUNCTION public.automation_record_run(
  p_user_id uuid, p_workflow_id uuid, p_revision integer, p_request_key uuid,
  p_fingerprint text, p_input_lines integer, p_output_lines integer,
  p_input_characters integer, p_output_characters integer, p_trace jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_workflow public.automation_workflows%ROWTYPE;
  v_run public.automation_runs%ROWTYPE;
  v_policy public.automation_workflow_policies%ROWTYPE;
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
  SELECT * INTO v_policy FROM public.automation_workflow_policies
    WHERE user_id=p_user_id AND workflow_id=p_workflow_id;
  IF FOUND THEN
    IF p_input_characters>v_policy.max_input_characters THEN
      RETURN jsonb_build_object('ok',false,'reason','policy_input_limit');
    END IF;
    IF p_output_characters>v_policy.max_output_characters THEN
      RETURN jsonb_build_object('ok',false,'reason','policy_output_limit');
    END IF;
    IF (SELECT count(*) FROM public.automation_runs
        WHERE user_id=p_user_id AND workflow_id=p_workflow_id AND
          created_at>pg_catalog.statement_timestamp()-interval '24 hours')
        >= v_policy.daily_run_limit THEN
      RETURN jsonb_build_object('ok',false,'reason','policy_daily_limit');
    END IF;
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
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_record_run(
  uuid,uuid,integer,uuid,text,integer,integer,integer,integer,jsonb
) TO service_role;

-- Existing webhook and scheduled wrappers first insert through record_run,
-- then classify the record. Enforce channel denies at that exact transition;
-- an exception rolls back the entire transaction, including the inserted run.
CREATE OR REPLACE FUNCTION public.automation_guard_run_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $guard$
DECLARE p public.automation_workflow_policies%ROWTYPE;
BEGIN
  IF NEW.trigger_type IS DISTINCT FROM OLD.trigger_type AND
      NEW.trigger_type IN ('webhook','scheduled') THEN
    SELECT * INTO p FROM public.automation_workflow_policies
      WHERE user_id=NEW.user_id AND workflow_id=NEW.workflow_id;
    IF FOUND AND (
      (NEW.trigger_type='webhook' AND p.allow_webhook=false)
      OR (NEW.trigger_type='scheduled' AND p.allow_schedule=false)) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE='automation_policy_channel_denied';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.automation_guard_run_classification()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS automation_run_classification_guard ON public.automation_runs;
CREATE TRIGGER automation_run_classification_guard
  BEFORE UPDATE OF trigger_type ON public.automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.automation_guard_run_classification();

-- Readiness is a factual DB check, not "worker is running" or "webhook delivered".
CREATE OR REPLACE FUNCTION public.automation_workflow_policy_status(
  p_user_id uuid,p_workflow_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $status$
DECLARE w public.automation_workflows%ROWTYPE;
  p public.automation_workflow_policies%ROWTYPE;
  run_count integer; webhook_count integer; approval_count integer;
  schedule_count integer;scheduler_on boolean;
BEGIN
  IF p_user_id IS NULL OR p_workflow_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  SELECT * INTO w FROM public.automation_workflows
    WHERE id=p_workflow_id AND user_id=p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  SELECT * INTO p FROM public.automation_workflow_policies
    WHERE user_id=p_user_id AND workflow_id=p_workflow_id;
  SELECT count(*) INTO run_count FROM public.automation_runs
    WHERE user_id=p_user_id AND workflow_id=p_workflow_id
      AND created_at>pg_catalog.statement_timestamp()-interval '24 hours';
  SELECT count(*),count(*) FILTER(WHERE approval_required=true)
    INTO webhook_count,approval_count FROM public.automation_webhook_triggers
    WHERE user_id=p_user_id AND workflow_id=p_workflow_id AND enabled=true;
  SELECT count(*) INTO schedule_count FROM public.automation_schedules
    WHERE user_id=p_user_id AND workflow_id=p_workflow_id AND enabled=true;
  SELECT enabled INTO scheduler_on FROM public.automation_scheduler_config
    WHERE singleton_id=1;
  RETURN jsonb_build_object('ok',true,'workflowId',w.id,'revision',w.revision,
    'active',w.active,'maxInputCharacters',COALESCE(p.max_input_characters,12000),
    'maxOutputCharacters',COALESCE(p.max_output_characters,30000),
    'dailyRunLimit',COALESCE(p.daily_run_limit,30),
    'allowWebhook',COALESCE(p.allow_webhook,true),
    'allowSchedule',COALESCE(p.allow_schedule,true),
    'runsLast24h',run_count,
    'enabledWebhookTriggers',webhook_count,'approvalRequiredWebhooks',approval_count,
    'enabledSchedules',schedule_count,'schedulerConfigEnabled',COALESCE(scheduler_on,false),
    'manualReady',w.active AND run_count<COALESCE(p.daily_run_limit,30),
    'webhookPolicyReady',w.active AND COALESCE(p.allow_webhook,true)
       AND webhook_count>0 AND run_count<COALESCE(p.daily_run_limit,30),
    'schedulePolicyReady',w.active AND COALESCE(p.allow_schedule,true)
       AND schedule_count>0 AND COALESCE(scheduler_on,false)
       AND run_count<COALESCE(p.daily_run_limit,30),
    'deploymentVerified',false);
END;
$status$;
REVOKE ALL ON FUNCTION public.automation_workflow_policy_status(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_workflow_policy_status(uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_workflow_preflight(
  p_user_id uuid,p_workflow_id uuid,p_channel text,
  p_input_characters integer,p_output_characters integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $preflight$
DECLARE s jsonb;reason text;
BEGIN
  IF p_channel NOT IN ('manual','webhook','scheduled') OR
    p_user_id IS NULL OR p_workflow_id IS NULL OR
    (p_input_characters IS NOT NULL AND p_input_characters NOT BETWEEN 0 AND 12000) OR
    (p_output_characters IS NOT NULL AND p_output_characters NOT BETWEEN 0 AND 30000) THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  SELECT public.automation_workflow_policy_status(p_user_id,p_workflow_id) INTO s;
  IF s->>'ok' IS DISTINCT FROM 'true' THEN RETURN s; END IF;
  IF (s->>'active')::boolean IS FALSE THEN reason:='workflow_paused';
  ELSIF (s->>'runsLast24h')::integer >= (s->>'dailyRunLimit')::integer
    THEN reason:='policy_daily_limit';
  ELSIF p_input_characters IS NOT NULL AND
    p_input_characters>(s->>'maxInputCharacters')::integer
    THEN reason:='policy_input_limit';
  ELSIF p_output_characters IS NOT NULL AND
    p_output_characters>(s->>'maxOutputCharacters')::integer
    THEN reason:='policy_output_limit';
  ELSIF p_channel='webhook' AND (s->>'allowWebhook')::boolean IS FALSE
    THEN reason:='policy_webhook_disabled';
  ELSIF p_channel='scheduled' AND (s->>'allowSchedule')::boolean IS FALSE
    THEN reason:='policy_schedule_disabled';
  ELSIF p_channel='webhook' AND (s->>'enabledWebhookTriggers')::int=0
    THEN reason:='no_enabled_webhook';
  ELSIF p_channel='scheduled' AND
    ((s->>'enabledSchedules')::integer=0 OR
      (s->>'schedulerConfigEnabled')::boolean=false)
    THEN reason:='schedule_not_ready';
  END IF;
  RETURN jsonb_build_object('ok',true,'allowed',reason IS NULL,
    'reason',reason,'workflowId',p_workflow_id,'channel',p_channel,
    'inputChecked',p_input_characters IS NOT NULL,
    'outputChecked',p_output_characters IS NOT NULL,
    'runsLast24h',s->'runsLast24h',
    'dailyRunLimit',s->'dailyRunLimit','policyIsSnapshot',true);
END;
$preflight$;
REVOKE ALL ON FUNCTION public.automation_workflow_preflight(
  uuid,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_workflow_preflight(
  uuid,uuid,text,integer,integer) TO service_role;
