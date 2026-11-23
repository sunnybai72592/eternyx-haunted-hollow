\set ON_ERROR_STOP on
-- Real PostgreSQL 17 fixture, two synthetic owners, service-role RPC only.
DO $check$
DECLARE
 owner_a uuid:='11111111-1111-4111-8111-111111111111';
 owner_b uuid:='22222222-2222-4222-8222-222222222222';
 key_a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 key_b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 a_id uuid;b_id uuid;
 result jsonb;note text:='Owner verified local candidate metadata but not remote deployment.';
BEGIN
 SELECT public.docker_release_submit_review(
  owner_a,key_a,repeat('a',40),repeat('b',64),repeat('c',64),
  repeat('d',64),repeat('s',20),note
 ) INTO result;
 IF result->>'ok'<>'true' OR result->>'state'<>'submitted' OR
    result->>'deployment_authorized'<>'false' THEN
  RAISE EXCEPTION 'Owner release submit failed: %',result;
 END IF;
 a_id:=(result->>'review_id')::uuid;
 SELECT public.docker_release_submit_review(
  owner_a,key_a,repeat('a',40),repeat('b',64),repeat('c',64),
  repeat('d',64),repeat('s',20),note
 ) INTO result;
 IF result->>'reused'<>'true' OR (result->>'review_id')::uuid<>a_id THEN
   RAISE EXCEPTION 'Idempotent retry created duplicate: %',result;
 END IF;
 SELECT public.docker_release_submit_review(
  owner_a,key_a,repeat('a',40),repeat('e',64),repeat('c',64),
  repeat('d',64),repeat('s',20),note
 ) INTO result;
 IF result->>'reason'<>'idempotency_conflict' THEN
   RAISE EXCEPTION 'Conflicting evidence reused request key: %',result;
 END IF;
 SELECT public.docker_release_submit_review(
  owner_a,gen_random_uuid(),repeat('a',40),repeat('b',64),repeat('c',64),
  repeat('d',64),repeat('s',20),'short'
 ) INTO result;
 IF result->>'reason'<>'invalid_request' THEN
   RAISE EXCEPTION 'Short review note accepted: %',result;
 END IF;
 SELECT public.docker_release_submit_review(
  owner_b,key_b,repeat('f',40),repeat('e',64),repeat('d',64),
  repeat('c',64),repeat('t',20),note
 ) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Independent owner B submit failed: %',result; END IF;
 b_id:=(result->>'review_id')::uuid;
 SELECT public.docker_release_decide_review(owner_b,a_id,'blocked',note) INTO result;
 IF result->>'reason'<>'not_found' THEN RAISE EXCEPTION 'Owner B wrote A release review: %',result; END IF;
 SELECT public.docker_release_decide_review(owner_a,a_id,'reviewed',note) INTO result;
 IF result->>'reason'<>'invalid_transition' THEN
   RAISE EXCEPTION 'Submitted release bypassed explicit review phase: %',result;
 END IF;
 SELECT public.docker_release_decide_review(owner_a,a_id,'in_review',note) INTO result;
 IF result->>'ok'<>'true' OR result->>'state'<>'in_review' THEN
   RAISE EXCEPTION 'Review phase not saved: %',result;
 END IF;
 SELECT public.docker_release_decide_review(owner_a,a_id,'in_review',note) INTO result;
 IF result->>'reused'<>'true' THEN RAISE EXCEPTION 'Duplicate decision was not idempotent: %',result; END IF;
 SELECT public.docker_release_decide_review(owner_a,a_id,'reviewed',note) INTO result;
 IF result->>'ok'<>'true' OR result->>'deployment_authorized'<>'false' THEN
   RAISE EXCEPTION 'Owner-reviewed decision claimed deployment approval: %',result; END IF;
 SELECT public.docker_release_decide_review(owner_a,a_id,'blocked',note) INTO result;
 IF result->>'reason'<>'invalid_transition' THEN RAISE EXCEPTION 'Terminal review was reopened: %',result; END IF;
 SELECT public.docker_release_decide_review(owner_b,b_id,'blocked',note) INTO result;
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Block decision failed: %',result; END IF;
 IF (SELECT count(*) FROM public.docker_release_review_events WHERE review_id=a_id)<>3 THEN
   RAISE EXCEPTION 'Review events were not appended exactly once'; END IF;
 IF (SELECT count(*) FROM public.docker_release_review_events WHERE review_id=b_id)<>2 THEN
   RAISE EXCEPTION 'Owner B event count inconsistent'; END IF;
 RAISE NOTICE 'Actual Docker release review RPC lifecycle, owner isolation and no-deploy claims passed';
END $check$;

DO $privileges$
BEGIN
 IF has_function_privilege('authenticated',
  'public.docker_release_submit_review(uuid,uuid,text,text,text,text,text,text)','EXECUTE') OR
  has_function_privilege('anon',
  'public.docker_release_submit_review(uuid,uuid,text,text,text,text,text,text)','EXECUTE') OR
  has_function_privilege('authenticated',
  'public.docker_release_decide_review(uuid,uuid,text,text)','EXECUTE') OR
  has_function_privilege('anon',
  'public.docker_release_decide_review(uuid,uuid,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Privileged release review RPC leaked to browser roles';
 END IF;
 IF NOT has_function_privilege('service_role',
  'public.docker_release_submit_review(uuid,uuid,text,text,text,text,text,text)','EXECUTE') OR
  NOT has_function_privilege('service_role',
  'public.docker_release_decide_review(uuid,uuid,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Service-only release review RPC grant missing';
 END IF;
 IF has_table_privilege('authenticated','public.docker_release_reviews','UPDATE') OR
  has_table_privilege('authenticated','public.docker_release_reviews','INSERT') OR
  has_table_privilege('authenticated','public.docker_release_review_events','INSERT') OR
  has_table_privilege('anon','public.docker_release_reviews','SELECT') THEN
  RAISE EXCEPTION 'Browser gained unauthorized release metadata write/read grants';
 END IF;
END $privileges$;

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $owner_a$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.docker_release_reviews;
 IF n<>1 THEN RAISE EXCEPTION 'A sees wrong release review count: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_release_review_events;
 IF n<>3 THEN RAISE EXCEPTION 'A sees wrong release event count: %',n; END IF;
END $owner_a$;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $owner_b$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.docker_release_reviews;
 IF n<>1 THEN RAISE EXCEPTION 'B sees wrong release review count: %',n; END IF;
 SELECT count(*) INTO n FROM public.docker_release_review_events;
 IF n<>2 THEN RAISE EXCEPTION 'B sees wrong release event count: %',n; END IF;
END $owner_b$;
RESET ROLE;
RESET request.jwt.claim.sub;
