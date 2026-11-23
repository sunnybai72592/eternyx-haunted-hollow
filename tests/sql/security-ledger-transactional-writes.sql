-- Wave 12: TWO-account transactional staging WRITE ACCEPTANCE.
-- Use ONLY through the guarded operator script against isolated staging, or in networkless CI.
-- Real SQL writes occur temporarily and are always ROLLBACK; psql exits on failure
-- and PostgreSQL discards an unfinished transaction when that session closes.
-- Requires two separate existing auth.users IDs supplied via validated psql -v variables.
\set ON_ERROR_STOP on
\if :{?actor_a}
\else
  \echo 'BLOCKED: actor_a required'
  \quit 2
\endif
\if :{?actor_b}
\else
  \echo 'BLOCKED: actor_b required'
  \quit 2
\endif
BEGIN;
SET LOCAL statement_timeout='10000ms';
SET LOCAL lock_timeout='3000ms';
SELECT set_config('eternyx.wave12.actor_a', :'actor_a', false) AS stored_a \gset
SELECT set_config('eternyx.wave12.actor_b', :'actor_b', false) AS stored_b \gset
-- Confirm actors exist before creating any new case data.
DO $check$
BEGIN
  IF (SELECT count(DISTINCT id) FROM auth.users
       WHERE id IN (current_setting('eternyx.wave12.actor_a')::uuid, current_setting('eternyx.wave12.actor_b')::uuid)) <> 2 THEN
    RAISE EXCEPTION 'Both test accounts must exist in auth.users';
  END IF;
END
$check$;
-- Positive account A: engagement + scoped asset + finding + history.
SELECT set_config('request.jwt.claim.sub', :'actor_a', false) AS session_set \gset
SET ROLE authenticated;
INSERT INTO public.pentest_engagements
 (owner_id,engagement_name,scope_targets,excluded_targets,permitted_methods,
  status,authorization_attested,authorization_attested_at)
VALUES (:'actor_a'::uuid,'Wave 12 isolated transient A test',
 ARRAY['wave12-owner-a.example.test','wave12-excluded.example.test']::text[],
 ARRAY['wave12-excluded.example.test']::text[],ARRAY['passive review']::text[],
 'authorized',true,now())
RETURNING id AS eng_a \gset
SELECT set_config('eternyx.wave12.eng_a', :'eng_a', false) AS saved_eng_a \gset
INSERT INTO public.security_case_assets (owner_id,engagement_id,target,steward)
VALUES (:'actor_a'::uuid,:'eng_a'::uuid,'wave12-owner-a.example.test','Wave12-A')
RETURNING id AS asset_a \gset
SELECT set_config('eternyx.wave12.asset_a', :'asset_a', false) AS saved_asset_a \gset
INSERT INTO public.security_case_findings
 (owner_id,engagement_id,asset_id,title,severity,evidence,recommendation,status)
VALUES (:'actor_a'::uuid,:'eng_a'::uuid,:'asset_a'::uuid,
 'Wave 12 synthetic header review','high','Synthetic offline evidence text',
 'Add a safe synthetic security control','open')
RETURNING id AS finding_a \gset
SELECT set_config('eternyx.wave12.finding_a', :'finding_a', false) AS saved_finding_a \gset
UPDATE public.security_case_findings
 SET status='in-progress' WHERE id=:'finding_a'::uuid;
