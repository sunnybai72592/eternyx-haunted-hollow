-- Execute ONLY in the isolated PG17 Phase44 database after fixture seed.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $test$
BEGIN
 IF public.is_admin() OR (SELECT count(*) FROM public.service_requests)<>1
 OR (SELECT count(*) FROM public.service_request_journal WHERE request_id='33333333-3333-4333-8333-333333333333')<6
 OR (SELECT count(*) FROM public.service_request_triage)<>0
 OR (SELECT count(*) FROM public.service_admin_amendment_queue)<>0 THEN
   RAISE EXCEPTION 'Phase47 fixture A authorization or completeness failed';
 END IF;
 IF (SELECT count(*) FROM public.service_scope_reviews)<>1
 OR (SELECT count(*) FROM public.service_scope_responses)<>1
 OR (SELECT count(*) FROM public.service_clarification_questions)<>1
 OR (SELECT count(*) FROM public.service_clarification_answers)<>1
 OR (SELECT count(*) FROM public.service_brief_amendments)<>1 THEN
   RAISE EXCEPTION 'Phase47 fixture A persisted source rows missing';
 END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $test$
BEGIN
 IF public.is_admin() OR (SELECT count(*) FROM public.service_requests)<>1
 OR EXISTS(SELECT 1 FROM public.service_request_journal WHERE request_id='33333333-3333-4333-8333-333333333333')
 OR EXISTS(SELECT 1 FROM public.service_scope_reviews)
 OR EXISTS(SELECT 1 FROM public.service_clarification_answers)
 OR EXISTS(SELECT 1 FROM public.service_brief_amendments) THEN
   RAISE EXCEPTION 'Phase47 fixture B isolation failed';
 END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $test$
BEGIN
 IF NOT public.is_admin() OR (SELECT count(*) FROM public.service_requests)<>2
 OR (SELECT count(*) FROM public.service_request_triage)<>1
 OR (SELECT count(*) FROM public.service_admin_amendment_queue)<>2 THEN
   RAISE EXCEPTION 'Phase47 admin fixture visibility failed';
 END IF;
END $test$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $test$
BEGIN
 IF public.is_admin() THEN RAISE EXCEPTION 'Phase47 anon became admin'; END IF;
 BEGIN
   PERFORM 1 FROM public.service_request_journal LIMIT 1;
   RAISE EXCEPTION 'Phase47 anon journal SELECT allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS Phase47 exact seed candidate with genuine SQL role isolation (not real Auth)';
