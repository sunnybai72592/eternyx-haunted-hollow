-- Allow trusted administrators to review all bug reports and update only workflow status.
GRANT UPDATE (status) ON TABLE public.bug_reports TO authenticated;

CREATE POLICY "Only administrators can update bug report status"
  ON public.bug_reports
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

COMMENT ON POLICY "Only administrators can update bug report status" ON public.bug_reports IS
  'Only trusted administrators identified by public.is_admin() may update bug report workflow status.';
