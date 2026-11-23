\set ON_ERROR_STOP on
-- Run after original release-review acceptance and the new v2 migration.
-- Both accounts are synthetic and this DB has --network none.
INSERT INTO auth.users(id) VALUES('33333333-3333-4333-8333-333333333333');

DO $lifecycle$
DECLARE
 a uuid:='11111111-1111-4111-8111-111111111111';
 b uuid:='22222222-2222-4222-8222-222222222222';
 c uuid:='33333333-3333-4333-8333-333333333333';
 review uuid;reverse_review uuid;result jsonb;
 note text:='Independent security review is metadata-only and has no execution privileges.';
BEGIN
 SELECT public.docker_release_submit_review(a,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  repeat('a',40),repeat('b',64),repeat('c',64),repeat('d',64),repeat('s',20),note)
 INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Cannot submit fresh review: %',result; END IF;
 review:=(result->>'review_id')::uuid;
 SELECT public.docker_release_decide_review(a,review,'in_review',note) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Cannot start review: %',result; END IF;
 SELECT public.docker_release_decide_review(a,review,'reviewed',note) INTO result;
 IF result->>'reason'<>'independent_reviewer_required' THEN
   RAISE EXCEPTION 'Owner self-approves without second account: %',result;
 END IF;
 SELECT public.docker_release_invite_reviewer(a,review,a,note) INTO result;
 IF result->>'reason'<>'invalid_request' THEN
   RAISE EXCEPTION 'Owner invited self: %',result;
 END IF;
 SELECT public.docker_release_invite_reviewer(b,review,c,note) INTO result;
 IF result->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Nonowner invited reviewer: %',result;
 END IF;
 SELECT public.docker_release_invite_reviewer(a,review,b,note) INTO result;
 IF result->>'ok'<>'true' OR result->>'state'<>'invited' OR
    result->>'deployment_authorized'<>'false' THEN
   RAISE EXCEPTION 'Cannot invite independent reviewer: %',result;
 END IF;
 SELECT public.docker_release_invite_reviewer(a,review,b,note) INTO result;
 IF result->>'reused'<>'true' THEN
   RAISE EXCEPTION 'Duplicate invitation created events: %',result;
 END IF;
 SELECT public.docker_release_invite_reviewer(a,review,c,note) INTO result;
 IF result->>'reason'<>'reviewer_already_assigned' THEN
   RAISE EXCEPTION 'Owner silently changed assigned reviewer: %',result;
 END IF;
 SELECT public.docker_release_respond_reviewer(a,review,repeat('b',64),'accept',note)
 INTO result;
 IF result->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Owner accepted own review: %',result;
 END IF;
 SELECT public.docker_release_respond_reviewer(b,review,repeat('f',64),'accept',note)
 INTO result;
 IF result->>'reason'<>'candidate_mismatch' THEN
   RAISE EXCEPTION 'Wrong release candidate SHA accepted: %',result;
 END IF;
 SELECT public.docker_release_decide_review(a,review,'reviewed',note) INTO result;
 IF result->>'reason'<>'independent_reviewer_required' THEN
   RAISE EXCEPTION 'Owner bypassed invited reviewer consent: %',result;
 END IF;
 SELECT public.docker_release_respond_reviewer(b,review,repeat('b',64),'accept',note)
 INTO result;
 IF result->>'ok'<>'true' OR result->>'state'<>'accepted' OR
    result->>'deployment_authorized'<>'false' THEN
   RAISE EXCEPTION 'Second account could not accept candidate: %',result;
 END IF;
 SELECT public.docker_release_respond_reviewer(b,review,repeat('b',64),'accept',note)
 INTO result;
 IF result->>'reused'<>'true' THEN RAISE EXCEPTION 'Repeated acceptance created event: %',result; END IF;
 SELECT public.docker_release_respond_reviewer(b,review,repeat('b',64),'decline',note)
 INTO result;
 IF result->>'reason'<>'reviewer_finalized' THEN
   RAISE EXCEPTION 'Reviewer rewrote final response: %',result;
 END IF;
 SELECT public.docker_release_decide_review(a,review,'reviewed',note) INTO result;
 IF result->>'ok'<>'true' OR result->>'deployment_authorized'<>'false' THEN
   RAISE EXCEPTION 'Owner review completion did not require accepted reviewer: %',result;
 END IF;
 SELECT public.docker_release_decide_review(b,review,'blocked',note) INTO result;
 IF result->>'reason'<>'not_found' THEN
   RAISE EXCEPTION 'Reviewer could mutate owner release review: %',result;
 END IF;
 IF (SELECT count(*) FROM public.docker_release_review_events WHERE review_id=review)<>5 THEN
   RAISE EXCEPTION 'Expected submit,start,invite,accept,reviewed with no duplicates';
 END IF;
 IF (SELECT actor_id FROM public.docker_release_review_events
     WHERE review_id=review AND event_kind='reviewer_accepted')<>b THEN
   RAISE EXCEPTION 'Review acceptance was attributed to wrong account';
 END IF;

 SELECT public.docker_release_submit_review(b,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   repeat('f',40),repeat('e',64),repeat('d',64),repeat('c',64),repeat('t',20),note)
 INTO result;
 reverse_review:=(result->>'review_id')::uuid;
 SELECT public.docker_release_decide_review(b,reverse_review,'in_review',note) INTO result;
 SELECT public.docker_release_invite_reviewer(b,reverse_review,a,note) INTO result;
 SELECT public.docker_release_respond_reviewer(a,reverse_review,repeat('e',64),'decline',note)
 INTO result;
 IF result->>'state'<>'declined' THEN RAISE EXCEPTION 'Reviewer decline not saved: %',result; END IF;
 SELECT public.docker_release_decide_review(b,reverse_review,'reviewed',note)
 INTO result;
 IF result->>'reason'<>'independent_reviewer_required' THEN
   RAISE EXCEPTION 'Declined reviewer was counted as acceptance: %',result;
 END IF;
 SELECT public.docker_release_decide_review(b,reverse_review,'blocked',note)
 INTO result;
 IF result->>'ok'<>'true' OR result->>'deployment_authorized'<>'false' THEN
   RAISE EXCEPTION 'Blocked review did not terminate safely: %',result;
 END IF;
 RAISE NOTICE 'Independent signer consent, idempotency, immutable review transitions passed';
