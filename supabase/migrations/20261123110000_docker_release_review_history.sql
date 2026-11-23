-- Docker release evidence review history: metadata only, never deploy or run Docker.
-- This stores owner assertions and manual review, NOT cryptographic verification.
-- Authenticated accounts can SELECT only owned history; writes are service-role RPC.
CREATE TABLE public.docker_release_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 commit_sha text NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{40}$'),
 candidate_sha256 text NOT NULL CHECK (candidate_sha256 ~ '^[a-f0-9]{64}$'),
 source_snapshot_sha256 text NOT NULL CHECK (source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
 staging_ref text NOT NULL CHECK (staging_ref ~ '^[a-z0-9]{20}$'),
 state text NOT NULL DEFAULT 'submitted'
   CHECK (state IN ('submitted','in_review','reviewed','blocked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 UNIQUE(owner_id,request_key),
 UNIQUE(id,owner_id)
);
CREATE INDEX docker_release_reviews_recent ON public.docker_release_reviews(owner_id,created_at DESC);
ALTER TABLE public.docker_release_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_release_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.docker_release_reviews TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.docker_release_reviews TO service_role;
CREATE POLICY "Docker release reviews: owner reads only" ON public.docker_release_reviews
 FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

CREATE TABLE public.docker_release_review_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 review_id uuid NOT NULL,
 owner_id uuid NOT NULL,
 event_kind text NOT NULL CHECK (event_kind IN ('submitted','in_review','reviewed','blocked')),
 note text NOT NULL CHECK (char_length(note) BETWEEN 12 AND 500 AND note !~ '[[:cntrl:]]'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(review_id,owner_id) REFERENCES public.docker_release_reviews(id,owner_id)
   ON DELETE CASCADE
);
CREATE INDEX docker_release_review_events_recent
 ON public.docker_release_review_events(owner_id,id DESC);
ALTER TABLE public.docker_release_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_release_review_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.docker_release_review_events TO authenticated;
GRANT SELECT,INSERT ON public.docker_release_review_events TO service_role;
GRANT USAGE ON SEQUENCE public.docker_release_review_events_id_seq TO service_role;
CREATE POLICY "Docker release review events: owner reads only" ON public.docker_release_review_events
 FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);

CREATE FUNCTION public.docker_release_submit_review(
 p_owner_id uuid,p_request_key uuid,p_commit_sha text,p_candidate_sha256 text,
 p_source_snapshot_sha256 text,p_manifest_sha256 text,p_staging_ref text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_existing public.docker_release_reviews%ROWTYPE;
 v_now timestamptz:=pg_catalog.statement_timestamp();
 v_id uuid;
BEGIN
 IF p_owner_id IS NULL OR p_request_key IS NULL OR
    p_commit_sha IS NULL OR p_commit_sha !~ '^[a-f0-9]{40}$' OR
    p_candidate_sha256 IS NULL OR p_candidate_sha256 !~ '^[a-f0-9]{64}$' OR
    p_source_snapshot_sha256 IS NULL OR p_source_snapshot_sha256 !~ '^[a-f0-9]{64}$' OR
    p_manifest_sha256 IS NULL OR p_manifest_sha256 !~ '^[a-f0-9]{64}$' OR
    p_staging_ref IS NULL OR p_staging_ref !~ '^[a-z0-9]{20}$' OR
    p_note IS NULL OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 12 AND 500 OR
    p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261124,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_existing FROM public.docker_release_reviews
   WHERE owner_id=p_owner_id AND request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
   IF v_existing.commit_sha=p_commit_sha AND
      v_existing.candidate_sha256=p_candidate_sha256 AND
      v_existing.source_snapshot_sha256=p_source_snapshot_sha256 AND
      v_existing.manifest_sha256=p_manifest_sha256 AND
      v_existing.staging_ref=p_staging_ref THEN
     RETURN jsonb_build_object('ok',true,'review_id',v_existing.id,
       'state',v_existing.state,'reused',true,'deployment_authorized',false);
   END IF;
   RETURN jsonb_build_object('ok',false,'reason','idempotency_conflict');
 END IF;
 IF (SELECT count(*) FROM public.docker_release_reviews WHERE owner_id=p_owner_id)>=100 THEN
   RETURN jsonb_build_object('ok',false,'reason','case_limit');
 END IF;
 IF (SELECT count(*) FROM public.docker_release_reviews
     WHERE owner_id=p_owner_id AND created_at>=v_now-interval '24 hours')>=20 THEN
   RETURN jsonb_build_object('ok',false,'reason','daily_limit');
 END IF;
 INSERT INTO public.docker_release_reviews(
   owner_id,request_key,commit_sha,candidate_sha256,
   source_snapshot_sha256,manifest_sha256,staging_ref,created_at,updated_at
 ) VALUES (
   p_owner_id,p_request_key,p_commit_sha,p_candidate_sha256,
   p_source_snapshot_sha256,p_manifest_sha256,p_staging_ref,v_now,v_now
 ) RETURNING id INTO v_id;
 INSERT INTO public.docker_release_review_events(
   review_id,owner_id,event_kind,note,occurred_at
 ) VALUES(v_id,p_owner_id,'submitted',pg_catalog.btrim(p_note),v_now);
 RETURN jsonb_build_object('ok',true,'review_id',v_id,'state','submitted',
   'reused',false,'deployment_authorized',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_release_submit_review(uuid,uuid,text,text,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_release_submit_review(uuid,uuid,text,text,text,text,text,text)
 TO service_role;

CREATE FUNCTION public.docker_release_decide_review(
 p_owner_id uuid,p_review_id uuid,p_next_state text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_case public.docker_release_reviews%ROWTYPE;
 v_now timestamptz:=pg_catalog.statement_timestamp();
BEGIN
 IF p_owner_id IS NULL OR p_review_id IS NULL OR p_next_state IS NULL OR
    p_next_state NOT IN ('in_review','reviewed','blocked') OR
    p_note IS NULL OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 12 AND 500 OR
    p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261124,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_case FROM public.docker_release_reviews
   WHERE owner_id=p_owner_id AND id=p_review_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF v_case.state=p_next_state THEN
   RETURN jsonb_build_object('ok',true,'review_id',p_review_id,
     'state',p_next_state,'reused',true,'deployment_authorized',false);
 END IF;
 IF v_case.state IN ('reviewed','blocked') OR
    (v_case.state='submitted' AND p_next_state='reviewed') THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_transition');
 END IF;
 IF (SELECT count(*) FROM public.docker_release_review_events WHERE review_id=p_review_id)>=10 THEN
   RETURN jsonb_build_object('ok',false,'reason','event_limit');
 END IF;
 UPDATE public.docker_release_reviews
 SET state=p_next_state,updated_at=v_now,
   reviewed_at=CASE WHEN p_next_state IN ('reviewed','blocked') THEN v_now ELSE NULL END
 WHERE id=p_review_id AND owner_id=p_owner_id;
 INSERT INTO public.docker_release_review_events(
   review_id,owner_id,event_kind,note,occurred_at
 ) VALUES(p_review_id,p_owner_id,p_next_state,pg_catalog.btrim(p_note),v_now);
 RETURN jsonb_build_object('ok',true,'review_id',p_review_id,
   'state',p_next_state,'reused',false,'deployment_authorized',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_release_decide_review(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_release_decide_review(uuid,uuid,text,text)
 TO service_role;
