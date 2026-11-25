-- Phase51 review candidate; NOT an automatically deployed migration.
-- A quotation acceptance records commercial intent only. It is not payment,
-- a legal signature, verified fulfillment authorization or a delivery event.
-- Apply only transactionally after independent staging approval.
CREATE TABLE public.service_quotations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
 scope_review_id uuid NOT NULL REFERENCES public.service_scope_reviews(id) ON DELETE RESTRICT,
 author_id uuid NOT NULL REFERENCES auth.users(id),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000),
 currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 amount_minor integer NOT NULL CHECK(amount_minor BETWEEN 1 AND 100000000),
 terms text NOT NULL CHECK(char_length(btrim(terms)) BETWEEN 40 AND 4000),
 valid_until timestamptz NOT NULL,
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id,revision),
 UNIQUE(request_id,id),
 CHECK(valid_until>published_at)
);
CREATE TABLE public.service_quote_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
 quotation_id uuid NOT NULL,
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 acknowledged boolean NOT NULL CHECK(acknowledged),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id),
 FOREIGN KEY(request_id,quotation_id) REFERENCES public.service_quotations(request_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.service_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_quote_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_quotations,public.service_quote_acceptances FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.service_quotations,public.service_quote_acceptances TO authenticated;
GRANT INSERT(request_id,scope_review_id,author_id,amount_minor,terms,valid_until) ON public.service_quotations TO authenticated;
GRANT INSERT(request_id,quotation_id,owner_id,acknowledged) ON public.service_quote_acceptances TO authenticated;
CREATE POLICY service_quote_participant_read ON public.service_quotations FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id AND (r.user_id=(SELECT auth.uid()) OR (SELECT public.is_admin()))));
CREATE POLICY service_quote_admin_publish ON public.service_quotations FOR INSERT TO authenticated
 WITH CHECK(author_id=(SELECT auth.uid()) AND (SELECT public.is_admin()) AND EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id));
CREATE POLICY service_quote_acceptance_participant_read ON public.service_quote_acceptances FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id AND (r.user_id=(SELECT auth.uid()) OR (SELECT public.is_admin()))));
CREATE POLICY service_quote_acceptance_owner_insert ON public.service_quote_acceptances FOR INSERT TO authenticated
 WITH CHECK(owner_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=request_id AND r.user_id=(SELECT auth.uid())));
-- Both writers use the SAME per-request lock. Volatile invoker triggers use
-- fresh statement snapshots at READ COMMITTED after acquiring that lock.
-- Reject other isolation levels rather than accepting stale snapshots.
CREATE FUNCTION eternyx_private.guard_service_quote_publish()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE latest integer;
BEGIN
 IF auth.uid() IS NULL OR NEW.author_id IS DISTINCT FROM auth.uid() OR NOT public.is_admin() THEN
  RAISE EXCEPTION 'Quotation requires a verified administrator' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Quotation requires read committed isolation' USING ERRCODE='25000';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('services-commercial-quote:'||NEW.request_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=NEW.request_id AND r.status='proposal_sent')
 OR NOT EXISTS(SELECT 1 FROM public.service_scope_reviews s WHERE s.id=NEW.scope_review_id AND s.request_id=NEW.request_id) THEN
  RAISE EXCEPTION 'Quotation requires published scope on this request' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.service_quote_acceptances a WHERE a.request_id=NEW.request_id) THEN
  RAISE EXCEPTION 'Accepted quotation cannot be superseded' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(max(q.revision),0) INTO latest FROM public.service_quotations q WHERE q.request_id=NEW.request_id;
 NEW.revision:=latest+1;
 NEW.currency:='USD';
 NEW.published_at:=pg_catalog.clock_timestamp();
 IF NEW.valid_until IS NULL OR NEW.valid_until<NEW.published_at+interval '5 minutes' OR NEW.valid_until>NEW.published_at+interval '90 days' THEN
  RAISE EXCEPTION 'Quotation expiry outside permitted window' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION eternyx_private.guard_service_quote_publish() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_quote_publish_guard BEFORE INSERT ON public.service_quotations
 FOR EACH ROW EXECUTE FUNCTION eternyx_private.guard_service_quote_publish();

CREATE FUNCTION eternyx_private.guard_service_quote_accept()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE q public.service_quotations%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NOT EXISTS(
  SELECT 1 FROM public.service_requests r WHERE r.id=NEW.request_id AND r.user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Quotation acceptance requires request owner' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Quotation requires read committed isolation' USING ERRCODE='25000';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('services-commercial-quote:'||NEW.request_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.service_requests r WHERE r.id=NEW.request_id AND r.status='proposal_sent') THEN
  RAISE EXCEPTION 'Request is not open for quotation acceptance' USING ERRCODE='23514';
 END IF;
 SELECT * INTO q FROM public.service_quotations WHERE request_id=NEW.request_id ORDER BY revision DESC LIMIT 1;
 NEW.accepted_at:=pg_catalog.clock_timestamp();
 IF q.id IS NULL OR q.id IS DISTINCT FROM NEW.quotation_id OR q.valid_until<=NEW.accepted_at OR NEW.acknowledged IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Quotation expired, superseded or unacknowledged' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.service_quote_acceptances a WHERE a.request_id=NEW.request_id) THEN
  RAISE EXCEPTION 'Quotation already accepted' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION eternyx_private.guard_service_quote_accept() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_quote_accept_guard BEFORE INSERT ON public.service_quote_acceptances
 FOR EACH ROW EXECUTE FUNCTION eternyx_private.guard_service_quote_accept();

CREATE VIEW public.service_quotation_register WITH(security_invoker=true) AS
SELECT q.id,q.request_id,q.scope_review_id,q.revision,q.currency,q.amount_minor,q.terms,q.valid_until,q.published_at,
 a.id AS acceptance_id,a.accepted_at,
 CASE WHEN a.id IS NOT NULL THEN 'accepted'
 WHEN EXISTS(SELECT 1 FROM public.service_quotations newer WHERE newer.request_id=q.request_id AND newer.revision>q.revision) THEN 'superseded'
 WHEN q.valid_until<=pg_catalog.statement_timestamp() THEN 'expired'
 WHEN r.status<>'proposal_sent' THEN 'closed'
 ELSE 'open' END AS quote_state
FROM public.service_quotations q
JOIN public.service_requests r ON r.id=q.request_id
LEFT JOIN public.service_quote_acceptances a ON a.quotation_id=q.id AND a.request_id=q.request_id;
REVOKE ALL ON public.service_quotation_register FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.service_quotation_register TO authenticated;
COMMENT ON TABLE public.service_quotations IS 'Immutable USD quotation revisions pinned to published scope; not a charge or work authorization.';
COMMENT ON TABLE public.service_quote_acceptances IS 'One explicit owner acceptance of exact quotation; no legal signature, payment or fulfillment claim.';
COMMENT ON VIEW public.service_quotation_register IS 'Participant-scoped persisted quotation state; never a payment receipt or service delivery status.';
