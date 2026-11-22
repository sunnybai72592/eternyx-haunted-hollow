-- ETERNYX Automation Phase 2B: opt-in, signed inbound webhook triggers.
-- No arbitrary code, outbound requests, schedule, or paid provider introduced.
-- Encryption key is kept ONLY in Edge Function secrets, never in this migration.

CREATE TABLE public.automation_webhook_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  -- AES-256-GCM ciphertext of 32 random credential bytes; NOT plaintext.
  credential_ciphertext text NOT NULL CHECK (credential_ciphertext ~ '^[0-9a-f]{96}$'),
  credential_iv text NOT NULL CHECK (credential_iv ~ '^[0-9a-f]{24}$'),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NOT NULL DEFAULT now(),
  credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version BETWEEN 1 AND 2147483647),
  last_used_at timestamptz,
  UNIQUE(workflow_id)
);
CREATE INDEX automation_webhook_owner_idx ON public.automation_webhook_triggers(user_id, created_at DESC);
ALTER TABLE public.automation_webhook_triggers ENABLE ROW LEVEL SECURITY;
-- No authenticated SELECT: encrypted secrets should never be exposed in Data API.
REVOKE ALL ON public.automation_webhook_triggers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_webhook_triggers TO service_role;

-- Reuse owner lock from the manual run foundation to serialize changes and run claims.
CREATE OR REPLACE FUNCTION public.automation_register_webhook(
  p_user_id uuid, p_workflow_id uuid, p_ciphertext text, p_iv text, p_rotate boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_trigger public.automation_webhook_triggers%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_workflow_id IS NULL OR p_rotate IS NULL OR
     p_ciphertext IS NULL OR p_ciphertext !~ '^[0-9a-f]{96}$' OR
     p_iv IS NULL OR p_iv !~ '^[0-9a-f]{24}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122, pg_catalog.hashtext(p_user_id::text));
  IF NOT EXISTS (
    SELECT 1 FROM public.automation_workflows WHERE user_id=p_user_id AND id=p_workflow_id
  ) THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF p_rotate THEN
    UPDATE public.automation_webhook_triggers
    SET credential_ciphertext=p_ciphertext,credential_iv=p_iv,
        enabled=false,rotated_at=pg_catalog.statement_timestamp(),
        credential_version=credential_version + 1
    WHERE user_id=p_user_id AND workflow_id=p_workflow_id
      AND credential_version < 2147483647
    RETURNING * INTO v_trigger;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.automation_webhook_triggers WHERE workflow_id=p_workflow_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_exists');
    END IF;
    IF (SELECT count(*) FROM public.automation_webhook_triggers WHERE user_id=p_user_id) >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'trigger_limit');
    END IF;
    INSERT INTO public.automation_webhook_triggers(user_id,workflow_id,credential_ciphertext,credential_iv)
    VALUES (p_user_id,p_workflow_id,p_ciphertext,p_iv) RETURNING * INTO v_trigger;
  END IF;
  RETURN jsonb_build_object('ok',true,'trigger_id',v_trigger.id,
    'workflow_id',v_trigger.workflow_id,'enabled',v_trigger.enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_register_webhook(uuid,uuid,text,text,boolean)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_register_webhook(uuid,uuid,text,text,boolean)
TO service_role;

CREATE OR REPLACE FUNCTION public.automation_set_webhook_enabled(
  p_user_id uuid, p_trigger_id uuid, p_enabled boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_trigger public.automation_webhook_triggers%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_trigger_id IS NULL OR p_enabled IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_webhook_triggers
  SET enabled=p_enabled
  WHERE user_id=p_user_id AND id=p_trigger_id RETURNING * INTO v_trigger;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'trigger_id',v_trigger.id,'enabled',v_trigger.enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_set_webhook_enabled(uuid,uuid,boolean)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_set_webhook_enabled(uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_delete_webhook(
  p_user_id uuid, p_trigger_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_trigger_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  DELETE FROM public.automation_webhook_triggers
  WHERE user_id=p_user_id AND id=p_trigger_id RETURNING id INTO v_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'trigger_id',v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_delete_webhook(uuid,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_delete_webhook(uuid,uuid) TO service_role;

-- Tracking is metadata-only. Existing run-recording quota and request key
-- idempotency are reused; webhook uses a distinct trigger type for audit.
ALTER TABLE public.automation_runs
ADD COLUMN trigger_type text NOT NULL DEFAULT 'manual'
CHECK (trigger_type IN ('manual','webhook')),
ADD COLUMN webhook_trigger_id uuid REFERENCES public.automation_webhook_triggers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.automation_record_webhook_run(
  p_trigger_id uuid, p_user_id uuid, p_workflow_id uuid, p_revision integer,
  p_request_key uuid, p_fingerprint text, p_input_lines integer,
  p_output_lines integer, p_input_characters integer,
  p_output_characters integer, p_trace jsonb, p_credential_version integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_trigger public.automation_webhook_triggers%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_trigger_id IS NULL OR p_user_id IS NULL OR p_workflow_id IS NULL
     OR p_credential_version IS NULL OR p_credential_version < 1 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO v_trigger FROM public.automation_webhook_triggers
  WHERE id=p_trigger_id AND user_id=p_user_id AND workflow_id=p_workflow_id
    AND enabled=true AND credential_version=p_credential_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','trigger_revoked'); END IF;
  -- The same owner lock also protects pause and workflow revision changes.
  SELECT public.automation_record_run(
    p_user_id,p_workflow_id,p_revision,p_request_key,p_fingerprint,
    p_input_lines,p_output_lines,p_input_characters,p_output_characters,p_trace
  ) INTO v_result;
  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN RETURN v_result; END IF;
  IF v_result->>'already_recorded' = 'false' THEN
    UPDATE public.automation_runs SET trigger_type='webhook',webhook_trigger_id=p_trigger_id
    WHERE id=(v_result->>'run_id')::uuid AND user_id=p_user_id;
  END IF;
  UPDATE public.automation_webhook_triggers SET last_used_at=pg_catalog.statement_timestamp()
  WHERE id=p_trigger_id AND user_id=p_user_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.automation_record_webhook_run(
  uuid,uuid,uuid,integer,uuid,text,integer,integer,integer,integer,jsonb,integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_record_webhook_run(
  uuid,uuid,uuid,integer,uuid,text,integer,integer,integer,integer,jsonb,integer
) TO service_role;

COMMENT ON TABLE public.automation_webhook_triggers IS
 'Disabled by default. AES-GCM encrypted signing keys, owner-only server operations, maximum five per account.';