-- Assert A's synthetic record and two trigger-written audit changes.
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.security_case_finding_history
       WHERE finding_id=current_setting('eternyx.wave12.finding_a')::uuid)<>2 THEN
  RAISE EXCEPTION 'Missing two trigger-written history events for owner A';
 END IF;
 IF EXISTS(SELECT 1 FROM public.security_case_finding_history
    WHERE finding_id=current_setting('eternyx.wave12.finding_a')::uuid AND actor_id IS DISTINCT FROM current_setting('eternyx.wave12.actor_a')::uuid)
 THEN RAISE EXCEPTION 'Finding audit actor differs from verified principal'; END IF;
 -- Out of scope and explicitly excluded assets must fail with security error.
 BEGIN
   INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
   VALUES(current_setting('eternyx.wave12.actor_a')::uuid,current_setting('eternyx.wave12.eng_a')::uuid,'wave12-excluded.example.test');
   RAISE EXCEPTION 'Accepted explicitly excluded target';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
   VALUES(current_setting('eternyx.wave12.actor_a')::uuid,current_setting('eternyx.wave12.eng_a')::uuid,'wave12-out-of-scope.example.test');
   RAISE EXCEPTION 'Accepted undeclared scope target';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Invalid status transitions require real evidence/approval (not just a UI toggle).
 BEGIN
   UPDATE public.security_case_findings SET status='verified'
    WHERE id=current_setting('eternyx.wave12.finding_a')::uuid;
   RAISE EXCEPTION 'Verified finding without retest evidence';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   UPDATE public.security_case_findings SET status='accepted'
    WHERE id=current_setting('eternyx.wave12.finding_a')::uuid;
   RAISE EXCEPTION 'Accepted risk without formal human approval note';
 EXCEPTION WHEN check_violation THEN NULL; END;
 -- Audit is not user-writable or removable.
 IF has_table_privilege('authenticated','public.security_case_finding_history','INSERT')
 OR has_table_privilege('authenticated','public.security_case_finding_history','UPDATE')
 OR has_table_privilege('authenticated','public.security_case_finding_history','DELETE')
 THEN RAISE EXCEPTION 'Finding history write privileges available'; END IF;
 IF has_table_privilege('authenticated','public.pentest_audit_events','INSERT')
 OR has_table_privilege('authenticated','public.pentest_audit_events','UPDATE')
 OR has_table_privilege('authenticated','public.pentest_audit_events','DELETE')
 THEN RAISE EXCEPTION 'Pentest audit log write privileges available'; END IF;
END
$test$;
-- Positive account B and cross-tenant denied write/read.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'actor_b', false) AS session_set \gset
SET ROLE authenticated;
INSERT INTO public.pentest_engagements
 (owner_id,engagement_name,scope_targets,excluded_targets,permitted_methods,
  status,authorization_attested,authorization_attested_at)
VALUES (:'actor_b'::uuid,'Wave 12 isolated transient B test',
 ARRAY['wave12-owner-b.example.test']::text[],ARRAY[]::text[],
 ARRAY['passive review']::text[],'authorized',true,now())
RETURNING id AS eng_b \gset
SELECT set_config('eternyx.wave12.eng_b', :'eng_b', false) AS saved_eng_b \gset
INSERT INTO public.security_case_assets(owner_id,engagement_id,target,steward)
VALUES (:'actor_b'::uuid,:'eng_b'::uuid,'wave12-owner-b.example.test','Wave12-B')
RETURNING id AS asset_b \gset
SELECT set_config('eternyx.wave12.asset_b', :'asset_b', false) AS saved_asset_b \gset
DO $test$
DECLARE changed integer;
BEGIN
 IF EXISTS (SELECT 1 FROM public.security_case_assets WHERE id=current_setting('eternyx.wave12.asset_a')::uuid)
 OR EXISTS (SELECT 1 FROM public.security_case_findings WHERE id=current_setting('eternyx.wave12.finding_a')::uuid)
 OR EXISTS (SELECT 1 FROM public.security_case_finding_history
             WHERE finding_id=current_setting('eternyx.wave12.finding_a')::uuid) THEN
  RAISE EXCEPTION 'B sees private A security data'; END IF;
 UPDATE public.security_case_findings SET recommendation='B tampered'
 WHERE id=current_setting('eternyx.wave12.finding_a')::uuid;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'B updated another owner finding'; END IF;
 UPDATE public.security_case_assets SET steward='B tampered'
 WHERE id=current_setting('eternyx.wave12.asset_a')::uuid;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'B updated another owner asset'; END IF;
 BEGIN
  INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
   VALUES(current_setting('eternyx.wave12.actor_b')::uuid,current_setting('eternyx.wave12.eng_a')::uuid,'wave12-owner-a.example.test');
  RAISE EXCEPTION 'B reused another owner engagement';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.security_case_findings(owner_id,engagement_id,asset_id,title)
   VALUES(current_setting('eternyx.wave12.actor_b')::uuid,current_setting('eternyx.wave12.eng_b')::uuid,current_setting('eternyx.wave12.asset_a')::uuid,'Cross-owner asset reference');
  RAISE EXCEPTION 'B linked foreign asset to own finding';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
   VALUES(current_setting('eternyx.wave12.actor_a')::uuid,current_setting('eternyx.wave12.eng_a')::uuid,'wave12-owner-a.example.test');
  RAISE EXCEPTION 'B impersonated owner A';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$test$;
