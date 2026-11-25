-- Phase52 review candidate, not an automatic migration.
-- Requires Phase51 candidate. Records preparation only, never actual work,
-- payment verification or delivery. No customer/admin may initiate fulfillment.
CREATE TABLE public.service_order_plans (
 request_id uuid PRIMARY KEY REFERENCES public.service_requests(id) ON DELETE RESTRICT,
 acceptance_id uuid NOT NULL UNIQUE REFERENCES public.service_quote_acceptances(id) ON DELETE RESTRICT,
 prepared_by uuid NOT NULL REFERENCES auth.users(id),
 plan_summary text NOT NULL CHECK(char_length(btrim(plan_summary)) BETWEEN 40 AND 2500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.service_order_milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.service_order_plans(request_id) ON DELETE RESTRICT,
 author_id uuid NOT NULL REFERENCES auth.users(id),
 position integer NOT NULL CHECK(position BETWEEN 1 AND 20),
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 8 AND 120),
 acceptance_criteria text NOT NULL CHECK(char_length(btrim(acceptance_criteria)) BETWEEN 20 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id,position)
);
CREATE TABLE public.service_order_plan_acknowledgements (
 request_id uuid PRIMARY KEY REFERENCES public.service_order_plans(request_id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 milestone_count integer NOT NULL CHECK(milestone_count BETWEEN 1 AND 20),
 acknowledged boolean NOT NULL CHECK(acknowledged),
 acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.service_order_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_plan_acknowledgements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_order_plans,public.service_order_milestones,public.service_order_plan_acknowledgements FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.service_order_plans,public.service_order_milestones,public.service_order_plan_acknowledgements TO authenticated;
GRANT INSERT(request_id,acceptance_id,prepared_by,plan_summary) ON public.service_order_plans TO authenticated;
GRANT INSERT(request_id,author_id,title,acceptance_criteria) ON public.service_order_milestones TO authenticated;
GRANT INSERT(request_id,owner_id,milestone_count,acknowledged) ON public.service_order_plan_acknowledgements TO authenticated;
CREATE POLICY service_order_plan_participant_read ON public.service_order_plans FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id AND (r.user_id=(SELECT auth.uid()) OR (SELECT public.is_admin()))));
CREATE POLICY service_order_plan_admin_prepare ON public.service_order_plans FOR INSERT TO authenticated
 WITH CHECK(prepared_by=(SELECT auth.uid()) AND (SELECT public.is_admin()) AND EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id));
CREATE POLICY service_order_milestone_participant_read ON public.service_order_milestones FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id AND (r.user_id=(SELECT auth.uid()) OR (SELECT public.is_admin()))));
CREATE POLICY service_order_milestone_admin_prepare ON public.service_order_milestones FOR INSERT TO authenticated
 WITH CHECK(author_id=(SELECT auth.uid()) AND (SELECT public.is_admin()) AND EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id));
CREATE POLICY service_order_ack_participant_read ON public.service_order_plan_acknowledgements FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id AND (r.user_id=(SELECT auth.uid()) OR (SELECT public.is_admin()))));
CREATE POLICY service_order_ack_owner_insert ON public.service_order_plan_acknowledgements FOR INSERT TO authenticated
 WITH CHECK(owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id AND r.user_id=(SELECT auth.uid())));
-- Same lock as Phase51; status changes into/out of proposal_sent participate
-- as well, preventing a close/accept/prepare race. No status is newly enabled.
CREATE FUNCTION eternyx_private.serialize_service_commercial_status()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status='proposal_sent' OR OLD.status='proposal_sent') THEN
  IF current_setting('transaction_isolation')<>'read committed' THEN
   RAISE EXCEPTION 'Commercial state requires read committed isolation' USING ERRCODE='25000';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('services-commercial-quote:'||OLD.id::text,0));
  -- A confirmed or unconfirmed plan is historical evidence, not reusable
  -- permission after closing. Cancellation must be implemented separately.
  IF NEW.status='proposal_sent' AND EXISTS(SELECT 1 FROM public.service_order_plans p WHERE p.request_id=OLD.id) THEN
   RAISE EXCEPTION 'Closed order plan cannot be reopened' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION eternyx_private.serialize_service_commercial_status() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_commercial_status_serialize BEFORE UPDATE OF status ON public.service_requests
 FOR EACH ROW EXECUTE FUNCTION eternyx_private.serialize_service_commercial_status();
