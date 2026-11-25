-- Real PG17 SQL role tests. All records rollback. No hosted Auth or payments.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
UPDATE public.service_requests SET status='proposal_sent' WHERE id='33333333-3333-4333-8333-333333333333';
SELECT id AS scope FROM public.service_scope_reviews WHERE request_id='33333333-3333-4333-8333-333333333333' LIMIT 1 \gset
INSERT INTO public.service_quotations(request_id,scope_review_id,author_id,amount_minor,terms,valid_until)
VALUES('33333333-3333-4333-8333-333333333333',:'scope',auth.uid(),20000,'Synthetic quotation for planning acceptance; no real work is authorized.',clock_timestamp()+interval '1 day')
RETURNING id AS quote \gset
DO $t$
BEGIN
 BEGIN
  INSERT INTO public.service_order_plans(request_id,acceptance_id,prepared_by,plan_summary)
  VALUES('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',auth.uid(),'Synthetic unauthorized preparation must be denied before quotation acceptance.');
  RAISE EXCEPTION 'Phase52 unaccepted order created';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.service_quote_acceptances(request_id,quotation_id,owner_id,acknowledged)
VALUES('33333333-3333-4333-8333-333333333333',:'quote',auth.uid(),true) RETURNING id AS accepted \gset
SELECT set_config('eternyx.phase52.accepted',:'accepted',true) \gset
DO $t$
BEGIN
 BEGIN
  INSERT INTO public.service_order_plans(request_id,acceptance_id,prepared_by,plan_summary)
  VALUES('33333333-3333-4333-8333-333333333333',current_setting('eternyx.phase52.accepted')::uuid,auth.uid(),'Synthetic customer cannot create administrator order plans.');
  RAISE EXCEPTION 'Phase52 customer prepared order';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO public.service_order_plans(request_id,acceptance_id,prepared_by,plan_summary)
VALUES('33333333-3333-4333-8333-333333333333',:'accepted',auth.uid(),'Synthetic order preparation only; no payment or delivery is verified.');
DO $t$
BEGIN
 BEGIN
  INSERT INTO public.service_order_plans(request_id,acceptance_id,prepared_by,plan_summary)
  VALUES('44444444-4444-4444-8444-444444444444',current_setting('eternyx.phase52.accepted')::uuid,auth.uid(),'Synthetic cross-request acceptance must never create an order plan.');
  RAISE EXCEPTION 'Phase52 cross-request order created';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $t$
BEGIN
 BEGIN
  INSERT INTO public.service_order_plan_acknowledgements(request_id,owner_id,milestone_count,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),1,true);
  RAISE EXCEPTION 'Phase52 empty plan acknowledged';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.service_order_milestones(request_id,author_id,title,acceptance_criteria)
  VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),'Forged milestone','Synthetic criteria for unauthorized milestone creation.');
  RAISE EXCEPTION 'Phase52 customer added milestone';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO public.service_order_milestones(request_id,author_id,title,acceptance_criteria)
VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),'Discovery plan','Synthetic criteria for discovery planning only.'),
('33333333-3333-4333-8333-333333333333',auth.uid(),'Delivery plan','Synthetic criteria for a future deliverable only.');
DO $t$
BEGIN
 IF (SELECT array_agg(position ORDER BY position) FROM public.service_order_milestones WHERE request_id='33333333-3333-4333-8333-333333333333') IS DISTINCT FROM ARRAY[1,2] THEN RAISE EXCEPTION 'Phase52 milestone numbering wrong'; END IF;
 BEGIN
  INSERT INTO public.service_order_plan_acknowledgements(request_id,owner_id,milestone_count,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),2,true);
  RAISE EXCEPTION 'Phase52 admin impersonated owner acknowledgement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $t$
BEGIN
 IF EXISTS(SELECT 1 FROM public.service_order_plan_register) OR EXISTS(SELECT 1 FROM public.service_order_milestones) THEN RAISE EXCEPTION 'Phase52 cross-account plan leak'; END IF;
 BEGIN
  INSERT INTO public.service_order_plan_acknowledgements(request_id,owner_id,milestone_count,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),2,true);
  RAISE EXCEPTION 'Phase52 cross-account acknowledgement allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $t$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.service_order_plan_register WHERE request_id='33333333-3333-4333-8333-333333333333' AND plan_state='planning' AND amount_minor=20000 AND milestone_count=2) THEN RAISE EXCEPTION 'Phase52 owner plan lineage missing'; END IF;
 BEGIN
  INSERT INTO public.service_order_plan_acknowledgements(request_id,owner_id,milestone_count,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),1,true);
  RAISE EXCEPTION 'Phase52 stale milestone count accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.service_order_plan_acknowledgements(request_id,owner_id,milestone_count,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),2,false);
  RAISE EXCEPTION 'Phase52 consent missing but accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
INSERT INTO public.service_order_plan_acknowledgements(request_id,owner_id,milestone_count,acknowledged)
VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),2,true);
DO $t$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.service_order_plan_register WHERE request_id='33333333-3333-4333-8333-333333333333' AND plan_state='awaiting_payment_verification' AND acknowledged_at IS NOT NULL) THEN RAISE EXCEPTION 'Phase52 acknowledgement missing'; END IF;
 BEGIN
  INSERT INTO public.service_order_plan_acknowledgements(request_id,owner_id,milestone_count,acknowledged)
  VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),2,true);
  RAISE EXCEPTION 'Phase52 duplicate acknowledgement allowed';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $t$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $t$
BEGIN
 BEGIN
  INSERT INTO public.service_order_milestones(request_id,author_id,title,acceptance_criteria)
  VALUES('33333333-3333-4333-8333-333333333333',auth.uid(),'Extra milestone','Synthetic post-acknowledgement addition must fail.');
  RAISE EXCEPTION 'Phase52 acknowledged plan extended';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.service_order_milestones SET title='Changed title' WHERE request_id='33333333-3333-4333-8333-333333333333';
  RAISE EXCEPTION 'Phase52 milestone mutated';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  DELETE FROM public.service_order_plan_acknowledgements WHERE request_id='33333333-3333-4333-8333-333333333333';
  RAISE EXCEPTION 'Phase52 acknowledgement erased';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.service_requests SET status='in_progress' WHERE id='33333333-3333-4333-8333-333333333333';
  RAISE EXCEPTION 'Phase52 plan bypassed delivery gate';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
UPDATE public.service_requests SET status='declined' WHERE id='33333333-3333-4333-8333-333333333333';
DO $t$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.service_order_plan_register WHERE request_id='33333333-3333-4333-8333-333333333333' AND plan_state='closed') THEN RAISE EXCEPTION 'Phase52 closure not reflected'; END IF;
 BEGIN
  UPDATE public.service_requests SET status='proposal_sent' WHERE id='33333333-3333-4333-8333-333333333333';
  RAISE EXCEPTION 'Phase52 closed plan reopened';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $t$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $t$
BEGIN
 BEGIN
  PERFORM 1 FROM public.service_order_plan_register;
  RAISE EXCEPTION 'Phase52 anonymous plan read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;
SET LOCAL ROLE services_staging_auditor;
DO $t$
BEGIN
 BEGIN
  PERFORM 1 FROM public.service_order_plan_acknowledgements;
  RAISE EXCEPTION 'Phase52 auditor plan read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS Phase52 accepted-quote order plan, milestone numbering, exact owner acknowledgement, frozen scope, privacy and delivery denial';
