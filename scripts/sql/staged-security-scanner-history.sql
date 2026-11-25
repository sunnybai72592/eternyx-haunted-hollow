-- Review candidate: isolated staging scanner history bootstrap only.
-- Never replay the historical disable_rls_vulnerability_scans helper.
BEGIN;
CREATE TABLE public.vulnerability_scans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 target_url text NOT NULL, scan_type text NOT NULL, status text,
 started_at timestamptz, completed_at timestamptz, created_at timestamptz DEFAULT now(),
 results jsonb, risk_score numeric, scan_duration integer, vulnerabilities_found integer
);
CREATE TABLE public.ai_security_analysis (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 analysis_type text NOT NULL, input_data jsonb NOT NULL, results jsonb NOT NULL,
 confidence_score numeric, processing_time integer, model_version text, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.vulnerability_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_security_analysis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vulnerability_scans,public.ai_security_analysis FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.vulnerability_scans,public.ai_security_analysis TO authenticated;
GRANT UPDATE (status,completed_at,results,vulnerabilities_found,scan_duration,risk_score) ON public.vulnerability_scans TO authenticated;
CREATE POLICY scanner_owner ON public.vulnerability_scans TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY analysis_owner ON public.ai_security_analysis TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY scanner_session ON public.vulnerability_scans AS RESTRICTIVE TO authenticated USING ((SELECT cybersecurity_session_private.has_live_session())) WITH CHECK ((SELECT cybersecurity_session_private.has_live_session()));
CREATE POLICY analysis_session ON public.ai_security_analysis AS RESTRICTIVE TO authenticated USING ((SELECT cybersecurity_session_private.has_live_session())) WITH CHECK ((SELECT cybersecurity_session_private.has_live_session()));
CREATE INDEX scanner_owner_created ON public.vulnerability_scans(user_id,created_at DESC);
CREATE INDEX analysis_owner_created ON public.ai_security_analysis(user_id,created_at DESC);
COMMIT;
