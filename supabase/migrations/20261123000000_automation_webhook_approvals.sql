-- ETERNYX Automation Phase 2D: signed webhook approval inbox.
-- No external action is invoked. An owner can approve/reject a REAL inbound
-- signed text event; approval executes only the saved deterministic workflow.
-- Encrypted payloads are private to trusted Edge functions, never Data API.

ALTER TABLE public.automation_webhook_triggers
  ADD COLUMN approval_required boolean NOT NULL DEFAULT false;

CREATE TABLE public.automation_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.automation_workflows(id) ON DELETE SET NULL,
  trigger_id uuid REFERENCES public.automation_webhook_triggers(id) ON DELETE SET NULL,
  workflow_revision integer NOT NULL CHECK (workflow_revision > 0),
  credential_version integer NOT NULL CHECK (credential_version > 0),
  request_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  -- Only AES-256-GCM encrypted text, with independent 96-bit nonce.
  input_ciphertext text NOT NULL CHECK (
    char_length(input_ciphertext) BETWEEN 32 AND 4032 AND
    input_ciphertext ~ '^[0-9a-f]+$' AND char_length(input_ciphertext) % 2 = 0
  ),
  input_nonce text NOT NULL CHECK (input_nonce ~ '^[0-9a-f]{24}$'),
  input_bytes integer NOT NULL CHECK (input_bytes BETWEEN 0 AND 2000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  run_id uuid REFERENCES public.automation_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  decided_at timestamptz,
  CONSTRAINT automation_approval_expiry CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '24 hours'
  ),
  CONSTRAINT automation_approval_decision CHECK (
    (status = 'pending' AND decided_at IS NULL AND run_id IS NULL)
    OR (status IN ('rejected','expired') AND run_id IS NULL)
    OR (status = 'approved' AND run_id IS NOT NULL AND decided_at IS NOT NULL)
  ),
  UNIQUE(user_id,request_key)
);
CREATE INDEX automation_approvals_owner_pending
  ON public.automation_approval_requests(user_id,created_at DESC)
  WHERE status='pending';
CREATE INDEX automation_approvals_owner_recent
  ON public.automation_approval_requests(user_id,created_at DESC);
ALTER TABLE public.automation_approval_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_approval_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_approval_requests TO service_role;

