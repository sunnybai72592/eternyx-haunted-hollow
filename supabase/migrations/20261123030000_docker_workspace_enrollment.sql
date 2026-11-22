-- ETERNYX Docker enrollment: identity-bound key possession, NOT a remote control plane.
-- No Docker endpoints, credentials, shell commands, or server addresses are stored.
-- All mutation RPCs are service_role-only, called after Edge JWT authentication.
CREATE TABLE public.docker_identity_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, owner_id)
);
CREATE INDEX docker_identity_workspaces_owner_idx
  ON public.docker_identity_workspaces(owner_id, created_at DESC);
ALTER TABLE public.docker_identity_workspaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_identity_workspaces FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.docker_identity_workspaces TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.docker_identity_workspaces TO service_role;
CREATE POLICY "Docker workspace owner read"
  ON public.docker_identity_workspaces FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

CREATE TABLE public.docker_agent_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 64),
  public_key text NOT NULL UNIQUE CHECK (public_key ~ '^[A-Za-z0-9_-]{43}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','key_verified','revoked')),
  nonce_sha256 text CHECK (nonce_sha256 IS NULL OR nonce_sha256 ~ '^[0-9a-f]{64}$'),
  challenge_expires_at timestamptz,
  key_verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT docker_registration_workspace_owner
    FOREIGN KEY (workspace_id, owner_id)
    REFERENCES public.docker_identity_workspaces(id, owner_id) ON DELETE CASCADE,
  CONSTRAINT docker_registration_pending_integrity CHECK (
    (status = 'pending' AND nonce_sha256 IS NOT NULL AND challenge_expires_at IS NOT NULL
      AND key_verified_at IS NULL AND revoked_at IS NULL)
    OR (status = 'key_verified' AND nonce_sha256 IS NULL AND challenge_expires_at IS NULL
      AND key_verified_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND nonce_sha256 IS NULL AND challenge_expires_at IS NULL
      AND revoked_at IS NOT NULL)
  )
);
CREATE INDEX docker_agent_registrations_owner_idx
  ON public.docker_agent_registrations(owner_id, created_at DESC);
CREATE INDEX docker_agent_registrations_workspace_idx
  ON public.docker_agent_registrations(workspace_id, created_at DESC);
ALTER TABLE public.docker_agent_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_agent_registrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.docker_agent_registrations TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.docker_agent_registrations TO service_role;
CREATE POLICY "Docker agent owner read"
  ON public.docker_agent_registrations FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

