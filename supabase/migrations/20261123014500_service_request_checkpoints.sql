-- ETERNYX Services Phase 10: explicit, per-user request check-ins.
-- These are recorded button actions, NOT read receipts, email open tracking,
-- response guarantees, or automatic client-side "seen" events.
-- Relies on Services Phases 1-9. The admin and customer views stay RLS invokers.

CREATE TABLE IF NOT EXISTS public.service_request_checks (
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS service_request_checks_user_checked_idx
  ON public.service_request_checks(user_id, checked_at DESC);

ALTER TABLE public.service_request_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_request_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_request_checks TO authenticated;
GRANT INSERT (request_id, user_id) ON TABLE public.service_request_checks TO authenticated;
GRANT UPDATE (checked_at) ON TABLE public.service_request_checks TO authenticated;

CREATE POLICY "service_request_checks_own_read"
ON public.service_request_checks FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.id = request_id
      AND (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  )
);

CREATE POLICY "service_request_checks_own_insert"
ON public.service_request_checks FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.id = request_id
      AND (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  )
);

CREATE POLICY "service_request_checks_own_update"
ON public.service_request_checks FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.id = request_id
      AND (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  )
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.id = request_id
      AND (r.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  )
);

-- A client cannot choose an arbitrary timestamp, including through a direct
-- UPDATE request. All accepted writes use server clock.
CREATE OR REPLACE FUNCTION eternyx_private.touch_service_request_check()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  NEW.checked_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION eternyx_private.touch_service_request_check()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_request_check_server_time ON public.service_request_checks;
CREATE TRIGGER service_request_check_server_time
BEFORE INSERT OR UPDATE ON public.service_request_checks
FOR EACH ROW EXECUTE FUNCTION eternyx_private.touch_service_request_check();

-- A short, strictly invoker-permissioned endpoint writes the signed-in
-- user's OWN check-in. The caller never supplies actor_id or checked_at.
-- RLS remains authoritative for both cross-account and non-admin access.
CREATE OR REPLACE FUNCTION public.mark_service_request_checked(p_request_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_checked_at timestamptz;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'A signed-in account and request are required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.service_requests r
    WHERE r.id = p_request_id
      AND (r.user_id = v_actor OR (SELECT public.is_admin()))
  ) THEN
    RAISE EXCEPTION 'Request unavailable to this account'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.service_request_checks(request_id, user_id)
  VALUES(p_request_id, v_actor)
  ON CONFLICT (request_id, user_id) DO UPDATE
  SET checked_at = pg_catalog.clock_timestamp()
  RETURNING checked_at INTO v_checked_at;

  RETURN v_checked_at;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_service_request_checked(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_service_request_checked(uuid)
  TO authenticated;

-- The customer view is explicitly owner-scoped even for an admin who could
-- otherwise SELECT other requests. It cannot reveal any triage private notes.
CREATE OR REPLACE VIEW public.service_customer_check_queue
WITH (security_invoker = true) AS
SELECT
  q.*,
  c.checked_at AS last_checked_at,
  (q.last_admin_activity_at IS NOT NULL
    AND (c.checked_at IS NULL OR q.last_admin_activity_at > c.checked_at)
  ) AS has_updates_since_check
FROM (
  SELECT
    r.id, r.user_id, r.service_key, r.title, r.description,
    r.status, r.client_update, r.created_at, r.updated_at,
    r.expected_outcome, r.timeframe, r.constraints,
    greatest(
      (SELECT max(a.created_at) FROM public.service_request_activity a
       WHERE a.request_id = r.id
         AND (a.event_type = 'status_changed'
           OR (a.event_type = 'message' AND a.actor_id IS DISTINCT FROM r.user_id))),
      (SELECT max(v.created_at) FROM public.service_scope_reviews v
       WHERE v.request_id = r.id)
    ) AS last_admin_activity_at
  FROM public.service_requests r
  WHERE r.user_id = (SELECT auth.uid())
) q
LEFT JOIN public.service_request_checks c
  ON c.request_id = q.id AND c.user_id = (SELECT auth.uid());

REVOKE ALL ON public.service_customer_check_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_customer_check_queue TO authenticated;

-- Admin check-ins are per-person, not shared by a team. The older
-- needs_follow_up signal is unchanged and remains separate from this view.
CREATE OR REPLACE VIEW public.service_admin_check_queue
WITH (security_invoker = true) AS
SELECT
  q.*,
  c.checked_at AS last_checked_at,
  (
    c.checked_at IS NULL
    OR (q.last_customer_activity_at IS NOT NULL
      AND q.last_customer_activity_at > c.checked_at)
  ) AS needs_my_check
FROM public.service_admin_review_queue q
LEFT JOIN public.service_request_checks c
  ON c.request_id = q.id AND c.user_id = (SELECT auth.uid())
WHERE (SELECT public.is_admin());

REVOKE ALL ON public.service_admin_check_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_admin_check_queue TO authenticated;

COMMENT ON TABLE public.service_request_checks IS
  'Explicit per-user service request check-ins. Not a verified read receipt.';
COMMENT ON VIEW public.service_customer_check_queue IS
  'Owner-only request list with admin activity since the signed-in owner explicitly last checked.';
COMMENT ON VIEW public.service_admin_check_queue IS
  'Admin-only review queue with personal check-ins and customer activity since last check.';
COMMENT ON FUNCTION public.mark_service_request_checked(uuid) IS
  'Signed-in owner/admin explicitly marks a request checked. Server owns timestamp; no automatic unread receipts.';
