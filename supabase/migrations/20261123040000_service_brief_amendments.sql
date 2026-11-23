-- ETERNYX Services Phase 13: immutable customer brief amendments.
-- The original project brief is never overwritten. "Reviewed" is a personal
-- admin acknowledgement, not acceptance, authorization or a delivery promise.
-- Depends on Services Phase 12 follow-up views.

CREATE TABLE public.service_brief_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  category text NOT NULL CHECK (category IN ('scope', 'requirements', 'timeframe', 'constraints', 'other')),
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 10 AND 160),
  details text NOT NULL CHECK (char_length(btrim(details)) BETWEEN 30 AND 2500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  CONSTRAINT service_brief_amendment_review_consistency CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (status = 'reviewed' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);

CREATE INDEX service_brief_amendments_request_recent_idx
  ON public.service_brief_amendments (request_id, created_at DESC, id DESC);
CREATE INDEX service_brief_amendments_pending_idx
  ON public.service_brief_amendments (request_id) WHERE status = 'pending';
CREATE INDEX service_brief_amendments_author_recent_idx
  ON public.service_brief_amendments (request_id, author_id, created_at DESC);

ALTER TABLE public.service_brief_amendments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_brief_amendments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_brief_amendments TO authenticated;
GRANT INSERT (request_id, author_id, category, summary, details)
  ON public.service_brief_amendments TO authenticated;
GRANT UPDATE (status) ON public.service_brief_amendments TO authenticated;

CREATE POLICY "service_brief_amendments_participant_read"
  ON public.service_brief_amendments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests r
      WHERE r.id = request_id
        AND (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
    )
  );

CREATE POLICY "service_brief_amendments_owner_insert"
  ON public.service_brief_amendments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.service_requests r
      WHERE r.id = request_id AND r.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "service_brief_amendments_admin_review"
  ON public.service_brief_amendments FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Stamp the actual actor & server time. No reopen, content edit or spoofed
-- reviewer is possible with the column-level authenticated UPDATE grant.
CREATE OR REPLACE FUNCTION eternyx_private.stamp_service_brief_review()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending' OR NEW.status <> 'reviewed'
     OR NOT (SELECT public.is_admin()) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Only a verified administrator may review an amendment'
      USING ERRCODE = '42501';
  END IF;
  NEW.reviewed_at := pg_catalog.clock_timestamp();
  NEW.reviewed_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.stamp_service_brief_review()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER service_brief_amendment_stamp_review
BEFORE UPDATE OF status ON public.service_brief_amendments
FOR EACH ROW EXECUTE FUNCTION eternyx_private.stamp_service_brief_review();

-- Same-owner, same-request writes serialize for real duplicate and burst
-- enforcement, independent from the client button's disabled state.
CREATE OR REPLACE FUNCTION eternyx_private.guard_service_brief_amendment_burst()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.author_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the signed-in owner may submit an amendment'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'service-brief-amendment:' || NEW.request_id::text || ':' || NEW.author_id::text, 0
  ));

  IF (
    SELECT count(*) FROM public.service_brief_amendments a
    WHERE a.request_id = NEW.request_id AND a.author_id = NEW.author_id
      AND a.created_at >= pg_catalog.clock_timestamp() - interval '10 minutes'
  ) >= 4 THEN
    RAISE EXCEPTION 'Too many brief amendments. Try again in ten minutes.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_brief_amendments a
    WHERE a.request_id = NEW.request_id AND a.author_id = NEW.author_id
      AND a.created_at >= pg_catalog.clock_timestamp() - interval '5 minutes'
      AND pg_catalog.lower(pg_catalog.btrim(a.summary)) =
          pg_catalog.lower(pg_catalog.btrim(NEW.summary))
      AND pg_catalog.lower(pg_catalog.btrim(a.details)) =
          pg_catalog.lower(pg_catalog.btrim(NEW.details))
  ) THEN
    RAISE EXCEPTION 'This brief amendment was already submitted recently.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.guard_service_brief_amendment_burst()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER service_brief_amendment_burst_guard
BEFORE INSERT ON public.service_brief_amendments
FOR EACH ROW EXECUTE FUNCTION eternyx_private.guard_service_brief_amendment_burst();

-- Owner view contains only own request rows through inherited invoker RLS.
-- Admin review is an actual activity signal; do not claim the admin has
-- accepted or delivered any service.
CREATE VIEW public.service_customer_amendment_queue
WITH (security_invoker = true) AS
SELECT q.*,
  a.amendment_count,
  a.pending_amendment_count,
  a.last_amendment_reviewed_at,
  (
    q.has_updates_since_check_extended
    OR (a.last_amendment_reviewed_at IS NOT NULL
      AND (q.last_checked_at IS NULL OR a.last_amendment_reviewed_at > q.last_checked_at))
  ) AS has_updates_since_check_complete
FROM public.service_customer_followup_queue q
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS amendment_count,
    count(*) FILTER (WHERE status = 'pending')::integer AS pending_amendment_count,
    max(reviewed_at) AS last_amendment_reviewed_at
  FROM public.service_brief_amendments x WHERE x.request_id = q.id
) a;
REVOKE ALL ON public.service_customer_amendment_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_customer_amendment_queue TO authenticated;

CREATE VIEW public.service_admin_amendment_queue
WITH (security_invoker = true) AS
SELECT q.*,
  a.amendment_count,
  a.pending_amendment_count,
  a.last_amendment_submitted_at,
  (
    q.needs_my_check_extended
    OR (a.last_amendment_submitted_at IS NOT NULL
      AND (q.last_checked_at IS NULL OR a.last_amendment_submitted_at > q.last_checked_at))
  ) AS needs_my_check_complete,
  (q.needs_follow_up_extended OR a.pending_amendment_count > 0) AS needs_follow_up_complete
FROM public.service_admin_followup_queue q
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS amendment_count,
    count(*) FILTER (WHERE status = 'pending')::integer AS pending_amendment_count,
    max(created_at) AS last_amendment_submitted_at
  FROM public.service_brief_amendments x WHERE x.request_id = q.id
) a
WHERE (SELECT public.is_admin());
REVOKE ALL ON public.service_admin_amendment_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_admin_amendment_queue TO authenticated;

COMMENT ON TABLE public.service_brief_amendments IS
  'Append-only customer-requested brief changes. The original request stays unchanged. Admin review is acknowledgement only.';
COMMENT ON VIEW public.service_customer_amendment_queue IS
  'Security-invoker owner-only request queue with actual amendment acknowledgement since explicit check-in.';
COMMENT ON VIEW public.service_admin_amendment_queue IS
  'Security-invoker admin-only queue with real pending customer amendments and personal check-in activity.';
