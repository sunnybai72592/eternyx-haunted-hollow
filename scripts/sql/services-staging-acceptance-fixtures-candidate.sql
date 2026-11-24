-- REVIEW CANDIDATE ONLY. Not an automatic migration. The operator must
-- verify the registered Eternyx Staging target independently and separately
-- approve this one-time seed. Requires three existing dedicated Auth users.
-- Invoke in psql with -X -1 -v ON_ERROR_STOP=1 and the six fixture variables.
-- Never run on production. No account creation, passwords, or real customer data.
\set ON_ERROR_STOP on
SELECT pg_catalog.set_config('eternyx.services_fixture.a', :'customer_a_id', true) AS fixture_a,
       pg_catalog.set_config('eternyx.services_fixture.b', :'customer_b_id', true) AS fixture_b,
       pg_catalog.set_config('eternyx.services_fixture.admin', :'admin_id', true) AS fixture_admin,
       pg_catalog.set_config('eternyx.services_fixture.request_a', :'request_a_id', true) AS fixture_request_a,
       pg_catalog.set_config('eternyx.services_fixture.request_b', :'request_b_id', true) AS fixture_request_b,
       pg_catalog.set_config('eternyx.services_fixture.approval', :'fixture_approval', true) AS fixture_approval
\gset
DO $seed$
DECLARE
 a uuid := pg_catalog.current_setting('eternyx.services_fixture.a')::uuid;
 b uuid := pg_catalog.current_setting('eternyx.services_fixture.b')::uuid;
 adm uuid := pg_catalog.current_setting('eternyx.services_fixture.admin')::uuid;
 ra uuid := pg_catalog.current_setting('eternyx.services_fixture.request_a')::uuid;
 rb uuid := pg_catalog.current_setting('eternyx.services_fixture.request_b')::uuid;
 review_id uuid;
 question_id uuid;
BEGIN
 IF pg_catalog.current_setting('eternyx.services_fixture.approval') <> 'SEED_DEDICATED_SERVICES_STAGING_FIXTURES' THEN
   RAISE EXCEPTION 'Services fixture approval missing';
 END IF;
 IF a=b OR a=adm OR b=adm OR ra=rb THEN
   RAISE EXCEPTION 'Services fixture identities and requests must be distinct';
 END IF;
 -- Lock only the scoped tables; refuse any preexisting business records or
 -- assignments instead of overwriting, recycling or deleting them.
 LOCK TABLE public.admin_users, public.service_requests IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM public.admin_users) OR EXISTS(SELECT 1 FROM public.service_requests) THEN
   RAISE EXCEPTION 'Services fixture target is not empty; stop and review';
 END IF;
 IF (SELECT count(*) FROM auth.users WHERE id IN (a,b,adm))<>3
    OR (SELECT count(*) FROM auth.users)<>3 THEN
   RAISE EXCEPTION 'Exactly three dedicated staging Auth users are required';
 END IF;
 INSERT INTO public.admin_users(user_id) VALUES (adm);
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
 INSERT INTO public.service_requests(id,user_id,service_key,title,description,contact_email,authorization_understood)
 VALUES(ra,a,'security-review','Staging acceptance fixture A',
 'Synthetic Services acceptance request; no real customer work or delivery commitment.',
 'services-a@invalid.example',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
 INSERT INTO public.service_requests(id,user_id,service_key,title,description,contact_email,authorization_understood)
 VALUES(rb,b,'security-review','Staging acceptance fixture B',
 'Synthetic Services acceptance request; no real customer work or delivery commitment.',
 'services-b@invalid.example',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',adm::text,true);
 INSERT INTO public.service_request_triage(request_id,assigned_admin_id,internal_note)
 VALUES(ra,adm,'Synthetic private triage; must never appear in participant journal.');
 INSERT INTO public.service_scope_reviews(request_id,author_id,scope_summary,deliverables,exclusions,assumptions,next_steps)
 VALUES(ra,adm,'Synthetic scope review for the dedicated staging acceptance scenario only.',
 'One synthetic review deliverable for acceptance testing.',
 'No real delivery or paid services.','Synthetic test environment only.','Verify owner and administrator isolation.')
 RETURNING id INTO review_id;
 INSERT INTO public.service_clarification_questions(request_id,author_id,prompt)
 VALUES(ra,adm,'Synthetic question for verifying the owner clarification response.')
 RETURNING id INTO question_id;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
 INSERT INTO public.service_scope_responses(review_id,user_id,kind,note)
 VALUES(review_id,a,'ready_to_discuss','Synthetic nonbinding owner response.');
 INSERT INTO public.service_clarification_answers(question_id,author_id,answer)
 VALUES(question_id,a,'Synthetic owner clarification answer.');
 INSERT INTO public.service_brief_amendments(request_id,author_id,category,summary,details)
 VALUES(ra,a,'requirements','Synthetic revised scope','Synthetic owner amendment for journal provenance and cross-customer isolation.');
 -- The journal has an explicit auth.uid()/is_admin() predicate, even
 -- when queried by the table owner. Verify it as the dedicated approved
 -- admin, NOT as a cleared identity. Never weaken the journal predicate.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',adm::text,true);
 IF NOT public.is_admin() THEN
   RAISE EXCEPTION 'Services fixture administrator identity verification failed';
 END IF;
 IF (SELECT count(*) FROM public.service_requests WHERE id IN (ra,rb))<>2
 OR NOT EXISTS(SELECT 1 FROM public.service_request_activity WHERE request_id=ra AND actor_id=a AND event_type='request_created')
 OR NOT EXISTS(SELECT 1 FROM public.service_request_activity WHERE request_id=rb AND actor_id=b AND event_type='request_created')
 OR NOT EXISTS(SELECT 1 FROM public.service_request_triage WHERE request_id=ra AND assigned_admin_id=adm)
 OR (SELECT count(*) FROM public.admin_users)<>1 THEN
   RAISE EXCEPTION 'Services fixture source completeness failure';
 END IF;
 -- Require each distinct persisted event, rather than allowing unrelated
 -- events to satisfy a total count. These checks retain the view's real
 -- participant predicate, with real owner/admin roles tested again in CI.
 IF (SELECT count(DISTINCT event_kind) FROM public.service_request_journal
     WHERE request_id=ra AND event_kind IN ('request_created','scope_published','scope_response','question_published','answer_submitted','amendment_submitted'))<>6
 OR (SELECT count(*) FROM public.service_request_journal WHERE request_id=ra)<>6
 OR (SELECT count(*) FROM public.service_request_journal WHERE request_id=rb AND event_kind='request_created')<>1
 OR (SELECT count(*) FROM public.service_request_journal WHERE request_id=rb)<>1 THEN
   RAISE EXCEPTION 'Services fixture journal completeness failure';
 END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','',true);
 IF EXISTS(SELECT 1 FROM public.service_request_journal WHERE request_id IN (ra,rb)) THEN
   RAISE EXCEPTION 'Services fixture journal exposed rows to cleared identity';
 END IF;
END
$seed$;
SELECT 'PASS: dedicated staging fixture data seeded; real Auth acceptance still required';
