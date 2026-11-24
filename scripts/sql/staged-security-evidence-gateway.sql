-- CUTOVER CANDIDATE ONLY: apply after gateway and authenticated UI acceptance.
-- Blocks all ordinary-role direct Storage operations on the evidence bucket.
-- The gateway's isolated privileged Storage client is the only byte path.
BEGIN;
CREATE POLICY wave22_mediated_evidence_only ON storage.objects
 AS RESTRICTIVE FOR ALL TO anon, authenticated
 USING (bucket_id <> 'pentest-evidence')
 WITH CHECK (bucket_id <> 'pentest-evidence');
COMMIT;