CREATE TABLE public.docker_agent_enrollment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.docker_agent_registrations(id) ON DELETE CASCADE,
  event_kind text NOT NULL CHECK (event_kind IN ('challenge_issued','key_verified','revoked')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX docker_agent_enrollment_events_owner_idx
  ON public.docker_agent_enrollment_events(owner_id, occurred_at DESC);
ALTER TABLE public.docker_agent_enrollment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_agent_enrollment_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.docker_agent_enrollment_events TO authenticated;
GRANT SELECT,INSERT ON public.docker_agent_enrollment_events TO service_role;
CREATE POLICY "Docker enrollment event owner read"
  ON public.docker_agent_enrollment_events FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

CREATE FUNCTION public.docker_identity_create_workspace(p_user_id uuid, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_name IS NULL
    OR char_length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 64 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_user_id::text));
  IF (SELECT count(*) FROM public.docker_identity_workspaces WHERE owner_id=p_user_id) >= 3 THEN
    RETURN jsonb_build_object('ok',false,'reason','workspace_limit');
  END IF;
  INSERT INTO public.docker_identity_workspaces(owner_id,name)
    VALUES(p_user_id,pg_catalog.btrim(p_name)) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'workspace_id',v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_identity_create_workspace(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_identity_create_workspace(uuid,text) TO service_role;

CREATE FUNCTION public.docker_identity_begin_enrollment(
  p_user_id uuid, p_workspace_id uuid, p_name text,
  p_public_key text, p_nonce_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_id uuid; v_expiry timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_workspace_id IS NULL
    OR p_name IS NULL OR char_length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 64
    OR p_public_key IS NULL OR p_public_key !~ '^[A-Za-z0-9_-]{43}$'
    OR p_nonce_hash IS NULL OR p_nonce_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261123,pg_catalog.hashtext(p_user_id::text));
  IF NOT EXISTS (SELECT 1 FROM public.docker_identity_workspaces
                 WHERE id=p_workspace_id AND owner_id=p_user_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','workspace_unavailable');
  END IF;
  IF (SELECT count(*) FROM public.docker_agent_registrations
      WHERE owner_id=p_user_id AND created_at > now() - interval '24 hours') >= 15 THEN
    RETURN jsonb_build_object('ok',false,'reason','daily_limit');
  END IF;
  IF (SELECT count(*) FROM public.docker_agent_registrations
      WHERE owner_id=p_user_id AND status <> 'revoked') >= 10 THEN
    RETURN jsonb_build_object('ok',false,'reason','agent_limit');
  END IF;
  IF EXISTS (SELECT 1 FROM public.docker_agent_registrations
             WHERE public_key=p_public_key) THEN
    RETURN jsonb_build_object('ok',false,'reason','key_registered');
  END IF;
  v_expiry := pg_catalog.statement_timestamp() + interval '10 minutes';
  INSERT INTO public.docker_agent_registrations(
    owner_id,workspace_id,display_name,public_key,status,nonce_sha256,challenge_expires_at
  ) VALUES (p_user_id,p_workspace_id,pg_catalog.btrim(p_name),
            p_public_key,'pending',p_nonce_hash,v_expiry)
  RETURNING id INTO v_id;
  INSERT INTO public.docker_agent_enrollment_events(owner_id,agent_id,event_kind)
    VALUES (p_user_id,v_id,'challenge_issued');
  RETURN jsonb_build_object('ok',true,'agent_id',v_id,'expires_at',v_expiry);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_identity_begin_enrollment(uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_identity_begin_enrollment(uuid,uuid,text,text,text)
  TO service_role;

CREATE FUNCTION public.docker_identity_finish_enrollment(
  p_user_id uuid, p_agent_id uuid, p_nonce_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_agent_id IS NULL OR
     p_nonce_hash IS NULL OR p_nonce_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  UPDATE public.docker_agent_registrations
    SET status='key_verified',nonce_sha256=NULL,challenge_expires_at=NULL,
        key_verified_at=pg_catalog.statement_timestamp()
    WHERE id=p_agent_id AND owner_id=p_user_id
      AND status='pending' AND nonce_sha256=p_nonce_hash
      AND challenge_expires_at > pg_catalog.statement_timestamp()
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','not_pending_or_expired');
  END IF;
  INSERT INTO public.docker_agent_enrollment_events(owner_id,agent_id,event_kind)
    VALUES(p_user_id,v_id,'key_verified');
  RETURN jsonb_build_object('ok',true,'agent_id',v_id,'status','key_verified');
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_identity_finish_enrollment(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_identity_finish_enrollment(uuid,uuid,text)
  TO service_role;

CREATE FUNCTION public.docker_identity_revoke_enrollment(
  p_user_id uuid, p_agent_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_agent_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  UPDATE public.docker_agent_registrations
    SET status='revoked',nonce_sha256=NULL,challenge_expires_at=NULL,
        revoked_at=pg_catalog.statement_timestamp()
    WHERE id=p_agent_id AND owner_id=p_user_id AND status <> 'revoked'
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  INSERT INTO public.docker_agent_enrollment_events(owner_id,agent_id,event_kind)
    VALUES(p_user_id,v_id,'revoked');
  RETURN jsonb_build_object('ok',true,'agent_id',v_id,'status','revoked');
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_identity_revoke_enrollment(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_identity_revoke_enrollment(uuid,uuid)
  TO service_role;
