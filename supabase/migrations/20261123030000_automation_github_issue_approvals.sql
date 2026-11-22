-- ETERNYX Automation Phase 2G: authenticated GitHub issue submissions.
-- One explicitly bound repo, per-user fine-grained token encrypted at rest,
-- human-approved one-time issue writes. NO general OAuth, webhooks, arbitrary
-- outbound hosts/methods, labels, assignees, executable inputs or cron.
-- All access through verified-user Edge function + service-only invoker RPCs.

CREATE TABLE public.automation_github_issue_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_owner text NOT NULL CHECK(
    char_length(repo_owner) BETWEEN 1 AND 39
    AND repo_owner ~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'),
  repo_name text NOT NULL CHECK(
    char_length(repo_name) BETWEEN 1 AND 100
    AND repo_name ~ '^[A-Za-z0-9_.-]+$' AND repo_name NOT IN ('.','..')),
  github_login text NOT NULL CHECK(char_length(github_login) BETWEEN 1 AND 80),
  credential_ciphertext text NOT NULL CHECK(
    char_length(credential_ciphertext) BETWEEN 128 AND 1024
    AND credential_ciphertext ~ '^[0-9a-f]+$' AND char_length(credential_ciphertext)%2=0),
  credential_nonce text NOT NULL CHECK(credential_nonce ~ '^[0-9a-f]{24}$'),
  version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483647),
  enabled boolean NOT NULL DEFAULT false,
  scope text NOT NULL DEFAULT 'github_issue_create'
    CHECK(scope='github_issue_create'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_github_issue_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_github_issue_connections FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_github_issue_connections TO service_role;

CREATE TABLE public.automation_github_issue_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  repo_owner text NOT NULL CHECK(char_length(repo_owner) BETWEEN 1 AND 39),
  repo_name text NOT NULL CHECK(char_length(repo_name) BETWEEN 1 AND 100),
  connection_version integer NOT NULL CHECK(connection_version > 0),
  payload_ciphertext text CHECK(payload_ciphertext IS NULL OR (
    char_length(payload_ciphertext) BETWEEN 34 AND 5500
    AND payload_ciphertext ~ '^[0-9a-f]+$' AND char_length(payload_ciphertext)%2=0)),
  payload_nonce text CHECK(payload_nonce IS NULL OR payload_nonce ~ '^[0-9a-f]{24}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(
    status IN ('pending','submitting','succeeded','failed','uncertain','rejected','expired')),
  issue_number integer CHECK(issue_number IS NULL OR issue_number > 0),
  issue_url text CHECK(issue_url IS NULL OR (
    char_length(issue_url) BETWEEN 24 AND 350
    AND issue_url ~ '^https://github[.]com/[A-Za-z0-9-]+/[A-Za-z0-9_.-]+/issues/[1-9][0-9]*$')),
  error_code text CHECK(error_code IS NULL OR error_code IN(
    'github_forbidden','github_validation','github_not_found',
    'github_rate_limit','github_unavailable','network_uncertain',
    'commit_unknown','github_invalid_response')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
  decided_at timestamptz,
  previewed_at timestamptz,
  finished_at timestamptz,
  UNIQUE(user_id,request_key),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours'),
  CHECK((status='pending' AND payload_ciphertext IS NOT NULL AND payload_nonce IS NOT NULL
          AND decided_at IS NULL AND finished_at IS NULL)
     OR (status<>'pending' AND payload_ciphertext IS NULL AND payload_nonce IS NULL)),
  CHECK((status='succeeded' AND issue_number IS NOT NULL AND issue_url IS NOT NULL
           AND finished_at IS NOT NULL AND error_code IS NULL)
    OR (status<>'succeeded' AND issue_number IS NULL AND issue_url IS NULL))
);
CREATE INDEX automation_issues_owner_recent
  ON public.automation_github_issue_drafts(user_id,created_at DESC);
CREATE INDEX automation_issues_pending
  ON public.automation_github_issue_drafts(user_id,created_at DESC)
  WHERE status='pending';
ALTER TABLE public.automation_github_issue_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_github_issue_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_github_issue_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.automation_connect_github_issues(
  p_user_id uuid,p_owner text,p_repo text,p_login text,
  p_ciphertext text,p_nonce text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $connect$
DECLARE c public.automation_github_issue_connections%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_owner IS NULL OR p_repo IS NULL OR p_login IS NULL
     OR char_length(p_owner) NOT BETWEEN 1 AND 39
     OR p_owner !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
     OR char_length(p_repo) NOT BETWEEN 1 AND 100
     OR p_repo !~ '^[A-Za-z0-9_.-]+$' OR p_repo IN ('.','..')
     OR char_length(p_login) NOT BETWEEN 1 AND 80
     OR p_ciphertext IS NULL OR char_length(p_ciphertext) NOT BETWEEN 128 AND 1024
     OR p_ciphertext !~ '^[0-9a-f]+$' OR char_length(p_ciphertext)%2<>0
     OR p_nonce IS NULL OR p_nonce !~ '^[0-9a-f]{24}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  IF EXISTS (SELECT 1 FROM public.automation_github_issue_connections
      WHERE user_id=p_user_id AND version>=2147483646) THEN
    RETURN jsonb_build_object('ok',false,'reason','version_exhausted');
  END IF;
  INSERT INTO public.automation_github_issue_connections(
    user_id,repo_owner,repo_name,github_login,credential_ciphertext,credential_nonce)
  VALUES(p_user_id,p_owner,p_repo,p_login,p_ciphertext,p_nonce)
  ON CONFLICT(user_id) DO UPDATE SET
    repo_owner=EXCLUDED.repo_owner,repo_name=EXCLUDED.repo_name,
    github_login=EXCLUDED.github_login,
    credential_ciphertext=EXCLUDED.credential_ciphertext,
    credential_nonce=EXCLUDED.credential_nonce,
    version=public.automation_github_issue_connections.version+1,
    enabled=false,verified_at=pg_catalog.statement_timestamp(),
    updated_at=pg_catalog.statement_timestamp()
  RETURNING * INTO c;
  RETURN jsonb_build_object('ok',true,'owner',c.repo_owner,'repo',c.repo_name,
    'login',c.github_login,'enabled',false,'version',c.version);
END;
$connect$;
REVOKE ALL ON FUNCTION public.automation_connect_github_issues(uuid,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_connect_github_issues(uuid,text,text,text,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_toggle_github_issues(
  p_user_id uuid,p_enabled boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $toggle$
DECLARE c public.automation_github_issue_connections%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_enabled IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_github_issue_connections
    SET enabled=p_enabled,updated_at=pg_catalog.statement_timestamp()
    WHERE user_id=p_user_id RETURNING * INTO c;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_connected'); END IF;
  RETURN jsonb_build_object('ok',true,'enabled',c.enabled,'version',c.version);
END;
$toggle$;
REVOKE ALL ON FUNCTION public.automation_toggle_github_issues(uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_toggle_github_issues(uuid,boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_disconnect_github_issues(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $disconnect$
DECLARE n integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  -- Prevent reconnecting with a fresh version=1 from authorizing an old draft.
  -- The deletion and invalidation are atomic under the owner advisory lock.
  UPDATE public.automation_github_issue_drafts SET
    status='rejected',decided_at=pg_catalog.statement_timestamp(),
    payload_ciphertext=NULL,payload_nonce=NULL
    WHERE user_id=p_user_id AND status='pending';
  DELETE FROM public.automation_github_issue_connections WHERE user_id=p_user_id;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'disconnected',n>0);
END;
$disconnect$;
REVOKE ALL ON FUNCTION public.automation_disconnect_github_issues(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_disconnect_github_issues(uuid)
  TO service_role;

-- Source-of-truth draft: only ciphertext, nonce, metadata and immutable request
-- fingerprint. This function does NOT perform any GitHub HTTP operation.
CREATE OR REPLACE FUNCTION public.automation_prepare_github_issue(
  p_user_id uuid,p_request_key uuid,p_fingerprint text,
  p_ciphertext text,p_nonce text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $prepare$
DECLARE c public.automation_github_issue_connections%ROWTYPE;
  d public.automation_github_issue_drafts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL OR p_fingerprint IS NULL OR
     p_fingerprint !~ '^[0-9a-f]{64}$' OR p_ciphertext IS NULL
     OR char_length(p_ciphertext) NOT BETWEEN 34 AND 5500
     OR p_ciphertext !~ '^[0-9a-f]+$' OR char_length(p_ciphertext)%2<>0
     OR p_nonce IS NULL OR p_nonce !~ '^[0-9a-f]{24}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO c FROM public.automation_github_issue_connections
    WHERE user_id=p_user_id AND enabled=true AND scope='github_issue_create';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','disabled'); END IF;
  UPDATE public.automation_github_issue_drafts SET status='expired',
    decided_at=pg_catalog.statement_timestamp(),
    payload_ciphertext=NULL,payload_nonce=NULL
    WHERE user_id=p_user_id AND status='pending'
      AND expires_at<=pg_catalog.statement_timestamp();
  SELECT * INTO d FROM public.automation_github_issue_drafts
    WHERE user_id=p_user_id AND request_key=p_request_key;
  IF FOUND THEN
    IF d.request_fingerprint<>p_fingerprint OR
       d.connection_version<>c.version OR
       lower(d.repo_owner)<>lower(c.repo_owner) OR
       lower(d.repo_name)<>lower(c.repo_name) THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok',true,'draft_id',d.id,'status',d.status,
      'replayed',true,'expires_at',d.expires_at);
  END IF;
  IF (SELECT count(*) FROM public.automation_github_issue_drafts
    WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours')
    >= 10 THEN
    RETURN jsonb_build_object('ok',false,'reason','draft_limit');
  END IF;
  IF (SELECT count(*) FROM public.automation_github_issue_drafts
    WHERE user_id=p_user_id AND status='pending')>=3 THEN
    RETURN jsonb_build_object('ok',false,'reason','pending_limit');
  END IF;
  INSERT INTO public.automation_github_issue_drafts(
    user_id,request_key,request_fingerprint,repo_owner,repo_name,
    connection_version,payload_ciphertext,payload_nonce,
    created_at,expires_at
  ) VALUES(
    p_user_id,p_request_key,p_fingerprint,c.repo_owner,c.repo_name,
    c.version,p_ciphertext,p_nonce,pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()+interval '24 hours'
  ) RETURNING * INTO d;
  RETURN jsonb_build_object('ok',true,'draft_id',d.id,'status','pending',
    'replayed',false,'expires_at',d.expires_at);
END;
$prepare$;
REVOKE ALL ON FUNCTION public.automation_prepare_github_issue(uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_prepare_github_issue(uuid,uuid,text,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_reject_github_issue(
  p_user_id uuid,p_draft_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $reject$
DECLARE d public.automation_github_issue_drafts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_draft_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_github_issue_drafts SET
    status=CASE WHEN expires_at<=pg_catalog.statement_timestamp()
      THEN 'expired' ELSE 'rejected' END,
    decided_at=pg_catalog.statement_timestamp(),
    payload_ciphertext=NULL,payload_nonce=NULL
    WHERE id=p_draft_id AND user_id=p_user_id AND status='pending'
  RETURNING * INTO d;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_pending'); END IF;
  RETURN jsonb_build_object('ok',true,'draft_id',d.id,'status',d.status);
END;
$reject$;
REVOKE ALL ON FUNCTION public.automation_reject_github_issue(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_reject_github_issue(uuid,uuid) TO service_role;

-- Preview proof is server-stamped after authenticated owner decrypts the
-- exact draft. Claim requires a recent (<=10 minute) preview and active grant.
CREATE OR REPLACE FUNCTION public.automation_mark_github_issue_previewed(
  p_user_id uuid,p_draft_id uuid,p_version integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $preview$
DECLARE c public.automation_github_issue_connections%ROWTYPE;
  d public.automation_github_issue_drafts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_draft_id IS NULL OR p_version IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO d FROM public.automation_github_issue_drafts
    WHERE user_id=p_user_id AND id=p_draft_id AND status='pending'
      AND expires_at>pg_catalog.statement_timestamp();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_pending'); END IF;
  SELECT * INTO c FROM public.automation_github_issue_connections
    WHERE user_id=p_user_id AND enabled=true AND scope='github_issue_create'
      AND version=p_version AND version=d.connection_version
      AND lower(repo_owner)=lower(d.repo_owner)
      AND lower(repo_name)=lower(d.repo_name);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','connection_changed'); END IF;
  UPDATE public.automation_github_issue_drafts
    SET previewed_at=pg_catalog.statement_timestamp()
    WHERE user_id=p_user_id AND id=p_draft_id AND status='pending';
  RETURN jsonb_build_object('ok',true,'draft_id',d.id,
    'previewed_at',pg_catalog.statement_timestamp());
END;
$preview$;
REVOKE ALL ON FUNCTION public.automation_mark_github_issue_previewed(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_mark_github_issue_previewed(uuid,uuid,integer)
  TO service_role;

-- One-way reservation BEFORE posting. After this transaction no retry can
-- reissue an external side effect for the same draft or request UUID.
CREATE OR REPLACE FUNCTION public.automation_claim_github_issue(
  p_user_id uuid,p_draft_id uuid,p_connection_version integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $claim$
DECLARE c public.automation_github_issue_connections%ROWTYPE;
  d public.automation_github_issue_drafts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_draft_id IS NULL OR p_connection_version IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO d FROM public.automation_github_issue_drafts
    WHERE id=p_draft_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF d.status<>'pending' THEN
    RETURN jsonb_build_object('ok',false,'reason','not_pending'); END IF;
  IF d.expires_at<=pg_catalog.statement_timestamp() THEN
    UPDATE public.automation_github_issue_drafts SET
      status='expired',decided_at=pg_catalog.statement_timestamp(),
      payload_ciphertext=NULL,payload_nonce=NULL WHERE id=d.id;
    RETURN jsonb_build_object('ok',false,'reason','expired');
  END IF;
  IF d.previewed_at IS NULL OR
     d.previewed_at<pg_catalog.statement_timestamp()-interval '10 minutes' THEN
    RETURN jsonb_build_object('ok',false,'reason','not_reviewed');
  END IF;
  SELECT * INTO c FROM public.automation_github_issue_connections
    WHERE user_id=p_user_id AND enabled=true AND scope='github_issue_create'
      AND version=p_connection_version
      AND lower(repo_owner)=lower(d.repo_owner)
      AND lower(repo_name)=lower(d.repo_name);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','connection_changed'); END IF;
  IF EXISTS(SELECT 1 FROM public.automation_github_issue_drafts
    WHERE user_id=p_user_id AND status='submitting'
      AND decided_at>pg_catalog.statement_timestamp()-interval '90 seconds') THEN
    RETURN jsonb_build_object('ok',false,'reason','issue_in_flight');
  END IF;
  UPDATE public.automation_github_issue_drafts SET
    status='uncertain',finished_at=pg_catalog.statement_timestamp(),
    error_code='commit_unknown'
    WHERE user_id=p_user_id AND status='submitting'
      AND decided_at<=pg_catalog.statement_timestamp()-interval '90 seconds';
  -- Charge every claimed write attempt, including known GitHub failures and
  -- uncertain outcomes, against three/day/account. No unaudited side effects.
  IF (SELECT count(*) FROM public.automation_github_issue_drafts
    WHERE user_id=p_user_id AND decided_at>
      pg_catalog.statement_timestamp()-interval '24 hours'
      AND status IN ('submitting','succeeded','failed','uncertain'))>=3 THEN
    RETURN jsonb_build_object('ok',false,'reason','write_limit');
  END IF;
  UPDATE public.automation_github_issue_drafts SET
    status='submitting',payload_ciphertext=NULL,payload_nonce=NULL,
    decided_at=pg_catalog.statement_timestamp()
    WHERE id=d.id AND user_id=p_user_id AND status='pending';
  RETURN jsonb_build_object('ok',true,'draft_id',d.id,'state','submitting',
    'owner',c.repo_owner,'repo',c.repo_name,'version',c.version);
END;
$claim$;
REVOKE ALL ON FUNCTION public.automation_claim_github_issue(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_claim_github_issue(uuid,uuid,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_finish_github_issue(
  p_user_id uuid,p_draft_id uuid,p_state text,
  p_issue_number integer,p_issue_url text,p_error_code text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $finish$
DECLARE d public.automation_github_issue_drafts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_draft_id IS NULL OR p_state NOT IN
     ('succeeded','failed','uncertain') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  IF p_state='succeeded' THEN
    IF p_issue_number IS NULL OR p_issue_number<=0 OR p_issue_url IS NULL OR
       p_error_code IS NOT NULL THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_result'); END IF;
  ELSE
    IF p_issue_number IS NOT NULL OR p_issue_url IS NOT NULL OR
       p_error_code IS NULL OR p_error_code NOT IN (
       'github_forbidden','github_validation','github_not_found',
       'github_rate_limit','github_unavailable','network_uncertain',
       'github_invalid_response') THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_result'); END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO d FROM public.automation_github_issue_drafts
    WHERE id=p_draft_id AND user_id=p_user_id AND status='submitting'
    AND decided_at>pg_catalog.statement_timestamp()-interval '90 seconds'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_submission'); END IF;
  IF p_state='succeeded' THEN
    IF p_issue_url<>('https://github.com/'||d.repo_owner||'/'||d.repo_name||
       '/issues/'||p_issue_number::text) THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_result'); END IF;
  END IF;
  UPDATE public.automation_github_issue_drafts SET
    status=p_state,issue_number=CASE WHEN p_state='succeeded' THEN p_issue_number ELSE NULL END,
    issue_url=CASE WHEN p_state='succeeded' THEN p_issue_url ELSE NULL END,
    error_code=CASE WHEN p_state='succeeded' THEN NULL ELSE p_error_code END,
    finished_at=pg_catalog.statement_timestamp()
    WHERE id=d.id;
  RETURN jsonb_build_object('ok',true,'draft_id',d.id,'status',p_state);
END;
$finish$;
REVOKE ALL ON FUNCTION public.automation_finish_github_issue(
 uuid,uuid,text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_finish_github_issue(
 uuid,uuid,text,integer,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_housekeep_github_issues(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $house$
DECLARE expired integer;uncertain integer;deleted integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_github_issue_drafts SET
    status='expired',decided_at=pg_catalog.statement_timestamp(),
    payload_ciphertext=NULL,payload_nonce=NULL
    WHERE user_id=p_user_id AND status='pending'
      AND expires_at<=pg_catalog.statement_timestamp();
  GET DIAGNOSTICS expired=ROW_COUNT;
  UPDATE public.automation_github_issue_drafts SET
    status='uncertain',finished_at=pg_catalog.statement_timestamp(),
    error_code='commit_unknown'
    WHERE user_id=p_user_id AND status='submitting'
      AND decided_at<=pg_catalog.statement_timestamp()-interval '90 seconds';
  GET DIAGNOSTICS uncertain=ROW_COUNT;
  DELETE FROM public.automation_github_issue_drafts
    WHERE user_id=p_user_id AND status NOT IN ('pending','submitting')
      AND created_at<=pg_catalog.statement_timestamp()-interval '7 days';
  GET DIAGNOSTICS deleted=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'expired',expired,
    'uncertain',uncertain,'deleted',deleted);
END;
$house$;
REVOKE ALL ON FUNCTION public.automation_housekeep_github_issues(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_housekeep_github_issues(uuid)
  TO service_role;
