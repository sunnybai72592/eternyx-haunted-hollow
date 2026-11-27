-- REHEARSAL ONLY. Not a migration; do not apply to staging or production.
-- No browser grants, Edge endpoint, or automatic activation.
BEGIN;
CREATE TABLE public.ctf_http_assessment_policy (
  singleton_id smallint PRIMARY KEY CHECK(singleton_id=1),
  enabled boolean NOT NULL DEFAULT false,
  reviewed_bundle_sha text CHECK(reviewed_bundle_sha ~ '^[a-f0-9]{64}$'),
  CHECK(NOT enabled OR reviewed_bundle_sha IS NOT NULL)
);
INSERT INTO public.ctf_http_assessment_policy(singleton_id) VALUES(1);

CREATE TABLE public.ctf_http_assessment_observations (
  session_id uuid PRIMARY KEY REFERENCES public.ctf_range_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bundle_sha text NOT NULL CHECK(bundle_sha ~ '^[a-f0-9]{64}$'),
  instance_ref text NOT NULL CHECK(instance_ref ~ '^[A-Za-z0-9._:-]{1,128}$'),
  observation_nonce text NOT NULL UNIQUE CHECK(observation_nonce ~ '^[a-f0-9]{64}$'),
  transcript_sha text NOT NULL UNIQUE CHECK(transcript_sha ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz NOT NULL,
  facts jsonb NOT NULL CHECK(facts = '{"authorization-denial":403,"unknown-resource":404,"method-restriction":405,"allowed-method":"GET","cache-policy":"no-store","content-sniffing":"nosniff"}'::jsonb)
);
CREATE TABLE public.ctf_http_assessment_results (
  session_id uuid PRIMARY KEY REFERENCES public.ctf_http_assessment_observations(session_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  correct smallint NOT NULL CHECK(correct BETWEEN 0 AND 6),
  total smallint NOT NULL DEFAULT 6 CHECK(total=6),
  submitted_at timestamptz NOT NULL
);
ALTER TABLE public.ctf_http_assessment_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ctf_http_assessment_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ctf_http_assessment_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ctf_http_assessment_policy,public.ctf_http_assessment_observations,
  public.ctf_http_assessment_results FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT, UPDATE (singleton_id) ON public.ctf_http_assessment_policy TO service_role;
-- Column UPDATE supports row locking, while CHECK restricts singleton_id to 1;
-- service_role cannot update enabled or reviewed_bundle_sha.
GRANT SELECT,INSERT ON public.ctf_http_assessment_observations,public.ctf_http_assessment_results TO service_role;

-- Privileged future evidence producer only. A digest is not proof of provenance:
-- caller must independently validate the actual host and per-session transcript.
CREATE FUNCTION public.ctf_http_record_observation(p_user uuid,p_session uuid,p_bundle text,
  p_transcript text,p_facts jsonb,p_instance text,p_nonce text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.ctf_range_sessions%ROWTYPE;
  policy public.ctf_http_assessment_policy%ROWTYPE;
  provider public.ctf_range_provider%ROWTYPE;
  t timestamptz;
BEGIN
  IF p_user IS NULL OR p_session IS NULL OR p_bundle IS NULL OR p_transcript IS NULL
    OR p_instance IS NULL OR p_instance !~ '^[A-Za-z0-9._:-]{1,128}$'
    OR p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{64}$'
    OR p_bundle !~ '^[a-f0-9]{64}$' OR p_transcript !~ '^[a-f0-9]{64}$'
    OR p_facts IS DISTINCT FROM '{"authorization-denial":403,"unknown-resource":404,"method-restriction":405,"allowed-method":"GET","cache-policy":"no-store","content-sniffing":"nosniff"}'::jsonb
  THEN RETURN false; END IF;
  SELECT * INTO s FROM public.ctf_range_sessions WHERE id=p_session AND user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO policy FROM public.ctf_http_assessment_policy WHERE singleton_id=1 FOR SHARE;
  SELECT * INTO provider FROM public.ctf_range_provider WHERE singleton_id=1 FOR SHARE;
  t:=pg_catalog.clock_timestamp();
  IF s.status<>'running' OR s.started_at IS NULL OR s.started_at>t OR s.expires_at<=t
    OR s.provider_instance_ref IS DISTINCT FROM p_instance OR policy.enabled IS DISTINCT FROM true
    OR policy.reviewed_bundle_sha IS DISTINCT FROM p_bundle
    OR provider.enabled IS DISTINCT FROM true OR provider.ingress_approved IS DISTINCT FROM true
    OR provider.max_active_sessions<1 OR provider.last_heartbeat_at IS NULL
    OR provider.last_heartbeat_at<=t-interval '60 seconds' OR provider.last_heartbeat_at>t+interval '5 seconds'
  THEN RETURN false; END IF;
  INSERT INTO public.ctf_http_assessment_observations(session_id,user_id,bundle_sha,transcript_sha,observed_at,facts,instance_ref,observation_nonce)
    VALUES(p_session,p_user,p_bundle,p_transcript,t,p_facts,p_instance,p_nonce) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END; $$;

-- Trusted future JWT-authenticating endpoint passes only answers and grant hash.
-- Lock the session, policy, provider, and grant before the final clock check.
CREATE FUNCTION public.ctf_http_submit_assessment(p_user uuid,p_session uuid,p_grant_hash text,
  p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.ctf_range_sessions%ROWTYPE;
  policy public.ctf_http_assessment_policy%ROWTYPE;
  provider public.ctf_range_provider%ROWTYPE;
  g public.ctf_range_access_grants%ROWTYPE;
  obs public.ctf_http_assessment_observations%ROWTYPE;
  t timestamptz; score integer; k text; x jsonb;
  deny constant jsonb:='{"ok":false,"reason":"unavailable"}';
BEGIN
  IF p_user IS NULL OR p_session IS NULL OR p_grant_hash IS NULL OR p_grant_hash !~ '^[a-f0-9]{64}$'
    OR p_answers IS NULL OR pg_catalog.jsonb_typeof(p_answers)<>'object'
    OR pg_catalog.octet_length(p_answers::text)>512
  THEN RETURN deny; END IF;
  IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_answers))<>6 THEN RETURN deny; END IF;
  FOR k,x IN SELECT key,value FROM pg_catalog.jsonb_each(p_answers) LOOP
    IF k IN ('authorization-denial','unknown-resource','method-restriction') THEN
      IF x NOT IN ('200'::jsonb,'403'::jsonb,'404'::jsonb,'405'::jsonb) THEN RETURN deny; END IF;
    ELSIF k='allowed-method' THEN
      IF x NOT IN ('"GET"'::jsonb,'"POST"'::jsonb,'"PUT"'::jsonb) THEN RETURN deny; END IF;
    ELSIF k='cache-policy' THEN
      IF x NOT IN ('"no-store"'::jsonb,'"public"'::jsonb,'"max-age=60"'::jsonb) THEN RETURN deny; END IF;
    ELSIF k='content-sniffing' THEN
      IF x NOT IN ('"nosniff"'::jsonb,'"sniff"'::jsonb,'"none"'::jsonb) THEN RETURN deny; END IF;
    ELSE RETURN deny;
    END IF;
  END LOOP;
  SELECT * INTO s FROM public.ctf_range_sessions WHERE id=p_session AND user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN deny; END IF;
  SELECT * INTO policy FROM public.ctf_http_assessment_policy WHERE singleton_id=1 FOR SHARE;
  SELECT * INTO provider FROM public.ctf_range_provider WHERE singleton_id=1 FOR SHARE;
  SELECT * INTO g FROM public.ctf_range_access_grants
    WHERE session_id=p_session AND user_id=p_user AND token_hash=p_grant_hash FOR SHARE;
  IF NOT FOUND THEN RETURN deny; END IF;
  SELECT * INTO obs FROM public.ctf_http_assessment_observations
    WHERE session_id=p_session AND user_id=p_user;
  IF NOT FOUND THEN RETURN deny; END IF;
  t:=pg_catalog.clock_timestamp();
  IF s.status<>'running' OR s.started_at IS NULL OR s.started_at>t OR s.expires_at<=t
    OR s.provider_instance_ref IS DISTINCT FROM obs.instance_ref OR policy.enabled IS DISTINCT FROM true
    OR policy.reviewed_bundle_sha IS DISTINCT FROM obs.bundle_sha
    OR obs.observed_at<s.started_at OR obs.observed_at>t
    OR provider.enabled IS DISTINCT FROM true OR provider.ingress_approved IS DISTINCT FROM true
    OR provider.max_active_sessions<1 OR provider.last_heartbeat_at IS NULL
    OR provider.last_heartbeat_at<=t-interval '60 seconds' OR provider.last_heartbeat_at>t+interval '5 seconds'
    OR g.revoked_at IS NOT NULL OR g.issued_at>t OR g.expires_at<=t
    OR public.ctf_range_check_access_grant(p_session,p_user,p_grant_hash) IS DISTINCT FROM true
  THEN RETURN deny; END IF;
  SELECT count(*) INTO score FROM pg_catalog.jsonb_each(obs.facts) f WHERE p_answers->f.key=f.value;
  INSERT INTO public.ctf_http_assessment_results(session_id,user_id,correct,submitted_at)
    VALUES(p_session,p_user,score,t) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','already_submitted'); END IF;
  RETURN jsonb_build_object('ok',true,'sessionId',p_session,'correct',score,'total',6,'submittedAt',t);
END; $$;

-- No raw answers, access grants, worker identifiers or transcript digests returned.
CREATE FUNCTION public.ctf_http_read_assessment(p_user uuid,p_session uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_build_object('ok',true,'sessionId',r.session_id,
   'correct',r.correct,'total',r.total,'submittedAt',r.submitted_at)
   FROM public.ctf_http_assessment_results r JOIN public.ctf_range_sessions s
   ON s.id=r.session_id AND s.user_id=r.user_id
   WHERE r.user_id=p_user AND r.session_id=p_session),'{"ok":false,"reason":"unavailable"}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.ctf_http_record_observation(uuid,uuid,text,text,jsonb,text,text),
 public.ctf_http_submit_assessment(uuid,uuid,text,jsonb),
 public.ctf_http_read_assessment(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ctf_http_record_observation(uuid,uuid,text,text,jsonb,text,text),
 public.ctf_http_submit_assessment(uuid,uuid,text,jsonb),
 public.ctf_http_read_assessment(uuid,uuid) TO service_role;
COMMIT;
