-- Operator-only read-only summary. No identifiers, paths, digests or evidence bytes.
BEGIN TRANSACTION READ ONLY;
SELECT
 (SELECT count(*) FROM public.pentest_evidence) AS registered_records,
 (SELECT count(*) FROM storage.objects WHERE bucket_id='pentest-evidence') AS storage_objects,
 (SELECT count(*) FROM public.security_evidence_gateway_digests) AS digest_records,
 (SELECT count(*) FROM public.pentest_evidence e WHERE NOT EXISTS
   (SELECT 1 FROM storage.objects o WHERE o.bucket_id='pentest-evidence' AND o.name=e.storage_path)) AS missing_objects,
 (SELECT count(*) FROM public.pentest_evidence e WHERE NOT EXISTS
   (SELECT 1 FROM public.security_evidence_gateway_digests d WHERE d.storage_path=e.storage_path AND d.owner_id=e.owner_id AND d.byte_count=e.file_size)) AS unsealed_or_mismatched_records,
 (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='pentest-evidence' AND NOT EXISTS
   (SELECT 1 FROM public.pentest_evidence e WHERE e.storage_path=o.name)) AS unregistered_objects,
 (SELECT count(*) FROM public.security_evidence_gateway_digests d WHERE NOT EXISTS
   (SELECT 1 FROM public.pentest_evidence e WHERE e.storage_path=d.storage_path)) AS unregistered_seals,
 (SELECT count(*) FROM public.security_evidence_gateway_receipts) AS retained_reservations;
-- Structural checks only; do not interpret a matching digest row as verified bytes.
SELECT count(*) AS owners_charged_today,coalesce(sum(daily_requests),0) AS owner_requests_today,
 coalesce(sum(daily_bytes),0) AS owner_bytes_today
 FROM public.security_evidence_gateway_budget WHERE day_utc=(statement_timestamp() AT TIME ZONE 'UTC')::date;
COMMIT;
