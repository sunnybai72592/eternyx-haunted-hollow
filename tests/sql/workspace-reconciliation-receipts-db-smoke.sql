-- Phase 14 disposable PostgreSQL acceptance, after Workspace Phase 11.
-- A receipt proves server-recorded *preparation metadata*, not download or
-- server-authenticated file contents.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',false);

DO $test$
DECLARE
  sid uuid;
  pid uuid;
  first_result jsonb;
  replay_result jsonb;
  digest text := repeat('a',64);
  payload text := repeat('b',64);
BEGIN
  SELECT id,project_id INTO sid,pid FROM public.workspace_import_sessions
    WHERE owner_id=auth.uid() AND source_sha256=repeat('f',64);
  IF sid IS NULL THEN RAISE EXCEPTION 'Missing Phase 11 private import fixture'; END IF;
  first_result:=public.workspace_reconciliation_record(
    sid,repeat('f',64),repeat('c',64),digest,payload,1,1,1,0,2,1);
  replay_result:=public.workspace_reconciliation_record(
    sid,repeat('f',64),repeat('c',64),digest,payload,1,1,1,0,2,1);
  IF first_result->>'reused'<>'false'
    OR replay_result->>'reused'<>'true'
    OR first_result->>'receipt_id'<>replay_result->>'receipt_id'
    OR first_result->>'project_id'<>pid::text THEN
    RAISE EXCEPTION 'Preparation receipt identity/replay not idempotent';
  END IF;
  IF (SELECT count(*) FROM public.workspace_reconciliation_receipts
    WHERE owner_id=auth.uid() AND archive_sha256=digest)<>1 THEN
    RAISE EXCEPTION 'Duplicate browser retry created multiple journal rows';
  END IF;
  PERFORM pg_catalog.set_config('test.p14_bob_receipt',
    first_result->>'receipt_id',false);
  PERFORM pg_catalog.set_config('test.p14_bob_session',sid::text,false);
  BEGIN
    PERFORM public.workspace_reconciliation_record(
      sid,repeat('f',64),repeat('c',64),digest,repeat('e',64),1,1,1,0,2,1);
    RAISE EXCEPTION 'Conflicting replay digest was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_reconciliation_record(
      sid,repeat('e',64),repeat('c',64),repeat('d',64),payload,1,0,0,0,1,0);
    RAISE EXCEPTION 'Wrong original source SHA-256 was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_reconciliation_record(
      sid,repeat('f',64),repeat('c',64),repeat('d',64),payload,1000,1,0,0,1,0);
    RAISE EXCEPTION 'Over-cap task count was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_reconciliation_record(
      sid,repeat('f',64),repeat('c',64),repeat('d',64),payload,0,0,0,0,0,0);
    RAISE EXCEPTION 'Empty unreviewed receipt was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_reconciliation_record(
      sid,repeat('f',64),repeat('c',64),repeat('d',64),payload,1,0,0,0,31,0);
    RAISE EXCEPTION 'Over-cap checklist count was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.workspace_reconciliation_receipts
      SET archive_sha256=repeat('e',64)
      WHERE id=(first_result->>'receipt_id')::uuid;
    RAISE EXCEPTION 'Browser could directly edit immutable receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.workspace_reconciliation_receipts
      WHERE id=(first_result->>'receipt_id')::uuid;
    RAISE EXCEPTION 'Browser could delete immutable receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;

-- Another authenticated account cannot read or forge Bob's receipts,
-- even when it knows the original import session UUID.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',false);
DO $test$
DECLARE
  sid uuid:=pg_catalog.current_setting('test.p14_bob_session')::uuid;
  receipt uuid:=pg_catalog.current_setting('test.p14_bob_receipt')::uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_reconciliation_receipts
    WHERE id=receipt) THEN RAISE EXCEPTION 'Foreign receipt visible'; END IF;
  BEGIN
    PERFORM public.workspace_reconciliation_record(
      sid,repeat('f',64),repeat('c',64),repeat('d',64),repeat('e',64),1,0,0,0,0,0);
    RAISE EXCEPTION 'Cross-owner preparation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.workspace_reconciliation_receipts (
      owner_id,source_session_id,source_project_id,
      source_sha256,snapshot_sha256,archive_sha256,payload_sha256,
      source_tasks,current_tasks,source_items,current_items,checklist_steps,excluded_files
    ) VALUES (
      auth.uid(),sid,'22222222-2222-4222-8222-222222222222',
      repeat('f',64),repeat('c',64),repeat('d',64),repeat('e',64),
      1,0,0,0,0,0
    );
    RAISE EXCEPTION 'Browser could bypass append-only RPC with direct insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;

DO $test$
BEGIN
  RAISE NOTICE 'Phase 14: owner-only immutable receipts, archive retry idempotency, source binding, quotas and private RLS pass';
END;
$test$;
