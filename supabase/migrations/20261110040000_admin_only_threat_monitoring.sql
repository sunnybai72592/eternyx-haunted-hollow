-- Threat monitoring records contain platform-wide security telemetry.
-- There is no per-user ownership column, so browser access is admin-read-only.
-- Trusted backend services using service_role retain their existing access.

ALTER TABLE public.threat_monitoring_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'threat_monitoring_events'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.threat_monitoring_events',
      policy_row.policyname
    );
  END LOOP;
END
$$;

CREATE POLICY "admins_can_read_threat_monitoring_events"
ON public.threat_monitoring_events
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Browser clients cannot fabricate, alter, or delete security telemetry.
-- Existing service_role privileges are intentionally left unchanged.
REVOKE ALL ON TABLE public.threat_monitoring_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.threat_monitoring_events TO authenticated;

COMMENT ON TABLE public.threat_monitoring_events IS
  'Platform security telemetry. Authenticated browser reads are restricted to trusted admins; writes are reserved for trusted backend services.';