-- Revoke A's attestation within same transaction and test stale authorization.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'actor_a', false) AS session_set \gset
SET ROLE authenticated;
UPDATE public.pentest_engagements
 SET status='draft', authorization_attested=false, authorization_attested_at=NULL
 WHERE id=:'eng_a'::uuid;
DO $test$
BEGIN
 BEGIN
   UPDATE public.security_case_findings
      SET recommendation='Attempted after revocation'
    WHERE id=current_setting('eternyx.wave12.finding_a')::uuid;
   RAISE EXCEPTION 'Revoked engagement still allowed finding edits';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE public.security_case_assets
      SET steward='Attempted after revocation'
    WHERE id=current_setting('eternyx.wave12.asset_a')::uuid;
   RAISE EXCEPTION 'Revoked engagement still allowed asset edits';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO public.security_case_assets(owner_id,engagement_id,target)
   VALUES(current_setting('eternyx.wave12.actor_a')::uuid,current_setting('eternyx.wave12.eng_a')::uuid,'wave12-owner-a.example.test');
   RAISE EXCEPTION 'Revoked scope allowed asset insertion';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$test$;
-- B's own attested scope is unaffected by A revocation.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'actor_b', false) AS session_set \gset
SET ROLE authenticated;
UPDATE public.security_case_assets SET steward='Still-authorized-B'
 WHERE id=:'asset_b'::uuid;
DO $test$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.security_case_assets
     WHERE id=current_setting('eternyx.wave12.asset_b')::uuid AND steward='Still-authorized-B')
 THEN RAISE EXCEPTION 'A revocation incorrectly changed B authorization'; END IF;
END
$test$;
RESET ROLE;
-- All created engagement, asset, finding, and audit objects are discarded.
ROLLBACK;
-- psql variables survive the rollback; recreate session-only ID settings for verification.
SELECT set_config('eternyx.wave12.eng_a', :'eng_a', false) AS restored_eng_a \gset
SELECT set_config('eternyx.wave12.eng_b', :'eng_b', false) AS restored_eng_b \gset
SELECT set_config('eternyx.wave12.asset_a', :'asset_a', false) AS restored_asset_a \gset
SELECT set_config('eternyx.wave12.asset_b', :'asset_b', false) AS restored_asset_b \gset
SELECT set_config('eternyx.wave12.finding_a', :'finding_a', false) AS restored_finding_a \gset
BEGIN TRANSACTION READ ONLY;
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM public.pentest_engagements
        WHERE id IN(current_setting('eternyx.wave12.eng_a')::uuid,current_setting('eternyx.wave12.eng_b')::uuid))
 OR EXISTS(SELECT 1 FROM public.security_case_assets
        WHERE id IN(current_setting('eternyx.wave12.asset_a')::uuid,current_setting('eternyx.wave12.asset_b')::uuid))
 OR EXISTS(SELECT 1 FROM public.security_case_findings WHERE id=current_setting('eternyx.wave12.finding_a')::uuid)
 OR EXISTS(SELECT 1 FROM public.security_case_finding_history
        WHERE finding_id=current_setting('eternyx.wave12.finding_a')::uuid)
 OR EXISTS(SELECT 1 FROM public.pentest_audit_events
        WHERE engagement_id IN(current_setting('eternyx.wave12.eng_a')::uuid,current_setting('eternyx.wave12.eng_b')::uuid))
 THEN RAISE EXCEPTION 'Wave 12 transactional test records persisted after ROLLBACK'; END IF;
END
$verify$;
COMMIT;
SELECT 'PASS: Wave 12 two-role transactional writes, revocation and rollback' AS result;
