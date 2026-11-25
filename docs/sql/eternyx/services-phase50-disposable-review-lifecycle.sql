-- Disposable Phase44 database ONLY after Phase48 and Phase47 fixtures.
-- Real SQL roles, existing migrations, rollback. Not JWT/HTTP acceptance.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.service_requests(user_id,service_key,title,description,contact_email,authorization_understood)
VALUES(auth.uid(),'security-review','Synthetic Phase50 lifecycle','Synthetic review journey; no actual delivery or purchase is authorized.','services@invalid.example',true)
RETURNING id AS req \gset
SELECT set_config('eternyx.phase50.request',:'req',true) \gset
DO $guard$
DECLARE n integer;
BEGIN
 UPDATE public.service_requests SET status='reviewing' WHERE id=current_setting('eternyx.phase50.request')::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Phase50 customer changed status'; END IF;
END $guard$;
INSERT INTO public.service_request_activity(request_id,actor_id,event_type,body)
VALUES(:'req',auth.uid(),'message','Synthetic customer discussion.');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.service_requests WHERE id=current_setting('eternyx.phase50.request')::uuid) THEN
  RAISE EXCEPTION 'Phase50 cross-customer request leaked';
 END IF;
END $guard$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $guard$
BEGIN
 BEGIN
  UPDATE public.service_requests SET status='proposal_sent' WHERE id=current_setting('eternyx.phase50.request')::uuid;
  RAISE EXCEPTION 'Phase50 proposal without scope accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $guard$;
UPDATE public.service_requests SET status='reviewing' WHERE id=:'req';
INSERT INTO public.service_request_triage(request_id,assigned_admin_id,internal_note)
VALUES(:'req',auth.uid(),'Synthetic private triage');
INSERT INTO public.service_request_activity(request_id,actor_id,event_type,body)
VALUES(:'req',auth.uid(),'message','Synthetic administrator response.');
UPDATE public.service_requests SET status='more_info' WHERE id=:'req';
INSERT INTO public.service_clarification_questions(request_id,author_id,prompt)
VALUES(:'req',auth.uid(),'Synthetic question about the scope.') RETURNING id AS question \gset
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.service_clarification_answers(question_id,author_id,answer)
VALUES(:'question',auth.uid(),'Synthetic customer response.');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
UPDATE public.service_clarification_questions SET state='closed' WHERE id=:'question';
INSERT INTO public.service_scope_reviews(request_id,author_id,scope_summary,deliverables,exclusions,assumptions,next_steps)
VALUES(:'req',auth.uid(),'Synthetic nonbinding scope review for staging acceptance only.','Synthetic review deliverable.','No paid work.','Test only assumptions.','Review owner feedback.') RETURNING id AS review \gset
UPDATE public.service_requests SET status='proposal_sent' WHERE id=:'req';
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.service_scope_responses(review_id,user_id,kind,note)
VALUES(:'review',auth.uid(),'ready_to_discuss','Synthetic nonbinding response.');
INSERT INTO public.service_brief_amendments(request_id,author_id,category,summary,details)
VALUES(:'req',auth.uid(),'requirements','Synthetic amended scope','Synthetic amendment for the complete review lifecycle.') RETURNING id AS amendment \gset
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
UPDATE public.service_brief_amendments SET status='reviewed' WHERE id=:'amendment';
DO $guard$
DECLARE next_status text;
BEGIN
 FOREACH next_status IN ARRAY ARRAY['in_progress','completed'] LOOP
  BEGIN
   UPDATE public.service_requests SET status=next_status WHERE id=current_setting('eternyx.phase50.request')::uuid;
   RAISE EXCEPTION 'Phase50 unauthorized delivery accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;
END $guard$;
UPDATE public.service_requests SET status='declined' WHERE id=:'req';
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT public.mark_service_request_checked(:'req');
DO $check$
DECLARE r uuid:=current_setting('eternyx.phase50.request')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.service_requests WHERE id=r AND status='declined')
 OR (SELECT count(DISTINCT event_kind) FROM public.service_request_journal WHERE request_id=r AND event_kind IN ('request_created','message','status_changed','question_published','answer_submitted','question_closed','scope_published','scope_response','amendment_submitted','amendment_reviewed'))<>10
 OR EXISTS(SELECT 1 FROM public.service_request_triage WHERE request_id=r)
 THEN RAISE EXCEPTION 'Phase50 lifecycle or privacy incomplete'; END IF;
END $check$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS Phase50 synthetic SQL-role review lifecycle, terminal resolution, delivery denial and journal';
