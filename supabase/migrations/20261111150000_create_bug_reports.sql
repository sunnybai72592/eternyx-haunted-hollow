-- Store authenticated ETERNYX bug reports with owner-scoped access.
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 160),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 20 AND 5000),
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'triaged', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_user_created_at_idx
  ON public.bug_reports (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bug_reports_status_created_at_idx
  ON public.bug_reports (status, created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bug_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bug_reports TO authenticated;
GRANT INSERT (user_id, title, description, severity)
  ON TABLE public.bug_reports TO authenticated;

CREATE POLICY "Users can submit their own bug reports"
  ON public.bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view their own bug reports or admins can view all"
  ON public.bug_reports
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

COMMENT ON TABLE public.bug_reports IS
  'Authenticated user bug reports. Status is server-managed; owners can read only their own reports.';
