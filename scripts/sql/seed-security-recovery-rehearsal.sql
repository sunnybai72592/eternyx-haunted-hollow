-- Disposable PostgreSQL only, following the Wave 20 synthetic session harness.
\set ON_ERROR_STOP on
CREATE ROLE service_role NOLOGIN BYPASSRLS;
\ir staged-security-evidence-controls.sql
\ir staged-security-evidence-global-budget.sql
\ir staged-security-evidence-gateway.sql
SET ROLE service_role;
DO $$
BEGIN
 IF public.security_evidence_gateway_reserve_v2('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',3)<>'reserved' THEN RAISE EXCEPTION 'seed reservation failed'; END IF;
END $$;
INSERT INTO public.security_evidence_gateway_digests(storage_path,owner_id,byte_count,sha256)
VALUES('20000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000001/fixture.txt','20000000-0000-4000-8000-000000000002',3,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
RESET ROLE;
-- Restore verification must preserve the pre-backup revocation of A.
-- Add an unrelated object owned by B to prove policy scope after restore.
INSERT INTO storage.objects VALUES ('unrelated','20000000-0000-4000-8000-000000000002');
INSERT INTO storage.objects VALUES ('pentest-evidence','20000000-0000-4000-8000-000000000002');
SELECT 'Synthetic recovery baseline initialized' AS result;
