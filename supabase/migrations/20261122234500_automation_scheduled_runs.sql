-- ETERNYX Automation Phase 2C: recurring deterministic TEXT workflows.
-- No cron is installed. Scheduler remains OFF until an operator explicitly
-- configures a trusted worker and flips the private singleton enabled flag.
-- Input and output are AES-GCM ciphertext only; keys live in Edge secrets.

CREATE TABLE public.automation_scheduler_config (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  enabled boolean NOT NULL DEFAULT false,
  max_claims smallint NOT NULL DEFAULT 2 CHECK (max_claims BETWEEN 1 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.automation_scheduler_config(singleton_id,enabled,max_claims)
VALUES (1,false,2) ON CONFLICT (singleton_id) DO NOTHING;
ALTER TABLE public.automation_scheduler_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_scheduler_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.automation_scheduler_config TO service_role;

CREATE TABLE public.automation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  interval_minutes integer NOT NULL CHECK (interval_minutes IN (60,1440,10080)),
  enabled boolean NOT NULL DEFAULT false,
  input_ciphertext text NOT NULL CHECK (
    char_length(input_ciphertext) BETWEEN 34 AND 4050 AND
    input_ciphertext ~ '^[0-9a-f]+$' AND char_length(input_ciphertext) % 2 = 0
  ),
  input_nonce text NOT NULL CHECK (input_nonce ~ '^[0-9a-f]{24}$'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  next_run_at timestamptz NOT NULL,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  run_request_key uuid NOT NULL DEFAULT gen_random_uuid(),
  last_run_at timestamptz,
  last_status text NOT NULL DEFAULT 'never' CHECK (last_status IN ('never','processing','completed','retrying','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workflow_id),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);
CREATE INDEX automation_schedules_owner_idx
  ON public.automation_schedules(user_id,created_at DESC);
CREATE INDEX automation_schedules_due_idx
  ON public.automation_schedules(next_run_at,id) WHERE enabled=true;
ALTER TABLE public.automation_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_schedules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_schedules TO service_role;

-- The encrypted output is accessible to the owner through an authenticated
-- Edge Function, only until expiration. Raw text is never saved in run metadata.
CREATE TABLE public.automation_schedule_outputs (
  run_id uuid PRIMARY KEY REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.automation_schedules(id) ON DELETE SET NULL,
  output_ciphertext text NOT NULL CHECK (
    char_length(output_ciphertext) BETWEEN 32 AND 16032 AND
    output_ciphertext ~ '^[0-9a-f]+$' AND char_length(output_ciphertext) % 2 = 0
  ),
  output_nonce text NOT NULL CHECK (output_nonce ~ '^[0-9a-f]{24}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days')
);
CREATE INDEX automation_schedule_outputs_expiry ON public.automation_schedule_outputs(expires_at);
ALTER TABLE public.automation_schedule_outputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_schedule_outputs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_schedule_outputs TO service_role;

ALTER TABLE public.automation_runs
  DROP CONSTRAINT IF EXISTS automation_runs_trigger_type_check;
ALTER TABLE public.automation_runs
  ADD CONSTRAINT automation_runs_trigger_type_check
    CHECK (trigger_type IN ('manual','webhook','scheduled'));
ALTER TABLE public.automation_runs
  ADD COLUMN schedule_id uuid REFERENCES public.automation_schedules(id) ON DELETE SET NULL;

-- These SECURITY INVOKER RPCs are executable only by a trusted service-role
-- Edge Function after verifying the caller. No authenticated direct writes.
CREATE OR REPLACE FUNCTION public.automation_save_schedule(
  p_user_id uuid,p_workflow_id uuid,p_interval_minutes integer,
  p_ciphertext text,p_nonce text,p_schedule_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.automation_schedules%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_workflow_id IS NULL
     OR p_interval_minutes NOT IN (60,1440,10080) OR p_interval_minutes IS NULL
     OR p_ciphertext IS NULL OR char_length(p_ciphertext) NOT BETWEEN 34 AND 4050
     OR p_ciphertext !~ '^[0-9a-f]+$' OR char_length(p_ciphertext)%2<>0
     OR p_nonce IS NULL OR p_nonce !~ '^[0-9a-f]{24}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  IF NOT EXISTS (SELECT 1 FROM public.automation_workflows
                 WHERE id=p_workflow_id AND user_id=p_user_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','not_found');
  END IF;
  IF p_schedule_id IS NULL THEN
    IF (SELECT count(*) FROM public.automation_schedules WHERE user_id=p_user_id)>=3 THEN
      RETURN jsonb_build_object('ok',false,'reason','schedule_limit');
    END IF;
    IF EXISTS(SELECT 1 FROM public.automation_schedules WHERE workflow_id=p_workflow_id) THEN
      RETURN jsonb_build_object('ok',false,'reason','already_exists');
    END IF;
    INSERT INTO public.automation_schedules(
      user_id,workflow_id,interval_minutes,input_ciphertext,input_nonce,next_run_at
    ) VALUES(p_user_id,p_workflow_id,p_interval_minutes,p_ciphertext,p_nonce,
      pg_catalog.statement_timestamp()+pg_catalog.make_interval(mins=>p_interval_minutes))
    RETURNING * INTO v;
  ELSE
    UPDATE public.automation_schedules
    SET interval_minutes=p_interval_minutes,input_ciphertext=p_ciphertext,
        input_nonce=p_nonce,enabled=false,revision=revision+1,
        lease_token=NULL,lease_expires_at=NULL,attempt_count=0,
        run_request_key=gen_random_uuid(),last_status='never',
        next_run_at=pg_catalog.statement_timestamp()+pg_catalog.make_interval(mins=>p_interval_minutes),
        updated_at=pg_catalog.statement_timestamp()
    WHERE id=p_schedule_id AND user_id=p_user_id AND workflow_id=p_workflow_id
      AND revision<2147483647 RETURNING * INTO v;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'schedule_id',v.id,'enabled',v.enabled,
    'revision',v.revision,'next_run_at',v.next_run_at);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_save_schedule(uuid,uuid,integer,text,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_save_schedule(uuid,uuid,integer,text,text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_toggle_schedule(
  p_user_id uuid,p_schedule_id uuid,p_enabled boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.automation_schedules%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_schedule_id IS NULL OR p_enabled IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_schedules
  SET enabled=p_enabled,revision=revision+1,
      lease_token=NULL,lease_expires_at=NULL,attempt_count=0,
      run_request_key=gen_random_uuid(),
      next_run_at=pg_catalog.statement_timestamp()+pg_catalog.make_interval(mins=>interval_minutes),
      updated_at=pg_catalog.statement_timestamp()
  WHERE id=p_schedule_id AND user_id=p_user_id AND revision<2147483647
  RETURNING * INTO v;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'schedule_id',v.id,
    'enabled',v.enabled,'next_run_at',v.next_run_at);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_toggle_schedule(uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_toggle_schedule(uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_delete_schedule(p_user_id uuid,p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_schedule_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  DELETE FROM public.automation_schedules
  WHERE id=p_schedule_id AND user_id=p_user_id RETURNING id INTO v_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'schedule_id',v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_delete_schedule(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_delete_schedule(uuid,uuid) TO service_role;

-- A trusted worker may claim at most two due schedules per tick by repeated RPC.
-- Advisory lock gates global concurrent lease count; row lock skips busy entries.
CREATE OR REPLACE FUNCTION public.automation_claim_due_schedule()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.automation_schedules%ROWTYPE;
  v_max integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,900);
  SELECT max_claims INTO v_max FROM public.automation_scheduler_config
    WHERE singleton_id=1 AND enabled=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','disabled'); END IF;
  UPDATE public.automation_schedules
  SET enabled=false,last_status='failed',lease_token=NULL,lease_expires_at=NULL,
      updated_at=pg_catalog.statement_timestamp()
  WHERE enabled=true AND attempt_count>=3
    AND (lease_expires_at IS NULL OR lease_expires_at<=pg_catalog.statement_timestamp());
  IF (SELECT count(*) FROM public.automation_schedules
      WHERE lease_expires_at>pg_catalog.statement_timestamp())>=v_max THEN
    RETURN jsonb_build_object('ok',false,'reason','capacity_full');
  END IF;
  SELECT s.* INTO v FROM public.automation_schedules s
    JOIN public.automation_workflows w ON w.id=s.workflow_id AND w.user_id=s.user_id
    WHERE s.enabled=true AND w.active=true AND w.trigger_kind='manual'
      AND s.next_run_at<=pg_catalog.statement_timestamp()
      AND (s.lease_expires_at IS NULL OR s.lease_expires_at<=pg_catalog.statement_timestamp())
      AND s.attempt_count<3
    ORDER BY s.next_run_at,s.id FOR UPDATE OF s SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','empty'); END IF;
  UPDATE public.automation_schedules
  SET lease_token=gen_random_uuid(),
      lease_expires_at=pg_catalog.statement_timestamp()+interval '90 seconds',
      attempt_count=attempt_count+1,last_status='processing',
      updated_at=pg_catalog.statement_timestamp()
    WHERE id=v.id RETURNING * INTO v;
  RETURN jsonb_build_object(
    'ok',true,'schedule_id',v.id,'user_id',v.user_id,
    'workflow_id',v.workflow_id,'revision',v.revision,
    'request_key',v.run_request_key,
    'ciphertext',v.input_ciphertext,'nonce',v.input_nonce,
    'lease_token',v.lease_token);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_claim_due_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_claim_due_schedule() TO service_role;

CREATE OR REPLACE FUNCTION public.automation_complete_scheduled_run(
  p_schedule_id uuid,p_lease_token uuid,p_schedule_revision integer,
  p_workflow_revision integer,p_fingerprint text,
  p_input_lines integer,p_output_lines integer,
  p_input_characters integer,p_output_characters integer,
  p_trace jsonb,p_output_ciphertext text,p_output_nonce text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE s public.automation_schedules%ROWTYPE;
  v_record jsonb;
BEGIN
  IF p_schedule_id IS NULL OR p_lease_token IS NULL OR p_schedule_revision IS NULL
     OR p_workflow_revision IS NULL OR p_output_ciphertext IS NULL
     OR char_length(p_output_ciphertext) NOT BETWEEN 32 AND 16032
     OR p_output_ciphertext !~ '^[0-9a-f]+$'
     OR char_length(p_output_ciphertext)%2<>0
     OR p_output_nonce IS NULL OR p_output_nonce !~ '^[0-9a-f]{24}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  SELECT * INTO s FROM public.automation_schedules WHERE id=p_schedule_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(s.user_id::text));
  SELECT * INTO s FROM public.automation_schedules WHERE id=p_schedule_id FOR UPDATE;
  IF NOT FOUND OR s.enabled IS DISTINCT FROM true OR s.revision<>p_schedule_revision
     OR s.lease_token IS DISTINCT FROM p_lease_token
     OR s.lease_expires_at<=pg_catalog.statement_timestamp() THEN
    RETURN jsonb_build_object('ok',false,'reason','stale_lease');
  END IF;
  SELECT public.automation_record_run(
    s.user_id,s.workflow_id,p_workflow_revision,s.run_request_key,p_fingerprint,
    p_input_lines,p_output_lines,p_input_characters,p_output_characters,p_trace
  ) INTO v_record;
  IF v_record->>'ok' IS DISTINCT FROM 'true' THEN RETURN v_record; END IF;
  IF v_record->>'already_recorded'='false' THEN
    UPDATE public.automation_runs
    SET trigger_type='scheduled',schedule_id=s.id
    WHERE id=(v_record->>'run_id')::uuid AND user_id=s.user_id;
    INSERT INTO public.automation_schedule_outputs(
      run_id,user_id,schedule_id,output_ciphertext,output_nonce
    ) VALUES((v_record->>'run_id')::uuid,s.user_id,s.id,p_output_ciphertext,p_output_nonce);
  END IF;
  UPDATE public.automation_schedules
  SET next_run_at=GREATEST(pg_catalog.statement_timestamp(),next_run_at)
      +pg_catalog.make_interval(mins=>interval_minutes),
      lease_token=NULL,lease_expires_at=NULL,run_request_key=gen_random_uuid(),
      attempt_count=0,last_run_at=pg_catalog.statement_timestamp(),
      last_status='completed',updated_at=pg_catalog.statement_timestamp()
  WHERE id=s.id;
  RETURN jsonb_build_object('ok',true,'run_id',v_record->>'run_id',
    'already_recorded',v_record->>'already_recorded');
END;
$$;
REVOKE ALL ON FUNCTION public.automation_complete_scheduled_run(
  uuid,uuid,integer,integer,text,integer,integer,integer,integer,jsonb,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_complete_scheduled_run(
  uuid,uuid,integer,integer,text,integer,integer,integer,integer,jsonb,text,text
) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_fail_scheduled_run(
  p_schedule_id uuid,p_lease_token uuid,p_schedule_revision integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE s public.automation_schedules%ROWTYPE;
BEGIN
  IF p_schedule_id IS NULL OR p_lease_token IS NULL OR p_schedule_revision IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  SELECT * INTO s FROM public.automation_schedules WHERE id=p_schedule_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(s.user_id::text));
  UPDATE public.automation_schedules
  SET enabled=(attempt_count<3),lease_token=NULL,lease_expires_at=NULL,
    last_status=CASE WHEN attempt_count>=3 THEN 'failed' ELSE 'retrying' END,
    next_run_at=pg_catalog.statement_timestamp()+interval '5 minutes',
    updated_at=pg_catalog.statement_timestamp()
  WHERE id=p_schedule_id AND enabled=true AND revision=p_schedule_revision
    AND lease_token=p_lease_token
  RETURNING * INTO s;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_lease'); END IF;
  RETURN jsonb_build_object('ok',true,'retrying',s.enabled,'attempts',s.attempt_count);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_fail_scheduled_run(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_fail_scheduled_run(uuid,uuid,integer)
  TO service_role;

-- Quota exhaustion is not a worker failure. Keep the schedule enabled and
-- postpone its next eligible slot without using the three-error retry budget.
CREATE OR REPLACE FUNCTION public.automation_defer_scheduled_run(
  p_schedule_id uuid,p_lease_token uuid,p_schedule_revision integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $
DECLARE s public.automation_schedules%ROWTYPE;
BEGIN
  IF p_schedule_id IS NULL OR p_lease_token IS NULL OR p_schedule_revision IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  SELECT * INTO s FROM public.automation_schedules WHERE id=p_schedule_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(s.user_id::text));
  UPDATE public.automation_schedules
  SET lease_token=NULL,lease_expires_at=NULL,attempt_count=0,
    next_run_at=pg_catalog.statement_timestamp()+interval '1 hour',
    last_status='retrying',updated_at=pg_catalog.statement_timestamp()
  WHERE id=p_schedule_id AND enabled=true AND revision=p_schedule_revision
    AND lease_token=p_lease_token RETURNING * INTO s;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_lease'); END IF;
  RETURN jsonb_build_object('ok',true,'deferred',true,'next_run_at',s.next_run_at);
END;
$;
REVOKE ALL ON FUNCTION public.automation_defer_scheduled_run(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_defer_scheduled_run(uuid,uuid,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_prune_schedule_outputs()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.automation_schedule_outputs
  WHERE expires_at<=pg_catalog.statement_timestamp();
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.automation_prune_schedule_outputs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_prune_schedule_outputs() TO service_role;

COMMENT ON TABLE public.automation_scheduler_config IS
 'Scheduler is off by default. No cron/timer is installed by this migration.';
COMMENT ON TABLE public.automation_schedule_outputs IS
 'Only AES-GCM ciphertext is retained for seven days; owner decrypts via authenticated Edge Function.';
