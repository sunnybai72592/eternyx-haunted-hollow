-- Owner/reviewer separation and SHA-256 linked release metadata event history.
-- This is tamper-evident for exported observations, not immutable against DB admins.
-- No operational Docker or production deployment privilege is created.
CREATE TABLE public.docker_release_reviewer_assignments (
 review_id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 candidate_sha256 text NOT NULL CHECK(candidate_sha256 ~ '^[a-f0-9]{64}$'),
 commit_sha text NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40}$'),
 state text NOT NULL DEFAULT 'invited'
   CHECK (state IN ('invited','accepted','declined')),
 invited_at timestamptz NOT NULL DEFAULT now(),
 responded_at timestamptz,
 reviewer_note text,
 CHECK (owner_id<>reviewer_id),
 CHECK ((state='invited' AND responded_at IS NULL AND reviewer_note IS NULL) OR
        (state IN ('accepted','declined') AND responded_at IS NOT NULL
        AND char_length(reviewer_note) BETWEEN 12 AND 500
        AND reviewer_note !~ '[[:cntrl:]]')),
 FOREIGN KEY(review_id,owner_id)
   REFERENCES public.docker_release_reviews(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX docker_release_reviewer_assignments_reviewers
 ON public.docker_release_reviewer_assignments(reviewer_id,invited_at DESC);
ALTER TABLE public.docker_release_reviewer_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docker_release_reviewer_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.docker_release_reviewer_assignments TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.docker_release_reviewer_assignments TO service_role;
CREATE POLICY "Docker release reviewer invitees and owners read only"
 ON public.docker_release_reviewer_assignments FOR SELECT TO authenticated
 USING ((SELECT auth.uid())=owner_id OR (SELECT auth.uid())=reviewer_id);

-- Backfill old events before attaching no-update/no-delete trigger. Hash binds the
-- per-review predecessor, global event ID, actor, event type, UTC timestamp and note.
ALTER TABLE public.docker_release_review_events ADD COLUMN actor_id uuid;
ALTER TABLE public.docker_release_review_events ADD COLUMN previous_sha256 text;
ALTER TABLE public.docker_release_review_events ADD COLUMN entry_sha256 text;
UPDATE public.docker_release_review_events SET actor_id=owner_id;

CREATE FUNCTION public.docker_release_event_sha256(
 p_id bigint,p_review_id uuid,p_owner_id uuid,p_actor_id uuid,
 p_kind text,p_note text,p_at timestamptz,p_previous text
) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $digest$
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   'ETERNYX_DOCKER_RELEASE_EVENT_V1|'||p_id::text||'|'||
   p_review_id::text||'|'||p_owner_id::text||'|'||p_actor_id::text||'|'||
   p_kind||'|'||
   pg_catalog.to_char(p_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||
   '|'||pg_catalog.encode(pg_catalog.convert_to(p_note,'UTF8'),'hex')||
   '|'||p_previous,'UTF8')),'hex')
