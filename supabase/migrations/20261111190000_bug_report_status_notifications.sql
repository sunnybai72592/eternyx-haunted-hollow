-- Keep notification creation aligned with trusted administrator authorization.
-- Status changes and their user notification are committed atomically through the RPC below.

DROP POLICY IF EXISTS "Admins can create notifications" ON public.notifications;

REVOKE INSERT ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT INSERT (user_id, title, message, type, action_url)
  ON TABLE public.notifications TO authenticated;

CREATE POLICY "Trusted administrators can create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.admin_update_bug_report_status(
  p_report_id uuid,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_title text;
  v_current_status text;
  v_status_label text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required'
      USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('open', 'triaged', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Invalid bug report status'
      USING ERRCODE = '22023';
  END IF;

  SELECT user_id, title, status
    INTO v_user_id, v_title, v_current_status
    FROM public.bug_reports
    WHERE id = p_report_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bug report not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status = p_status THEN
    RETURN false;
  END IF;

  UPDATE public.bug_reports
    SET status = p_status
    WHERE id = p_report_id;

  v_status_label := CASE p_status
    WHEN 'in_progress' THEN 'In progress'
    WHEN 'triaged' THEN 'Under review'
    WHEN 'resolved' THEN 'Resolved'
    WHEN 'closed' THEN 'Closed'
    ELSE 'Open'
  END;

  INSERT INTO public.notifications (user_id, title, message, type, action_url)
  VALUES (
    v_user_id,
    'Bug report status updated',
    'Your bug report "' || v_title || '" is now ' || v_status_label || '.',
    CASE WHEN p_status IN ('resolved', 'closed') THEN 'success' ELSE 'info' END,
    '/my-bug-reports'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_bug_report_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_bug_report_status(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_update_bug_report_status(uuid, text) IS
  'Atomically updates a bug report status and notifies its owner; trusted administrators only.';
