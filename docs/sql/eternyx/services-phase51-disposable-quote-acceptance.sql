-- Actual PG17 role tests against the exact Phase51 candidate, disposable only.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
UPDATE public.service_requests SET status='proposal_sent' WHERE id='33333333-3333-4333-8333-333333333333';
SELECT id AS scope FROM public.service_scope_reviews WHERE request_id='33333333-3333-4333-8333-333333333333' LIMIT 1 \gset
SELECT set_config('eternyx.phase51.scope',:'scope',true) \gset
INSERT INTO public.service_quotations(request_id,scope_review_id,author_id,amount_minor,terms,valid_until)
VALUES('33333333-3333-4333-8333-333333333333',:'scope',auth.uid(),12500,'Synthetic quote revision one for testing only; no actual payment or fulfillment.',clock_timestamp()+interval '1 day')
RETURNING id AS first_quote \gset
INSERT INTO public.service_quotations(request_id,scope_review_id,author_id,amount_minor,terms,valid_until)
VALUES('33333333-3333-4333-8333-333333333333',:'scope',auth.uid(),15000,'Synthetic quote revision two for testing only; no actual payment or fulfillment.',clock_timestamp()+interval '1 day')
RETURNING id AS second_quote \gset
SELECT set_config('eternyx.phase51.first',:'first_quote',true) AS first_setting,set_config('eternyx.phase51.second',:'second_quote',true) AS second_setting \gset
DO $t$
BEGIN
 IF (SELECT count(*) FROM public.service_quotation_register WHERE request_id='33333333-3333-4333-8333-333333333333' AND quote_state IN ('superseded','open'))<>2 THEN
  RAISE EXCEPTION 'Phase51 revision lineage missing';
 END IF;
 BEGIN
  INSERT INTO public.service_quote_acceptances(request_id,quotation_id,owner_id,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.second')::uuid,auth.uid(),true);
  RAISE EXCEPTION 'Phase51 admin accepted for customer';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.service_quotations(request_id,scope_review_id,author_id,amount_minor,terms,valid_until)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.scope')::uuid,auth.uid(),-1,'Synthetic invalid negative price must always be rejected.',clock_timestamp()+interval '1 day');
  RAISE EXCEPTION 'Phase51 negative price allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.service_quotations(request_id,scope_review_id,author_id,amount_minor,terms,valid_until)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.scope')::uuid,auth.uid(),1,'Synthetic invalid expired quotation must always be rejected.',clock_timestamp()-interval '1 minute');
  RAISE EXCEPTION 'Phase51 expired quote publication allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $t$
BEGIN
 IF EXISTS(SELECT 1 FROM public.service_quotation_register) OR EXISTS(SELECT 1 FROM public.service_quotations) THEN
  RAISE EXCEPTION 'Phase51 cross-account quote leak';
 END IF;
 BEGIN
  INSERT INTO public.service_quote_acceptances(request_id,quotation_id,owner_id,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.second')::uuid,auth.uid(),true);
  RAISE EXCEPTION 'Phase51 cross-account acceptance allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $t$
BEGIN
 BEGIN
  INSERT INTO public.service_quotations(request_id,scope_review_id,author_id,amount_minor,terms,valid_until)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.scope')::uuid,auth.uid(),1,'Synthetic owner must never publish a commercial quotation.',clock_timestamp()+interval '1 day');
  RAISE EXCEPTION 'Phase51 owner quote publication allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.service_quote_acceptances(request_id,quotation_id,owner_id,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.first')::uuid,auth.uid(),true);
  RAISE EXCEPTION 'Phase51 superseded acceptance allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.service_quote_acceptances(request_id,quotation_id,owner_id,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.second')::uuid,auth.uid(),false);
  RAISE EXCEPTION 'Phase51 unacknowledged acceptance allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.service_quotations SET amount_minor=1 WHERE id=current_setting('eternyx.phase51.second')::uuid;
  RAISE EXCEPTION 'Phase51 quote mutation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
-- Simulate a past expiry under the privileged disposable test operator only.
RESET ROLE;
UPDATE public.service_quotations SET published_at=clock_timestamp()-interval '2 days',valid_until=clock_timestamp()-interval '1 day' WHERE id=:'second_quote';
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.service_quotation_register WHERE id=current_setting('eternyx.phase51.second')::uuid AND quote_state='expired') THEN RAISE EXCEPTION 'Phase51 expiry state missing'; END IF;
 BEGIN
  INSERT INTO public.service_quote_acceptances(request_id,quotation_id,owner_id,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.second')::uuid,auth.uid(),true);
  RAISE EXCEPTION 'Phase51 expired acceptance allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
RESET ROLE;
UPDATE public.service_quotations SET published_at=clock_timestamp(),valid_until=clock_timestamp()+interval '1 day' WHERE id=:'second_quote';
SET LOCAL ROLE authenticated;
INSERT INTO public.service_quote_acceptances(request_id,quotation_id,owner_id,acknowledged)
VALUES('33333333-3333-4333-8333-333333333333',:'second_quote',auth.uid(),true);
DO $t$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.service_quotation_register WHERE id=current_setting('eternyx.phase51.second')::uuid AND quote_state='accepted' AND amount_minor=15000 AND revision=2 AND currency='USD' AND accepted_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Phase51 persisted acceptance missing';
 END IF;
 BEGIN
  INSERT INTO public.service_quote_acceptances(request_id,quotation_id,owner_id,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.second')::uuid,auth.uid(),true);
  RAISE EXCEPTION 'Phase51 duplicate acceptance allowed';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  DELETE FROM public.service_quote_acceptances WHERE quotation_id=current_setting('eternyx.phase51.second')::uuid;
  RAISE EXCEPTION 'Phase51 acceptance deletion allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $t$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.service_quote_acceptances WHERE quotation_id=current_setting('eternyx.phase51.second')::uuid) THEN RAISE EXCEPTION 'Phase51 admin cannot see acceptance'; END IF;
 BEGIN
  INSERT INTO public.service_quotations(request_id,scope_review_id,author_id,amount_minor,terms,valid_until)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase51.scope')::uuid,auth.uid(),1,'Synthetic accepted quote must never be silently superseded.',clock_timestamp()+interval '1 day');
  RAISE EXCEPTION 'Phase51 accepted quote superseded';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.service_requests SET status='in_progress' WHERE id='33333333-3333-4333-8333-333333333333';
  RAISE EXCEPTION 'Phase51 quotation acceptance bypassed delivery gate';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $t$
BEGIN
 BEGIN
  PERFORM 1 FROM public.service_quotation_register;
  RAISE EXCEPTION 'Phase51 anonymous quote read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;
SET LOCAL ROLE services_staging_auditor;
DO $t$
BEGIN
 BEGIN
  PERFORM 1 FROM public.service_quote_acceptances;
  RAISE EXCEPTION 'Phase51 auditor acceptance read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS Phase51 quotation revision, owner acceptance, isolation, expiry, immutability and retained delivery gate';
