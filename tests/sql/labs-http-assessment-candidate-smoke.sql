-- Disposable PG17 only. All runtime evidence is simulated.
BEGIN;
UPDATE public.ctf_range_provider SET enabled=true,ingress_approved=true,max_active_sessions=2,last_heartbeat_at=now();
INSERT INTO public.ctf_range_sessions(id,user_id,status,provider_instance_ref,started_at)
VALUES ('123e4567-e89b-42d3-a456-426614174001','11111111-1111-4111-8111-111111111111','running','fixture-a',now()),
       ('123e4567-e89b-42d3-a456-426614174002','22222222-2222-4222-8222-222222222222','running','fixture-b',now());
INSERT INTO public.ctf_range_access_grants(session_id,user_id,token_hash,expires_at)
VALUES ('123e4567-e89b-42d3-a456-426614174001','11111111-1111-4111-8111-111111111111',repeat('1',64),now()+interval '60 seconds'),
       ('123e4567-e89b-42d3-a456-426614174002','22222222-2222-4222-8222-222222222222',repeat('2',64),now()+interval '60 seconds');
SET LOCAL ROLE service_role;
DO $$
DECLARE a uuid:='11111111-1111-4111-8111-111111111111'; s uuid:='123e4567-e89b-42d3-a456-426614174001';
 facts jsonb:='{"authorization-denial":403,"unknown-resource":404,"method-restriction":405,"allowed-method":"GET","cache-policy":"no-store","content-sniffing":"nosniff"}';
BEGIN
 IF public.ctf_http_record_observation(a,s,repeat('a',64),repeat('b',64),facts) IS DISTINCT FROM false THEN RAISE EXCEPTION 'disabled evidence admission'; END IF;
 IF (public.ctf_http_submit_assessment(a,s,repeat('1',64),facts)->>'ok') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'disabled grading'; END IF;
END $$;
RESET ROLE;
-- Simulated review solely inside rollback-only test.
UPDATE public.ctf_http_assessment_policy SET enabled=true,reviewed_bundle_sha=repeat('a',64);
SET LOCAL ROLE service_role;
DO $$
DECLARE a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222';
 sa uuid:='123e4567-e89b-42d3-a456-426614174001'; sb uuid:='123e4567-e89b-42d3-a456-426614174002';
 facts jsonb:='{"authorization-denial":403,"unknown-resource":404,"method-restriction":405,"allowed-method":"GET","cache-policy":"no-store","content-sniffing":"nosniff"}';
 res jsonb;
BEGIN
 IF public.ctf_http_submit_assessment(a,sa,repeat('1',64),facts)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'missing evidence accepted'; END IF;
 IF public.ctf_http_record_observation(b,sa,repeat('a',64),repeat('b',64),facts) IS DISTINCT FROM false THEN RAISE EXCEPTION 'foreign evidence accepted'; END IF;
 IF public.ctf_http_record_observation(a,sa,repeat('c',64),repeat('b',64),facts) IS DISTINCT FROM false THEN RAISE EXCEPTION 'unreviewed image accepted'; END IF;
 IF public.ctf_http_record_observation(a,sa,repeat('a',64),repeat('b',64),facts||'{"score":6}') IS DISTINCT FROM false THEN RAISE EXCEPTION 'extra observation field accepted'; END IF;
 IF public.ctf_http_record_observation(a,sa,repeat('a',64),repeat('b',64),facts) IS DISTINCT FROM true THEN RAISE EXCEPTION 'owner observation denied'; END IF;
 IF public.ctf_http_record_observation(b,sb,repeat('a',64),repeat('b',64),facts) IS DISTINCT FROM false THEN RAISE EXCEPTION 'transcript replay accepted'; END IF;
 IF public.ctf_http_submit_assessment(b,sa,repeat('1',64),facts)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'foreign session grade'; END IF;
 IF public.ctf_http_submit_assessment(a,sa,repeat('2',64),facts)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'foreign grant accepted'; END IF;
 IF public.ctf_http_submit_assessment(a,sa,repeat('1',64),facts||'{"score":6}')->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'client score accepted'; END IF;
 res:=public.ctf_http_submit_assessment(a,sa,repeat('1',64),facts||'{"authorization-denial":200}');
 IF res->>'ok' IS DISTINCT FROM 'true' OR res->>'correct' IS DISTINCT FROM '5' THEN RAISE EXCEPTION 'expected server-computed 5/6'; END IF;
 IF public.ctf_http_submit_assessment(a,sa,repeat('1',64),facts)->>'reason' IS DISTINCT FROM 'already_submitted' THEN RAISE EXCEPTION 'duplicate grade accepted'; END IF;
 IF public.ctf_http_read_assessment(b,sa)->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'cross-account grade read'; END IF;
 IF public.ctf_http_read_assessment(a,sa)->>'correct' IS DISTINCT FROM '5' THEN RAISE EXCEPTION 'owner grade read'; END IF;
 IF public.ctf_http_record_observation(b,sb,repeat('a',64),repeat('c',64),facts) IS DISTINCT FROM true THEN RAISE EXCEPTION 'B observation failed'; END IF;
END $$;
RESET ROLE;
UPDATE public.ctf_range_access_grants SET revoked_at=now() WHERE token_hash=repeat('2',64);
SET LOCAL ROLE service_role;
DO $$
BEGIN
 IF public.ctf_http_submit_assessment('22222222-2222-4222-8222-222222222222','123e4567-e89b-42d3-a456-426614174002',repeat('2',64),
 '{"authorization-denial":403,"unknown-resource":404,"method-restriction":405,"allowed-method":"GET","cache-policy":"no-store","content-sniffing":"nosniff"}')->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'revoked grant accepted'; END IF;
END $$;
RESET ROLE;
DO $$
DECLARE role_name text; tbl text; fun text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH tbl IN ARRAY ARRAY['ctf_http_assessment_policy','ctf_http_assessment_observations','ctf_http_assessment_results'] LOOP
   IF pg_catalog.has_table_privilege(role_name,'public.'||tbl,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'client privilege drift'; END IF;
  END LOOP;
  FOREACH fun IN ARRAY ARRAY['ctf_http_record_observation(uuid,uuid,text,text,jsonb)','ctf_http_submit_assessment(uuid,uuid,text,jsonb)','ctf_http_read_assessment(uuid,uuid)'] LOOP
   IF pg_catalog.has_function_privilege(role_name,'public.'||fun,'EXECUTE') THEN RAISE EXCEPTION 'client RPC privilege drift'; END IF;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM public.ctf_http_assessment_results)<>1 THEN RAISE EXCEPTION 'grade count drift'; END IF;
END $$;
ROLLBACK;
SELECT 'LABS HTTP assessment candidate: simulated ownership, evidence, grant, grading and replay checks passed' AS result;
