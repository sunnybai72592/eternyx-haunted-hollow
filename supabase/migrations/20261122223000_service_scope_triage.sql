-- ETERNYX Services Phase 3. Reviewed intake -> triage -> immutable scope reviews
-- -> non-binding customer feedback. Requires prior Services Phase 1 & 2 migrations.
-- Schema changes apply only when deployed through the reviewed migration workflow.

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS expected_outcome text,
  ADD COLUMN IF NOT EXISTS timeframe text,
  ADD COLUMN IF NOT EXISTS constraints text,
  ADD COLUMN IF NOT EXISTS authorization_understood boolean NOT NULL DEFAULT false;
ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_outcome_length
    CHECK (expected_outcome IS NULL OR char_length(btrim(expected_outcome)) BETWEEN 12 AND 800),
  ADD CONSTRAINT service_requests_timeframe_values
    CHECK (timeframe IS NULL OR timeframe IN ('flexible', 'under_1_month', '1_3_months', '3_plus_months')),
  ADD CONSTRAINT service_requests_constraints_length
    CHECK (constraints IS NULL OR char_length(constraints) <= 1200);
GRANT INSERT (expected_outcome, timeframe, constraints, authorization_understood)
  ON public.service_requests TO authenticated;
-- No existing request is misrepresented as authorization or a binding order.

-- Operational triage notes must NEVER live on service_requests because owners
-- already have table-level SELECT on service_requests.
CREATE TABLE IF NOT EXISTS public.service_request_triage (
  request_id uuid PRIMARY KEY REFERENCES public.service_requests(id) ON DELETE CASCADE,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_admin_id uuid REFERENCES public.admin_users(user_id) ON DELETE SET NULL,
  internal_note text NOT NULL DEFAULT ''
    CHECK (char_length(internal_note) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_request_triage_assigned_idx
  ON public.service_request_triage(assigned_admin_id);
ALTER TABLE public.service_request_triage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_request_triage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_request_triage TO authenticated;
GRANT INSERT (request_id, priority, assigned_admin_id, internal_note)
  ON public.service_request_triage TO authenticated;
GRANT UPDATE (priority, assigned_admin_id, internal_note)
  ON public.service_request_triage TO authenticated;
CREATE POLICY "service_triage_admin_read"
  ON public.service_request_triage FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
CREATE POLICY "service_triage_admin_create"
  ON public.service_request_triage FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "service_triage_admin_update"
  ON public.service_request_triage FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
CREATE TRIGGER service_triage_update_time
  BEFORE UPDATE ON public.service_request_triage
  FOR EACH ROW EXECUTE FUNCTION eternyx_private.service_request_update_time();

-- An admin publishes one immutable *non-binding* scope memo at a time.
-- Each publication is an independent revision; there is no edit/delete API.
CREATE TABLE IF NOT EXISTS public.service_scope_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  scope_summary text NOT NULL CHECK (char_length(btrim(scope_summary)) BETWEEN 40 AND 2500),
  deliverables text NOT NULL CHECK (char_length(btrim(deliverables)) BETWEEN 20 AND 2500),
  exclusions text NOT NULL CHECK (char_length(btrim(exclusions)) BETWEEN 10 AND 1500),
  assumptions text NOT NULL CHECK (char_length(btrim(assumptions)) BETWEEN 10 AND 1500),
  next_steps text NOT NULL CHECK (char_length(btrim(next_steps)) BETWEEN 10 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_scope_reviews_request_created_idx
  ON public.service_scope_reviews(request_id, created_at DESC);
ALTER TABLE public.service_scope_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_scope_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_scope_reviews TO authenticated;
GRANT INSERT (request_id, author_id, scope_summary, deliverables, exclusions, assumptions, next_steps)
  ON public.service_scope_reviews TO authenticated;
CREATE POLICY "service_scope_reviews_owner_admin_read"
  ON public.service_scope_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests AS r
      WHERE r.id = request_id
      AND (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
    )
  );
CREATE POLICY "service_scope_reviews_admin_publish"
  ON public.service_scope_reviews FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid()) AND (SELECT public.is_admin())
    AND EXISTS (SELECT 1 FROM public.service_requests AS r WHERE r.id = request_id)
  );

-- Response is a non-binding indication of interest or request for revision.
-- It cannot accept a contract, start fulfillment or charge any payment method.
CREATE TABLE IF NOT EXISTS public.service_scope_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.service_scope_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ready_to_discuss', 'request_changes', 'not_proceeding')),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 10 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_scope_responses_review_created_idx
  ON public.service_scope_responses(review_id, created_at DESC);
ALTER TABLE public.service_scope_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_scope_responses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_scope_responses TO authenticated;
GRANT INSERT (review_id, user_id, kind, note)
  ON public.service_scope_responses TO authenticated;
CREATE POLICY "service_scope_responses_owner_admin_read"
  ON public.service_scope_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_scope_reviews AS v
      JOIN public.service_requests AS r ON r.id = v.request_id
      WHERE v.id = review_id
      AND (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
    )
  );
CREATE POLICY "service_scope_responses_owner_create"
  ON public.service_scope_responses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.service_scope_reviews AS v
      JOIN public.service_requests AS r ON r.id = v.request_id
      WHERE v.id = review_id AND r.user_id = (SELECT auth.uid())
    )
  );

-- Avoid showing "Proposal shared" in the request tracker without an
-- actual, persisted scope review available for the customer to inspect.
CREATE OR REPLACE FUNCTION eternyx_private.require_published_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'proposal_sent'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT EXISTS (
       SELECT 1 FROM public.service_scope_reviews v WHERE v.request_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Cannot mark proposal shared until a scope review has been published'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.require_published_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER service_request_scope_guard
  BEFORE UPDATE OF status ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION eternyx_private.require_published_scope();

COMMENT ON TABLE public.service_request_triage IS
  'Admin-only operational notes. Never expose through owner-facing service_requests SELECT.';
COMMENT ON TABLE public.service_scope_reviews IS
  'Immutable non-binding project scope review memos; not contracts or purchase orders.';
COMMENT ON TABLE public.service_scope_responses IS
  'Customer review feedback; no agreement, purchase, service authorization or entitlement is created.';