$digest$;
REVOKE ALL ON FUNCTION public.docker_release_event_sha256(bigint,uuid,uuid,uuid,text,text,timestamptz,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_release_event_sha256(bigint,uuid,uuid,uuid,text,text,timestamptz,text)
 TO service_role;

DO $backfill$
DECLARE e record; current_review uuid; previous text; current_hash text;
BEGIN
 FOR e IN SELECT id,review_id,owner_id,actor_id,event_kind,note,occurred_at
          FROM public.docker_release_review_events ORDER BY review_id,id LOOP
   IF current_review IS DISTINCT FROM e.review_id THEN
     previous:=repeat('0',64);current_review:=e.review_id;
   END IF;
   current_hash:=public.docker_release_event_sha256(
     e.id,e.review_id,e.owner_id,e.actor_id,e.event_kind,
     e.note,e.occurred_at,previous);
   UPDATE public.docker_release_review_events
      SET previous_sha256=previous,entry_sha256=current_hash WHERE id=e.id;
   previous:=current_hash;
 END LOOP;
END;
$backfill$;
ALTER TABLE public.docker_release_review_events
 ALTER COLUMN actor_id SET NOT NULL,
 ALTER COLUMN previous_sha256 SET NOT NULL,
 ALTER COLUMN entry_sha256 SET NOT NULL;
ALTER TABLE public.docker_release_review_events
 ADD CONSTRAINT docker_release_event_previous_hash_shape
 CHECK (previous_sha256 ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT docker_release_event_entry_hash_shape
 CHECK (entry_sha256 ~ '^[a-f0-9]{64}$');
ALTER TABLE public.docker_release_review_events
 DROP CONSTRAINT docker_release_review_events_event_kind_check;
ALTER TABLE public.docker_release_review_events
 ADD CONSTRAINT docker_release_review_events_event_kind_check
 CHECK (event_kind IN ('submitted','in_review','reviewed','blocked',
  'reviewer_invited','reviewer_accepted','reviewer_declined'));

CREATE FUNCTION public.docker_release_event_before_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE prev text;
BEGIN
 IF NEW.actor_id IS NULL THEN NEW.actor_id:=NEW.owner_id; END IF;
 SELECT entry_sha256 INTO prev FROM public.docker_release_review_events
 WHERE review_id=NEW.review_id ORDER BY id DESC LIMIT 1;
 NEW.previous_sha256:=COALESCE(prev,repeat('0',64));
 NEW.entry_sha256:=public.docker_release_event_sha256(
  NEW.id,NEW.review_id,NEW.owner_id,NEW.actor_id,
  NEW.event_kind,NEW.note,NEW.occurred_at,NEW.previous_sha256);
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER docker_release_history_compute_hash
 BEFORE INSERT ON public.docker_release_review_events
 FOR EACH ROW EXECUTE FUNCTION public.docker_release_event_before_insert();

CREATE FUNCTION public.docker_release_event_prevent_mutation()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 RAISE EXCEPTION 'Docker release history events cannot be modified by the application';
END;
$fn$;
CREATE TRIGGER docker_release_history_no_updates
 BEFORE UPDATE OR DELETE ON public.docker_release_review_events
 FOR EACH ROW EXECUTE FUNCTION public.docker_release_event_prevent_mutation();

CREATE FUNCTION public.docker_release_invite_reviewer(
 p_owner_id uuid,p_review_id uuid,p_reviewer_id uuid,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_review public.docker_release_reviews%ROWTYPE;
 v_assignment public.docker_release_reviewer_assignments%ROWTYPE;
 v_at timestamptz:=pg_catalog.statement_timestamp();
BEGIN
 IF p_owner_id IS NULL OR p_review_id IS NULL OR p_reviewer_id IS NULL OR
    p_owner_id=p_reviewer_id OR
    p_note IS NULL OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 12 AND 500 OR
    p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261124,pg_catalog.hashtext(p_owner_id::text));
 SELECT * INTO v_review FROM public.docker_release_reviews
  WHERE id=p_review_id AND owner_id=p_owner_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 IF v_review.state<>'in_review' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_transition');
 END IF;
 SELECT * INTO v_assignment FROM public.docker_release_reviewer_assignments
  WHERE review_id=p_review_id FOR UPDATE;
 IF FOUND THEN
   IF v_assignment.reviewer_id=p_reviewer_id THEN
     RETURN jsonb_build_object('ok',true,'review_id',p_review_id,
      'state',v_assignment.state,'reused',true,'deployment_authorized',false);
   END IF;
   RETURN jsonb_build_object('ok',false,'reason','reviewer_already_assigned');
 END IF;
 INSERT INTO public.docker_release_reviewer_assignments(
  review_id,owner_id,reviewer_id,commit_sha,candidate_sha256,invited_at
 ) VALUES(p_review_id,p_owner_id,p_reviewer_id,
  v_review.commit_sha,v_review.candidate_sha256,v_at);
 INSERT INTO public.docker_release_review_events(
  review_id,owner_id,actor_id,event_kind,note,occurred_at
 ) VALUES(p_review_id,p_owner_id,p_owner_id,
  'reviewer_invited',pg_catalog.btrim(p_note),v_at);
 RETURN jsonb_build_object('ok',true,'review_id',p_review_id,'state','invited',
  'reused',false,'deployment_authorized',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_release_invite_reviewer(uuid,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_release_invite_reviewer(uuid,uuid,uuid,text)
 TO service_role;

CREATE FUNCTION public.docker_release_respond_reviewer(
 p_reviewer_id uuid,p_review_id uuid,p_candidate_sha256 text,
 p_decision text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
 v_assignment public.docker_release_reviewer_assignments%ROWTYPE;
 v_review public.docker_release_reviews%ROWTYPE;
 v_at timestamptz:=pg_catalog.statement_timestamp();
 v_next text;
BEGIN
 IF p_reviewer_id IS NULL OR p_review_id IS NULL OR
    p_candidate_sha256 IS NULL OR p_candidate_sha256 !~ '^[a-f0-9]{64}$' OR
    p_decision IS NULL OR p_decision NOT IN ('accept','decline') OR
    p_note IS NULL OR char_length(pg_catalog.btrim(p_note)) NOT BETWEEN 12 AND 500 OR
    p_note ~ '[[:cntrl:]]' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_request');
 END IF;
 SELECT owner_id INTO v_assignment.owner_id
  FROM public.docker_release_reviewer_assignments
  WHERE review_id=p_review_id AND reviewer_id=p_reviewer_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261124,
   pg_catalog.hashtext(v_assignment.owner_id::text));
 SELECT * INTO v_assignment FROM public.docker_release_reviewer_assignments
  WHERE review_id=p_review_id AND reviewer_id=p_reviewer_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
 SELECT * INTO v_review FROM public.docker_release_reviews
  WHERE id=p_review_id AND owner_id=v_assignment.owner_id FOR UPDATE;
 IF NOT FOUND OR v_review.state<>'in_review' THEN
   RETURN jsonb_build_object('ok',false,'reason','invalid_transition');
 END IF;
 IF v_assignment.reviewer_id=v_assignment.owner_id OR
    v_assignment.candidate_sha256<>p_candidate_sha256 OR
    v_review.candidate_sha256<>p_candidate_sha256 THEN
   RETURN jsonb_build_object('ok',false,'reason','candidate_mismatch');
 END IF;
 v_next:=CASE WHEN p_decision='accept' THEN 'accepted' ELSE 'declined' END;
 IF v_assignment.state=v_next THEN
   RETURN jsonb_build_object('ok',true,'review_id',p_review_id,
    'state',v_next,'reused',true,'deployment_authorized',false);
 END IF;
 IF v_assignment.state<>'invited' THEN
   RETURN jsonb_build_object('ok',false,'reason','reviewer_finalized');
 END IF;
 UPDATE public.docker_release_reviewer_assignments SET state=v_next,
  reviewer_note=pg_catalog.btrim(p_note),responded_at=v_at WHERE review_id=p_review_id;
 INSERT INTO public.docker_release_review_events(
  review_id,owner_id,actor_id,event_kind,note,occurred_at
 ) VALUES(p_review_id,v_assignment.owner_id,p_reviewer_id,
  CASE WHEN v_next='accepted' THEN 'reviewer_accepted' ELSE 'reviewer_declined' END,
  pg_catalog.btrim(p_note),v_at);
 RETURN jsonb_build_object('ok',true,'review_id',p_review_id,'state',v_next,
  'reused',false,'deployment_authorized',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.docker_release_respond_reviewer(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.docker_release_respond_reviewer(uuid,uuid,text,text,text)
 TO service_role;

-- Keep original owner-scoped lock, state and quota protections, with new
-- distinct-reviewer acceptance requirement before an owner can mark reviewed.

CREATE OR REPLACE FUNCTION public.docker_release_decide_review(
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
 IF p_next_state='reviewed' AND NOT EXISTS (
   SELECT 1 FROM public.docker_release_reviewer_assignments a
   WHERE a.review_id=p_review_id AND a.owner_id=p_owner_id AND
         a.reviewer_id<>p_owner_id AND
         a.candidate_sha256=v_case.candidate_sha256 AND a.state='accepted'
 ) THEN
   RETURN jsonb_build_object('ok',false,'reason','independent_reviewer_required');
 END IF;
 IF (SELECT count(*) FROM public.docker_release_review_events WHERE review_id=p_review_id)>=12 THEN
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
