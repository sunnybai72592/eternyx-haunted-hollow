\set ON_ERROR_STOP on
-- Disposable PostgreSQL only; this harness emulates verified JWT claims.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth,storage TO authenticated;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);
INSERT INTO auth.sessions VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',NULL),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',NULL),
 ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',now()-interval '1 day');
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['pentest_engagements','pentest_evidence','pentest_audit_events','security_case_assets','security_case_findings','security_case_finding_evidence','security_case_finding_history'] LOOP
 EXECUTE format('CREATE TABLE public.%I(owner_id uuid NOT NULL)',t);
 EXECUTE format('INSERT INTO public.%I VALUES ($1),($2)',t) USING '20000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000002'::uuid;
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY owned ON public.%I TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid())',t);
 END LOOP;
END $$;
CREATE TABLE storage.objects(bucket_id text,owner_id uuid);
INSERT INTO storage.objects VALUES ('pentest-evidence','20000000-0000-4000-8000-000000000001'),('unrelated','20000000-0000-4000-8000-000000000001');
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
CREATE POLICY owned ON storage.objects TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid());
\ir staged-security-session-fence.sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000001"}',false);
DO $$
DECLARE t text; n integer;
BEGIN
 FOREACH t IN ARRAY ARRAY['pentest_engagements','pentest_evidence','pentest_audit_events','security_case_assets','security_case_findings','security_case_finding_evidence','security_case_finding_history'] LOOP
 EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
 IF n <> 1 THEN RAISE EXCEPTION 'active ownership failed: %',t; END IF;
 END LOOP;
 IF (SELECT count(*) FROM storage.objects) <> 2 THEN RAISE EXCEPTION 'active storage failed'; END IF;
END $$;
RESET ROLE;
DELETE FROM auth.sessions WHERE id='10000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $$
DECLARE t text; n integer;
BEGIN
 FOREACH t IN ARRAY ARRAY['pentest_engagements','pentest_evidence','pentest_audit_events','security_case_assets','security_case_findings','security_case_finding_evidence','security_case_finding_history'] LOOP
 EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
 IF n <> 0 THEN RAISE EXCEPTION 'revoked read exposed: %',t; END IF;
 BEGIN
 EXECUTE format('INSERT INTO public.%I VALUES ($1)',t) USING auth.uid();
 RAISE EXCEPTION 'revoked insert succeeded: %',t;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE format('UPDATE public.%I SET owner_id=owner_id',t);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'revoked update succeeded: %',t; END IF;
 EXECUTE format('DELETE FROM public.%I',t);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'revoked delete succeeded: %',t; END IF;
 END LOOP;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='pentest-evidence')<>0 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='unrelated')<>1 THEN RAISE EXCEPTION 'storage fence scope failed'; END IF;
END $$;
DO $$
DECLARE claim jsonb;
BEGIN
 FOREACH claim IN ARRAY ARRAY[
 '{"sub":"20000000-0000-4000-8000-000000000001"}'::jsonb,
 '{"sub":"20000000-0000-4000-8000-000000000001","session_id":"not-a-uuid"}'::jsonb,
 '{"sub":"20000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000002"}'::jsonb,
 '{"sub":"20000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000003"}'::jsonb,
 '{"sub":"20000000-0000-4000-8000-000000000002","session_id":"10000000-0000-4000-8000-000000000002","is_anonymous":true}'::jsonb
 ] LOOP
 PERFORM set_config('request.jwt.claims',claim::text,false);
 IF cybersecurity_session_private.has_live_session() THEN RAISE EXCEPTION 'invalid session allowed'; END IF;
 END LOOP;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","session_id":"10000000-0000-4000-8000-000000000002"}',false);
DO $$ BEGIN IF (SELECT count(*) FROM public.pentest_engagements)<>1 THEN RAISE EXCEPTION 'B session disrupted'; END IF; END $$;
RESET ROLE;
SELECT 'Wave 20 synthetic PostgreSQL authorization regression passed' AS result;
