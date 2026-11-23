-- Offline, synthetic, transactional security-case ledger acceptance.
-- USE ONLY inside isolated networkless CI PostgreSQL; all test rows ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

INSERT INTO public.pentest_engagements
 (id, owner_id, engagement_name, scope_targets, excluded_targets, permitted_methods,
  status, authorization_attested, authorization_attested_at)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
  'Offline owner A security scope', ARRAY['scope.example.test','excluded.example.test'],
  ARRAY['excluded.example.test'], ARRAY['passive review'], 'authorized', true, now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
  'Offline owner B security scope', ARRAY['other.example.test'],
  '{}'::text[], ARRAY['passive review'], 'authorized', true, now());

INSERT INTO storage.objects (bucket_id,name) VALUES
 ('pentest-evidence','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a-proof.txt'),
 ('pentest-evidence','22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b-proof.txt');
INSERT INTO public.pentest_evidence
 (id,owner_id,engagement_id,storage_path,file_name,mime_type,file_size,description)
VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a-proof.txt',
  'a-proof.txt','text/plain',16,'Offline A evidence'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b-proof.txt',
  'b-proof.txt','text/plain',16,'Offline B evidence');

-- Actual non-superuser RLS is evaluated with SET ROLE authenticated.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;

INSERT INTO public.security_case_assets (owner_id,engagement_id,target,steward,criticality)
VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'scope.example.test','AppSec','high')
RETURNING id AS asset_a_id \gset
SELECT set_config('eternyx.fixture_asset_id', :'asset_a_id', false);

DO $assert$
BEGIN
  BEGIN
    INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
    VALUES('11111111-1111-4111-8111-111111111111',
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','excluded.example.test');
    RAISE EXCEPTION 'FAILED: excluded asset was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
    VALUES('11111111-1111-4111-8111-111111111111',
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','out-of-scope.test');
    RAISE EXCEPTION 'FAILED: out of scope asset was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END
$assert$;

INSERT INTO public.security_case_findings
(owner_id,engagement_id,asset_id,title,severity,evidence,recommendation,remediation_owner,status)
VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       current_setting('eternyx.fixture_asset_id')::uuid, 'Offline permission regression',
       'high','Header absent in synthetic offline configuration',
       'Configure the header','Test owner','open')
RETURNING id AS finding_a_id \gset
SELECT set_config('eternyx.fixture_finding_id', :'finding_a_id',false);

DO $assert$
BEGIN
  BEGIN
    UPDATE public.security_case_findings SET status='verified'
    WHERE id=current_setting('eternyx.fixture_finding_id')::uuid;
    RAISE EXCEPTION 'FAILED: verified allowed without retest evidence';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.security_case_findings SET status='accepted'
    WHERE id=current_setting('eternyx.fixture_finding_id')::uuid;
    RAISE EXCEPTION 'FAILED: accepted allowed without risk-owner approval';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$assert$;

UPDATE public.security_case_findings SET status='in-progress'
 WHERE id=current_setting('eternyx.fixture_finding_id')::uuid;

INSERT INTO public.security_case_finding_evidence
 (owner_id,engagement_id,finding_id,evidence_id)
VALUES('11111111-1111-4111-8111-111111111111',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       current_setting('eternyx.fixture_finding_id')::uuid,
       'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1');

DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.security_case_finding_history
      WHERE finding_id=current_setting('eternyx.fixture_finding_id')::uuid) <> 3 THEN
    RAISE EXCEPTION 'FAILED: missing trigger-written create/update/evidence history';
  END IF;
  IF EXISTS (SELECT 1 FROM public.security_case_finding_history
     WHERE actor_id IS DISTINCT FROM (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'FAILED: history actor not linked to authenticated identity';
  END IF;
  IF has_table_privilege('authenticated','public.security_case_finding_history','INSERT')
     OR has_table_privilege('authenticated','public.security_case_finding_history','UPDATE')
     OR has_table_privilege('authenticated','public.security_case_finding_history','DELETE') THEN
    RAISE EXCEPTION 'FAILED: authenticated role can mutate immutable history';
  END IF;
  IF has_column_privilege('authenticated','public.security_case_findings','owner_id','UPDATE')
     OR has_column_privilege('authenticated','public.security_case_findings','engagement_id','UPDATE')
     OR has_column_privilege('authenticated','public.security_case_findings','asset_id','UPDATE') THEN
    RAISE EXCEPTION 'FAILED: authenticated role can change a finding ownership key';
  END IF;
  BEGIN
    INSERT INTO public.security_case_finding_evidence
      (owner_id,engagement_id,finding_id,evidence_id)
    VALUES('11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      current_setting('eternyx.fixture_finding_id')::uuid,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2');
    RAISE EXCEPTION 'FAILED: cross-owner private evidence link was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END
$assert$;

-- B cannot read, update or cross-link A's assets, findings, evidence or history.
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $assert$
DECLARE affected integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.security_case_assets WHERE owner_id='11111111-1111-4111-8111-111111111111')
    OR EXISTS(SELECT 1 FROM public.security_case_findings WHERE owner_id='11111111-1111-4111-8111-111111111111')
    OR EXISTS(SELECT 1 FROM public.security_case_finding_evidence WHERE owner_id='11111111-1111-4111-8111-111111111111')
    OR EXISTS(SELECT 1 FROM public.security_case_finding_history WHERE owner_id='11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'FAILED: cross-user security-case data is visible';
  END IF;
  UPDATE public.security_case_findings SET status='blocked'
   WHERE id=current_setting('eternyx.fixture_finding_id')::uuid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'FAILED: cross-owner finding was updated'; END IF;
  BEGIN
    INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
    VALUES('22222222-2222-4222-8222-222222222222',
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','scope.example.test');
    RAISE EXCEPTION 'FAILED: another owner engagement was reused';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END
$assert$;

INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
VALUES('22222222-2222-4222-8222-222222222222',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other.example.test')
RETURNING id AS asset_b_id \gset

DO $assert$
BEGIN
  BEGIN
    INSERT INTO public.security_case_findings(owner_id,engagement_id,asset_id,title)
    VALUES('22222222-2222-4222-8222-222222222222',
           'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
           current_setting('eternyx.fixture_asset_id')::uuid,'Cross-tenant foreign asset');
    RAISE EXCEPTION 'FAILED: cross-owner asset reference accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END
$assert$;

SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $assert$
BEGIN
  IF EXISTS(SELECT 1 FROM public.security_case_assets
    WHERE owner_id='22222222-2222-4222-8222-222222222222') THEN
    RAISE EXCEPTION 'FAILED: owner A can see B assets';
  END IF;
END
$assert$;

-- Revoking attestation must stop writes even for an asset that already exists.
RESET ROLE;
UPDATE public.pentest_engagements
SET status='draft', authorization_attested=false, authorization_attested_at=NULL
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
DO $assert$
BEGIN
  BEGIN
    UPDATE public.security_case_findings SET recommendation='Changed after scope revocation'
     WHERE id=current_setting('eternyx.fixture_finding_id')::uuid;
    RAISE EXCEPTION 'FAILED: stale authorized scope permitted a finding update';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END
$assert$;

RESET ROLE;
ROLLBACK;
SELECT 'PASS: rolled-back, two-account PostgreSQL RLS and remediation history acceptance' AS result;
