-- ETERNYX Automation Phase 2F: real, fixed-destination, public GitHub read.
-- No OAuth token, external write, script, URL selection, cron, paid AI, or
-- arbitrary provider enabled. All tables are service-only and RLS protected.

CREATE TABLE public.automation_provider_policies (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'github_public'
    CHECK (provider='github_public'),
  enabled boolean NOT NULL DEFAULT false,
  daily_limit smallint NOT NULL DEFAULT 5
    CHECK (daily_limit BETWEEN 1 AND 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_provider_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_provider_policies FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_provider_policies TO service_role;

CREATE TABLE public.automation_provider_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'github_public'
    CHECK (provider='github_public'),
  request_key uuid NOT NULL,
  repo_owner text NOT NULL CHECK (
    char_length(repo_owner) BETWEEN 1 AND 39
    AND repo_owner ~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
  ),
  repo_name text NOT NULL CHECK (
    char_length(repo_name) BETWEEN 1 AND 100
    AND repo_name ~ '^[A-Za-z0-9_.-]+$'
    AND repo_name NOT IN ('.','..')
  ),
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved','succeeded','failed')),
  http_status integer CHECK (http_status BETWEEN 200 AND 599),
  result jsonb CHECK (result IS NULL OR (
    jsonb_typeof(result)='object' AND char_length(result::text)<=4000
  )),
  error_code text CHECK (error_code IS NULL OR
    error_code IN ('not_found','provider_rate_limited','provider_unavailable',
                   'upstream_invalid','private_repository','request_timeout')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(user_id,request_key),
  CHECK (
    (state='reserved' AND completed_at IS NULL AND http_status IS NULL
      AND result IS NULL AND error_code IS NULL)
    OR
    (state='succeeded' AND completed_at IS NOT NULL AND http_status=200
      AND result IS NOT NULL AND error_code IS NULL)
    OR
    (state='failed' AND completed_at IS NOT NULL AND result IS NULL
      AND error_code IS NOT NULL)
  )
);
CREATE INDEX automation_provider_owner_recent
  ON public.automation_provider_calls(user_id,created_at DESC);
CREATE INDEX automation_provider_retention
  ON public.automation_provider_calls(created_at);
ALTER TABLE public.automation_provider_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_provider_calls FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_provider_calls TO service_role;

-- A single per-user transactional lock serializes policy changes, reservations,
-- quotas and job completions. No user-supplied URI ever reaches SQL.
CREATE OR REPLACE FUNCTION public.automation_set_github_read_policy(
  p_user_id uuid,p_enabled boolean,p_daily_limit integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $policy$
DECLARE p public.automation_provider_policies%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_enabled IS NULL OR p_daily_limit IS NULL
    OR p_daily_limit NOT BETWEEN 1 AND 20 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  INSERT INTO public.automation_provider_policies(user_id,enabled,daily_limit,updated_at)
    VALUES(p_user_id,p_enabled,p_daily_limit,pg_catalog.statement_timestamp())
  ON CONFLICT (user_id) DO UPDATE SET
    enabled=EXCLUDED.enabled,daily_limit=EXCLUDED.daily_limit,
    updated_at=pg_catalog.statement_timestamp()
  RETURNING * INTO p;
  RETURN jsonb_build_object('ok',true,'enabled',p.enabled,
    'daily_limit',p.daily_limit,'provider',p.provider);
END;
$policy$;
REVOKE ALL ON FUNCTION public.automation_set_github_read_policy(uuid,boolean,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_set_github_read_policy(uuid,boolean,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_reserve_github_read(
  p_user_id uuid,p_repo_owner text,p_repo_name text,p_request_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $reserve$
DECLARE policy public.automation_provider_policies%ROWTYPE;
  old public.automation_provider_calls%ROWTYPE;
  event public.automation_provider_calls%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL OR p_repo_owner IS NULL
    OR p_repo_name IS NULL
    OR char_length(p_repo_owner) NOT BETWEEN 1 AND 39
    OR p_repo_owner !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
    OR char_length(p_repo_name) NOT BETWEEN 1 AND 100
    OR p_repo_name !~ '^[A-Za-z0-9_.-]+$'
    OR p_repo_name IN ('.','..') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  SELECT * INTO policy FROM public.automation_provider_policies
    WHERE user_id=p_user_id AND provider='github_public' AND enabled=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','disabled'); END IF;
  SELECT * INTO old FROM public.automation_provider_calls
    WHERE user_id=p_user_id AND request_key=p_request_key;
  IF FOUND THEN
    IF lower(old.repo_owner)<>lower(p_repo_owner) OR
       lower(old.repo_name)<>lower(p_repo_name) THEN
      RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('ok',true,'replayed',true,
      'call_id',old.id,'state',old.state);
  END IF;
  -- One active in-flight read at a time per owner. A crashed request is
  -- marked failed after 45s; the original request key is NEVER reissued.
  UPDATE public.automation_provider_calls SET state='failed',
    error_code='request_timeout',completed_at=pg_catalog.statement_timestamp()
    WHERE user_id=p_user_id AND state='reserved'
      AND created_at<=pg_catalog.statement_timestamp()-interval '45 seconds';
  IF EXISTS(SELECT 1 FROM public.automation_provider_calls
    WHERE user_id=p_user_id AND state='reserved') THEN
    RETURN jsonb_build_object('ok',false,'reason','request_in_flight');
  END IF;
  IF (SELECT count(*) FROM public.automation_provider_calls
    WHERE user_id=p_user_id AND created_at>pg_catalog.statement_timestamp()-interval '24 hours')
      >= policy.daily_limit THEN
    RETURN jsonb_build_object('ok',false,'reason','daily_limit');
  END IF;
  INSERT INTO public.automation_provider_calls
    (user_id,request_key,repo_owner,repo_name)
    VALUES(p_user_id,p_request_key,p_repo_owner,p_repo_name)
    RETURNING * INTO event;
  RETURN jsonb_build_object('ok',true,'replayed',false,
    'call_id',event.id,'state','reserved');
END;
$reserve$;
REVOKE ALL ON FUNCTION public.automation_reserve_github_read(uuid,text,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_reserve_github_read(uuid,text,text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.automation_finish_github_read(
  p_user_id uuid,p_call_id uuid,p_succeeded boolean,
  p_status integer,p_result jsonb,p_error text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $finish$
DECLARE c public.automation_provider_calls%ROWTYPE;
  allowed_keys text[]:=ARRAY[
    'name','fullName','description','stars','forks','openIssues','language',
    'archived','defaultBranch','url'
  ];
BEGIN
  IF p_user_id IS NULL OR p_call_id IS NULL OR p_succeeded IS NULL OR
     (p_status IS NOT NULL AND p_status NOT BETWEEN 200 AND 599) THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_request');
  END IF;
  IF p_succeeded THEN
    IF p_status<>200 OR p_result IS NULL OR jsonb_typeof(p_result)<>'object'
       OR char_length(p_result::text)>4000 OR p_error IS NOT NULL OR
       NOT (p_result ?& allowed_keys) OR
       EXISTS(SELECT 1 FROM jsonb_object_keys(p_result) x
             WHERE NOT (x=ANY(allowed_keys))) OR
       jsonb_typeof(p_result->'name')<>'string' OR
       jsonb_typeof(p_result->'fullName')<>'string' OR
       jsonb_typeof(p_result->'url')<>'string' OR
       jsonb_typeof(p_result->'stars')<>'number' OR
       jsonb_typeof(p_result->'forks')<>'number' OR
       jsonb_typeof(p_result->'openIssues')<>'number' OR
       jsonb_typeof(p_result->'archived')<>'boolean' OR
       jsonb_typeof(p_result->'description') NOT IN ('null','string') OR
       jsonb_typeof(p_result->'language') NOT IN ('null','string') OR
       jsonb_typeof(p_result->'defaultBranch') NOT IN ('null','string') THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_result');
    END IF;
  ELSE
    IF p_result IS NOT NULL OR p_error IS NULL OR p_error NOT IN
        ('not_found','provider_rate_limited','provider_unavailable',
         'upstream_invalid','private_repository','request_timeout') THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_result');
    END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_provider_calls
    SET state=CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
      http_status=p_status,result=CASE WHEN p_succeeded THEN p_result ELSE NULL END,
      error_code=CASE WHEN p_succeeded THEN NULL ELSE p_error END,
      completed_at=pg_catalog.statement_timestamp()
    WHERE id=p_call_id AND user_id=p_user_id AND state='reserved'
      AND created_at>pg_catalog.statement_timestamp()-interval '45 seconds'
    RETURNING * INTO c;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stale_call'); END IF;
  RETURN jsonb_build_object('ok',true,'call_id',c.id,'state',c.state);
END;
$finish$;
REVOKE ALL ON FUNCTION public.automation_finish_github_read(
  uuid,uuid,boolean,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_finish_github_read(
  uuid,uuid,boolean,integer,jsonb,text) TO service_role;

-- Owner lifecycle pruning, not phantom background scheduling. Results expire
-- from the private DB after 24h, while call metadata survives up to 7d.
CREATE OR REPLACE FUNCTION public.automation_prune_github_reads(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $prune$
DECLARE n integer; m integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','invalid_request'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261122,pg_catalog.hashtext(p_user_id::text));
  UPDATE public.automation_provider_calls SET result=NULL
    WHERE user_id=p_user_id AND state='succeeded'
      AND created_at<=pg_catalog.statement_timestamp()-interval '24 hours';
  -- Success check permits result=NULL only after expiry; row constraint
  -- above will be relaxed below to preserve privacy-with-audit semantics.
  GET DIAGNOSTICS n=ROW_COUNT;
  DELETE FROM public.automation_provider_calls
    WHERE user_id=p_user_id AND created_at<=pg_catalog.statement_timestamp()-interval '7 days';
  GET DIAGNOSTICS m=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'results_scrubbed',n,'audit_deleted',m);
END;
$prune$;
REVOKE ALL ON FUNCTION public.automation_prune_github_reads(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automation_prune_github_reads(uuid)
  TO service_role;

-- Permit succeeded entries with NULL sanitized result after 24h retention
-- pruning while retaining immutable audit state.
ALTER TABLE public.automation_provider_calls
  DROP CONSTRAINT automation_provider_calls_check;
ALTER TABLE public.automation_provider_calls
  ADD CONSTRAINT automation_provider_calls_check CHECK (
    (state='reserved' AND completed_at IS NULL AND http_status IS NULL
      AND result IS NULL AND error_code IS NULL)
    OR (state='succeeded' AND completed_at IS NOT NULL AND http_status=200
      AND error_code IS NULL)
    OR (state='failed' AND completed_at IS NOT NULL AND result IS NULL
      AND error_code IS NOT NULL)
  );