-- Changing the approval policy is owned, transactionally ordered with
-- re-enablement, rotation and webhook execution.
CREATE OR REPLACE FUNCTION public.automation_set_webhook_approval(
  p_user_id uuid,p_trigger_id uuid,p_required boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v public.automation_webhook_triggers%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_trigger_id IS NULL OR p_required IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_webhook_triggers
  SET approval_required=p_required
  WHERE id=p_trigger_id AND user_id=p_user_id RETURNING * INTO v;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  RETURN jsonb_build_object('ok',true,'trigger_id',v.id,'approval_required',v.approval_required);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_set_webhook_approval(uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_set_webhook_approval(uuid,uuid,boolean)
  TO service_role;

-- Service-only ingress RPC. Caller has already HMAC-verified this request.
-- Quotas: maximum 10 live approvals and 40 total submissions/owner/24h.
-- Signed request UUID is idempotent even across retries; a completed direct
-- webhook request with the same key may not re-enter the approval queue.
CREATE OR REPLACE FUNCTION public.automation_enqueue_webhook_approval(
  p_user_id uuid,p_trigger_id uuid,p_workflow_id uuid,
  p_workflow_revision integer,p_credential_version integer,
  p_request_key uuid,p_fingerprint text,p_ciphertext text,p_nonce text,
  p_input_bytes integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE t public.automation_webhook_triggers%ROWTYPE;
  w public.automation_workflows%ROWTYPE;
  a public.automation_approval_requests%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_trigger_id IS NULL OR p_workflow_id IS NULL
     OR p_request_key IS NULL OR p_workflow_revision IS NULL OR p_workflow_revision<1
     OR p_credential_version IS NULL OR p_credential_version<1
     OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_ciphertext IS NULL OR char_length(p_ciphertext) NOT BETWEEN 32 AND 4032
     OR p_ciphertext !~ '^[0-9a-f]+$' OR char_length(p_ciphertext)%2<>0
     OR p_nonce IS NULL OR p_nonce !~ '^[0-9a-f]{24}$'
     OR p_input_bytes IS NULL OR p_input_bytes NOT BETWEEN 0 AND 2000 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO t FROM public.automation_webhook_triggers
    WHERE id=p_trigger_id AND user_id=p_user_id AND workflow_id=p_workflow_id
      AND enabled=true AND approval_required=true
      AND credential_version=p_credential_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','trigger_revoked'); END IF;
  SELECT * INTO w FROM public.automation_workflows WHERE id=p_workflow_id AND user_id=p_user_id
    AND active=true AND trigger_kind='manual' AND revision=p_workflow_revision;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_workflow'); END IF;

  UPDATE public.automation_approval_requests
    SET status='expired',decided_at=pg_catalog.statement_timestamp()
    WHERE user_id=p_user_id AND status='pending'
      AND expires_at<=pg_catalog.statement_timestamp();

  SELECT * INTO a FROM public.automation_approval_requests
    WHERE user_id=p_user_id AND request_key=p_request_key;
  IF FOUND THEN
    IF a.trigger_id IS DISTINCT FROM p_trigger_id
       OR a.workflow_id IS DISTINCT FROM p_workflow_id
       OR a.request_fingerprint IS DISTINCT FROM p_fingerprint
       OR a.workflow_revision IS DISTINCT FROM p_workflow_revision
       OR a.credential_version IS DISTINCT FROM p_credential_version THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok',true,'approval_id',a.id,
      'status',a.status,'reused',true,'expires_at',a.expires_at);
  END IF;
  IF EXISTS (SELECT 1 FROM public.automation_runs
             WHERE user_id=p_user_id AND request_key=p_request_key) THEN
    RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
  END IF;
  IF (SELECT count(*) FROM public.automation_approval_requests
      WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours') >= 40 THEN
    RETURN jsonb_build_object('ok',false,'reason','daily_approval_limit');
  END IF;
  IF (SELECT count(*) FROM public.automation_approval_requests
      WHERE user_id=p_user_id AND status='pending') >= 10 THEN
    RETURN jsonb_build_object('ok',false,'reason','pending_limit');
  END IF;
  INSERT INTO public.automation_approval_requests(
    user_id,workflow_id,trigger_id,workflow_revision,credential_version,
    request_key,request_fingerprint,input_ciphertext,input_nonce,input_bytes,
    created_at,expires_at
  ) VALUES(
    p_user_id,p_workflow_id,p_trigger_id,p_workflow_revision,p_credential_version,
    p_request_key,p_fingerprint,p_ciphertext,p_nonce,p_input_bytes,
    pg_catalog.statement_timestamp(),pg_catalog.statement_timestamp()+interval '24 hours'
  ) RETURNING * INTO a;
  RETURN jsonb_build_object('ok',true,'approval_id',a.id,'status','pending',
    'reused',false,'expires_at',a.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_enqueue_webhook_approval(
  uuid,uuid,uuid,integer,integer,uuid,text,text,text,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_enqueue_webhook_approval(
  uuid,uuid,uuid,integer,integer,uuid,text,text,text,integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_reject_webhook_approval(
  p_user_id uuid,p_approval_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.automation_approval_requests%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_approval_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_approval_requests
    SET status=CASE WHEN expires_at<=pg_catalog.statement_timestamp()
                    THEN 'expired' ELSE 'rejected' END,
        decided_at=pg_catalog.statement_timestamp()
    WHERE id=p_approval_id AND user_id=p_user_id AND status='pending'
    RETURNING * INTO a;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_pending'); END IF;
  RETURN jsonb_build_object('ok',true,'approval_id',a.id,'status',a.status);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_reject_webhook_approval(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_reject_webhook_approval(uuid,uuid)
  TO service_role;

-- Edge Function has decrypted the approved event, reloaded the current saved
-- workflow and recomputed its result. This transaction checks all ownership,
-- current revision, trigger mode/key, budget and pending state atomically.
CREATE OR REPLACE FUNCTION public.automation_approve_webhook_execution(
  p_user_id uuid,p_approval_id uuid,p_workflow_revision integer,
  p_input_lines integer,p_output_lines integer,
  p_input_characters integer,p_output_characters integer,p_trace jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.automation_approval_requests%ROWTYPE;
  t public.automation_webhook_triggers%ROWTYPE;
  w public.automation_workflows%ROWTYPE;
  r jsonb;
BEGIN
  IF p_user_id IS NULL OR p_approval_id IS NULL OR p_workflow_revision IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO a FROM public.automation_approval_requests
    WHERE id=p_approval_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF a.status<>'pending' THEN
    RETURN jsonb_build_object('ok',false,'reason','not_pending');
  END IF;
  IF a.expires_at<=pg_catalog.statement_timestamp() THEN
    UPDATE public.automation_approval_requests
    SET status='expired',decided_at=pg_catalog.statement_timestamp() WHERE id=a.id;
    RETURN jsonb_build_object('ok',false,'reason','expired');
  END IF;
  SELECT * INTO t FROM public.automation_webhook_triggers
    WHERE id=a.trigger_id AND user_id=p_user_id AND workflow_id=a.workflow_id
      AND enabled=true AND approval_required=true
      AND credential_version=a.credential_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','trigger_revoked'); END IF;
  SELECT * INTO w FROM public.automation_workflows
    WHERE id=a.workflow_id AND user_id=p_user_id AND active=true
      AND trigger_kind='manual' AND revision=p_workflow_revision
      AND revision=a.workflow_revision;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_workflow'); END IF;
  SELECT public.automation_record_run(
    p_user_id,a.workflow_id,a.workflow_revision,a.request_key,a.request_fingerprint,
    p_input_lines,p_output_lines,p_input_characters,p_output_characters,p_trace
  ) INTO r;
  IF r->>'ok' IS DISTINCT FROM 'true' THEN RETURN r; END IF;
  IF r->>'already_recorded'='true' THEN
    RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
  END IF;
  UPDATE public.automation_runs SET trigger_type='webhook',webhook_trigger_id=a.trigger_id
    WHERE id=(r->>'run_id')::uuid AND user_id=p_user_id;
  UPDATE public.automation_approval_requests SET
    status='approved',run_id=(r->>'run_id')::uuid,
    decided_at=pg_catalog.statement_timestamp()
    WHERE id=a.id AND status='pending';
  UPDATE public.automation_webhook_triggers SET last_used_at=pg_catalog.statement_timestamp()
    WHERE id=t.id AND user_id=p_user_id;
  RETURN jsonb_build_object('ok',true,'approval_id',a.id,'run_id',r->>'run_id',
    'status','approved','created_at',r->>'created_at');
END;
$$;
REVOKE ALL ON FUNCTION public.automation_approve_webhook_execution(
  uuid,uuid,integer,integer,integer,integer,integer,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_approve_webhook_execution(
  uuid,uuid,integer,integer,integer,integer,integer,jsonb
) TO service_role;

COMMENT ON TABLE public.automation_approval_requests IS
  'Signed webhook requests pending owner approval. Inputs are AES ciphertext only; 24h expiration and 10 live pending/account.';