CREATE FUNCTION eternyx_private.guard_service_order_plan()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NEW.prepared_by IS DISTINCT FROM auth.uid() OR NOT public.is_admin() THEN
  RAISE EXCEPTION 'Only a verified administrator may prepare an order plan' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Order planning requires read committed isolation' USING ERRCODE='25000';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('services-commercial-quote:'||NEW.request_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.service_requests r JOIN public.service_quote_acceptances a ON a.request_id=r.id AND a.owner_id=r.user_id
  WHERE r.id=NEW.request_id AND r.status='proposal_sent' AND a.id=NEW.acceptance_id AND a.acknowledged) THEN
  RAISE EXCEPTION 'Order plan requires the accepted quotation on this open request' USING ERRCODE='23514';
 END IF;
 NEW.created_at:=clock_timestamp();
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION eternyx_private.guard_service_order_plan() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_order_plan_guard BEFORE INSERT ON public.service_order_plans
 FOR EACH ROW EXECUTE FUNCTION eternyx_private.guard_service_order_plan();
CREATE FUNCTION eternyx_private.guard_service_order_milestone()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE next_position integer;
BEGIN
 IF auth.uid() IS NULL OR NEW.author_id IS DISTINCT FROM auth.uid() OR NOT public.is_admin() THEN
  RAISE EXCEPTION 'Only a verified administrator may plan a milestone' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Order planning requires read committed isolation' USING ERRCODE='25000';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('services-commercial-quote:'||NEW.request_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.service_order_plans p JOIN public.service_requests r ON r.id=p.request_id
  WHERE p.request_id=NEW.request_id AND r.status='proposal_sent')
 OR EXISTS(SELECT 1 FROM public.service_order_plan_acknowledgements a WHERE a.request_id=NEW.request_id) THEN
  RAISE EXCEPTION 'Order plan unavailable or frozen by acknowledgement' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(max(m.position),0)+1 INTO next_position FROM public.service_order_milestones m WHERE m.request_id=NEW.request_id;
 NEW.position:=next_position;
 NEW.created_at:=clock_timestamp();
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION eternyx_private.guard_service_order_milestone() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_order_milestone_guard BEFORE INSERT ON public.service_order_milestones
 FOR EACH ROW EXECUTE FUNCTION eternyx_private.guard_service_order_milestone();
CREATE FUNCTION eternyx_private.guard_service_order_ack()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE actual_count integer;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NOT EXISTS(
  SELECT 1 FROM public.service_requests r WHERE r.id=NEW.request_id AND r.user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Only the request owner may acknowledge the plan' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Order planning requires read committed isolation' USING ERRCODE='25000';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('services-commercial-quote:'||NEW.request_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.service_order_plans p JOIN public.service_requests r ON r.id=p.request_id
  WHERE p.request_id=NEW.request_id AND r.status='proposal_sent') THEN
  RAISE EXCEPTION 'Order plan is not open for acknowledgement' USING ERRCODE='23514';
 END IF;
 SELECT count(*)::integer INTO actual_count FROM public.service_order_milestones m WHERE m.request_id=NEW.request_id;
 IF actual_count=0 OR NEW.milestone_count IS DISTINCT FROM actual_count OR NEW.acknowledged IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Plan acknowledgement requires exact current milestone count and explicit consent' USING ERRCODE='23514';
 END IF;
 NEW.acknowledged_at:=clock_timestamp();
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION eternyx_private.guard_service_order_ack() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_order_ack_guard BEFORE INSERT ON public.service_order_plan_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION eternyx_private.guard_service_order_ack();
CREATE VIEW public.service_order_plan_register WITH(security_invoker=true) AS
SELECT p.request_id,p.acceptance_id,p.prepared_by,p.plan_summary,p.created_at,
 q.id AS quotation_id,q.revision,q.currency,q.amount_minor,
 (SELECT count(*)::integer FROM public.service_order_milestones m WHERE m.request_id=p.request_id) AS milestone_count,
 a.acknowledged_at,
 CASE WHEN r.status<>'proposal_sent' THEN 'closed'
 WHEN a.request_id IS NOT NULL THEN 'awaiting_payment_verification'
 ELSE 'planning' END AS plan_state
FROM public.service_order_plans p JOIN public.service_requests r ON r.id=p.request_id
JOIN public.service_quote_acceptances qa ON qa.id=p.acceptance_id AND qa.request_id=p.request_id
JOIN public.service_quotations q ON q.id=qa.quotation_id AND q.request_id=p.request_id
LEFT JOIN public.service_order_plan_acknowledgements a ON a.request_id=p.request_id;
REVOKE ALL ON public.service_order_plan_register FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.service_order_plan_register TO authenticated;
COMMENT ON VIEW public.service_order_plan_register IS 'Participant-visible immutable order preparation; acknowledged plan still awaits separately verified payment and work authorization.';
COMMENT ON TABLE public.service_order_milestones IS 'Planned deliverables and acceptance criteria only; never actual progress or delivery evidence.';
