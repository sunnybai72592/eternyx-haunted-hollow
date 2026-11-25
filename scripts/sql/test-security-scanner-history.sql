-- Disposable PostgreSQL only, after Wave 27 restored synthetic state.
\set ON_ERROR_STOP on
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
\ir staged-security-scanner-history.sql
INSERT INTO public.vulnerability_scans(id,user_id,target_url,scan_type,status) VALUES
 ('30000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000001','synthetic','cve-keyword-research','completed'),
 ('30000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000002','synthetic','cve-keyword-research','running');
INSERT INTO public.ai_security_analysis(user_id,analysis_type,input_data,results) VALUES
 ('20000000-0000-4000-8000-000000000001','dns_security','{}','{}'),
 ('20000000-0000-4000-8000-000000000002','dns_security','{}','{}');
DO $$ BEGIN
 IF has_table_privilege('anon','public.vulnerability_scans','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('anon','public.ai_security_analysis','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated','public.vulnerability_scans','DELETE')
 OR has_table_privilege('authenticated','public.ai_security_analysis','DELETE,UPDATE')
 OR has_column_privilege('authenticated','public.vulnerability_scans','user_id','UPDATE')
 THEN RAISE EXCEPTION 'history privilege escape'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","session_id":"10000000-0000-4000-8000-000000000002"}',false);
DO $$ DECLARE n int; BEGIN
 IF (SELECT count(*) FROM public.vulnerability_scans)<>1 OR (SELECT count(*) FROM public.ai_security_analysis)<>1 THEN RAISE EXCEPTION 'owner isolation failure'; END IF;
 UPDATE public.vulnerability_scans SET status='completed' WHERE id='30000000-0000-4000-8000-000000000011';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'cross-owner update'; END IF;
 UPDATE public.vulnerability_scans SET status='completed' WHERE id='30000000-0000-4000-8000-000000000012';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'owner completion broken'; END IF;
 BEGIN
 INSERT INTO public.ai_security_analysis(user_id,analysis_type,input_data,results) VALUES ('20000000-0000-4000-8000-000000000001','dns_security','{}','{}');
 RAISE EXCEPTION 'foreign insert accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.ai_security_analysis(user_id,analysis_type,input_data,results) VALUES ('20000000-0000-4000-8000-000000000002','ssl_analysis','{}','{}');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000001"}',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.vulnerability_scans)<>0 OR (SELECT count(*) FROM public.ai_security_analysis)<>0 THEN RAISE EXCEPTION 'revoked owner history exposed'; END IF;
 BEGIN
 INSERT INTO public.vulnerability_scans(user_id,target_url,scan_type) VALUES ('20000000-0000-4000-8000-000000000001','synthetic','cve-keyword-research');
 RAISE EXCEPTION 'revoked insert accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'Synthetic scanner history authorization checks passed' AS result;