END;
$lifecycle$;

DO $integrity$
DECLARE
 e record;last_review uuid;previous text;expected text;n integer:=0;
BEGIN
 FOR e IN SELECT * FROM public.docker_release_review_events
  ORDER BY review_id,id LOOP
   IF last_review IS DISTINCT FROM e.review_id THEN
     previous:=repeat('0',64);last_review:=e.review_id;
   END IF;
   expected:=public.docker_release_event_sha256(e.id,e.review_id,e.owner_id,
     e.actor_id,e.event_kind,e.note,e.occurred_at,previous);
   IF e.previous_sha256<>previous OR e.entry_sha256<>expected THEN
      RAISE EXCEPTION 'Release SHA-256 chain invalid at event %',e.id;
   END IF;
   previous:=expected;n:=n+1;
 END LOOP;
 IF n<14 THEN RAISE EXCEPTION 'History migration lost existing or new audit events: %',n; END IF;
END;
$integrity$;

DO $tamper$
DECLARE event_id bigint; blocked boolean:=false;
BEGIN
 SELECT id INTO event_id FROM public.docker_release_review_events LIMIT 1;
 BEGIN
  UPDATE public.docker_release_review_events
   SET note='Database administrator tried to alter this historic event.' WHERE id=event_id;
 EXCEPTION WHEN raise_exception THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Release history allows UPDATE'; END IF;
 blocked:=false;
 BEGIN
  DELETE FROM public.docker_release_review_events WHERE id=event_id;
 EXCEPTION WHEN raise_exception THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Release history allows DELETE'; END IF;
END;
$tamper$;

DO $grants$
BEGIN
 IF has_function_privilege('authenticated',
  'public.docker_release_invite_reviewer(uuid,uuid,uuid,text)','EXECUTE') OR
  has_function_privilege('authenticated',
  'public.docker_release_respond_reviewer(uuid,uuid,text,text,text)','EXECUTE') OR
  has_function_privilege('anon',
  'public.docker_release_invite_reviewer(uuid,uuid,uuid,text)','EXECUTE') OR
  has_function_privilege('anon',
  'public.docker_release_respond_reviewer(uuid,uuid,text,text,text)','EXECUTE') OR
  has_table_privilege('authenticated','public.docker_release_reviewer_assignments','UPDATE') OR
  has_table_privilege('authenticated','public.docker_release_reviewer_assignments','INSERT') OR
  has_table_privilege('authenticated','public.docker_release_review_events','UPDATE') THEN
    RAISE EXCEPTION 'Unauthorized role can mutate reviewer/history';
 END IF;
 IF NOT has_function_privilege('service_role',
  'public.docker_release_invite_reviewer(uuid,uuid,uuid,text)','EXECUTE') OR
  NOT has_function_privilege('service_role',
  'public.docker_release_respond_reviewer(uuid,uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Service-only reviewer RPC is not executable';
 END IF;
END;
$grants$;

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $owner_a$
DECLARE a int;b int;c int;
BEGIN
 SELECT count(*) INTO a FROM public.docker_release_reviewer_assignments WHERE owner_id=
  '11111111-1111-4111-8111-111111111111';
 SELECT count(*) INTO b FROM public.docker_release_reviewer_assignments WHERE reviewer_id=
  '11111111-1111-4111-8111-111111111111';
 SELECT count(*) INTO c FROM public.docker_release_reviews WHERE owner_id=
  '22222222-2222-4222-8222-222222222222';
 IF a<>1 OR b<>1 OR c<>0 THEN
  RAISE EXCEPTION 'A RLS isolation failed owned=% invited=% otherReview=%',a,b,c;
 END IF;
END;
$owner_a$;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $owner_b$
DECLARE a int;b int;c int;
BEGIN
 SELECT count(*) INTO a FROM public.docker_release_reviewer_assignments WHERE owner_id=
  '22222222-2222-4222-8222-222222222222';
 SELECT count(*) INTO b FROM public.docker_release_reviewer_assignments WHERE reviewer_id=
  '22222222-2222-4222-8222-222222222222';
 SELECT count(*) INTO c FROM public.docker_release_review_events WHERE owner_id=
  '11111111-1111-4111-8111-111111111111';
 IF a<>1 OR b<>1 OR c<>0 THEN
  RAISE EXCEPTION 'B RLS isolation failed owned=% invited=% otherOwnerEvents=%',a,b,c;
 END IF;
END;
$owner_b$;
SET request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
DO $nonparticipant$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.docker_release_reviewer_assignments;
 IF n<>0 THEN RAISE EXCEPTION 'Uninvited account sees reviewer assignments'; END IF;
 SELECT count(*) INTO n FROM public.docker_release_reviews;
 IF n<>0 THEN RAISE EXCEPTION 'Uninvited account sees reviews'; END IF;
END;
$nonparticipant$;
RESET ROLE;
RESET request.jwt.claim.sub;
