-- REVIEW CANDIDATE ONLY. Not a canonical migration. Apply only after staging review.
BEGIN;
CREATE SCHEMA IF NOT EXISTS cybersecurity_session_private;
REVOKE ALL ON SCHEMA cybersecurity_session_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA cybersecurity_session_private TO authenticated;

-- Only returns whether the caller's own verified JWT session exists.
-- Definer access is necessary because auth.sessions is not client-readable.
CREATE OR REPLACE FUNCTION cybersecurity_session_private.has_live_session()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT EXISTS (
   SELECT 1 FROM auth.sessions s
   WHERE s.user_id = (SELECT auth.uid())
     AND s.id::text = (SELECT auth.jwt()->>'session_id')
     AND (s.not_after IS NULL OR s.not_after > statement_timestamp())
 )
 AND COALESCE((SELECT auth.jwt()->>'is_anonymous'),'false') = 'false'
$$;
REVOKE ALL ON FUNCTION cybersecurity_session_private.has_live_session() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cybersecurity_session_private.has_live_session() TO authenticated;

-- Restrictive policies AND with existing permissive ownership/scope rules.
-- No new operation or row visibility is granted.
DO $block$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY[
   'pentest_engagements','pentest_evidence','pentest_audit_events',
   'security_case_assets','security_case_findings',
   'security_case_finding_evidence','security_case_finding_history'
 ] LOOP
   EXECUTE format('CREATE POLICY wave20_live_session ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT cybersecurity_session_private.has_live_session())) WITH CHECK ((SELECT cybersecurity_session_private.has_live_session()))', relation);
 END LOOP;
END
$block$;
-- Scope restriction to cybersecurity bucket; unrelated buckets stay unaffected.
CREATE POLICY wave20_pentest_live_session ON storage.objects
 AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id <> 'pentest-evidence' OR (SELECT cybersecurity_session_private.has_live_session()))
 WITH CHECK (bucket_id <> 'pentest-evidence' OR (SELECT cybersecurity_session_private.has_live_session()));
COMMIT;
