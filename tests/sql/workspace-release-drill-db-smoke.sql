-- Phase 16 complete import/recovery DRILL on a disposable, network-isolated
-- PostgreSQL fixture. Synthetic Storage objects contain metadata ONLY:
-- no claim here that this validates real Supabase Storage byte integrity,
-- live staging migration status or a real browser-authenticated restore.
-- Run AFTER all Phase 14 Workspace acceptance tests.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);

DO $drill$
DECLARE
  begin_receipt jsonb;
  resumed jsonb;
  sid uuid;
  pid uuid;
  task_receipt jsonb;
  note_receipt jsonb;
  claim jsonb;
  check_receipt jsonb;
BEGIN
  begin_receipt:=public.workspace_import_begin(
    repeat('7',64),3,'P16 synthetic rescue','Disposable integration only',2,2,2,1);
  resumed:=public.workspace_import_begin(
    repeat('7',64),3,'P16 synthetic rescue','Disposable integration only',2,2,2,1);
  sid:=(begin_receipt->>'session_id')::uuid;
  pid:=(begin_receipt->>'project_id')::uuid;
  PERFORM pg_catalog.set_config('test.p16_sid',sid::text,false);
  PERFORM pg_catalog.set_config('test.p16_pid',pid::text,false);
  IF (begin_receipt->>'reused')::boolean
    OR NOT (resumed->>'reused')::boolean
    OR resumed->>'session_id'<>begin_receipt->>'session_id' THEN
    RAISE EXCEPTION 'Phase16 duplicate source created another import session';
  END IF;
  task_receipt:=public.workspace_import_apply_batch(sid,'tasks',0,
    '[{"title":"Original row A","details":"Measured at 08:00",
       "status":"done","priority":"high","due_on":null,
       "checklist":[{"title":"Shunt checked","done":true}]},
      {"title":"Original row B","details":"Readings",
       "status":"todo","priority":"normal","due_on":null,
       "checklist":[{"title":"Check IR drop","done":false}]}]'::jsonb);
  IF task_receipt->>'rows'<>'2' OR task_receipt->>'steps'<>'2'
    OR (public.workspace_import_apply_batch(sid,'tasks',0,
      '[{"title":"Original row A","details":"Measured at 08:00",
         "status":"done","priority":"high","due_on":null,
         "checklist":[{"title":"Shunt checked","done":true}]},
        {"title":"Original row B","details":"Readings",
         "status":"todo","priority":"normal","due_on":null,
         "checklist":[{"title":"Check IR drop","done":false}]}]'::jsonb)->>'replayed')<>'true'
  THEN RAISE EXCEPTION 'Phase16 task/step batch did not replay exactly'; END IF;
  note_receipt:=public.workspace_import_apply_batch(sid,'items',0,
    '[{"kind":"note","title":"Readings","note_text":"Private sample","target_url":null},
      {"kind":"link","title":"Guide","note_text":null,"target_url":"https://example.org/guide"}]'::jsonb);
  IF note_receipt->>'rows'<>'2' THEN
    RAISE EXCEPTION 'Phase16 item records not committed';
  END IF;
  IF (public.workspace_import_status(sid)->>'status')<>'active' THEN
    RAISE EXCEPTION 'Phase16 in-progress restore was prematurely finished';
  END IF;
  BEGIN
    PERFORM public.workspace_import_finish(sid);
    RAISE EXCEPTION 'Phase16 finalize allowed without promised private file';
  EXCEPTION WHEN check_violation THEN NULL; END;
  claim:=public.workspace_import_claim_file(sid,0,'verify.txt',5,'text/plain',repeat('c',64));
  IF claim->>'storage_path' IS NULL THEN
    RAISE EXCEPTION 'Phase16 synthetic file claim lost its path';
  END IF;
  -- Isolated fake Storage.metadata entry; NOT real bytes or a real Storage upload.
  INSERT INTO storage.objects(bucket_id,name,metadata)
  VALUES('workspace-private',claim->>'storage_path',
    '{"size":5,"mimetype":"text/plain"}'::jsonb);
  IF NOT public.workspace_import_register_file(sid,0)
    OR NOT public.workspace_import_register_file(sid,0) THEN
    RAISE EXCEPTION 'Phase16 file claim registration not idempotent';
  END IF;
  IF NOT public.workspace_import_finish(sid) THEN
    RAISE EXCEPTION 'Phase16 valid complete import did not finish';
  END IF;
  check_receipt:=public.workspace_import_inspect(sid);
  IF check_receipt->>'status'<>'complete'
    OR (check_receipt->>'actual_tasks')::integer<>2
    OR (check_receipt->>'actual_steps')::integer<>2
    OR (check_receipt->>'actual_items')::integer<>3
    OR (check_receipt->>'committed_files')::integer<>1
    OR (public.workspace_import_integrity(sid)->>'content_matches')<>'true'
    OR (public.workspace_import_status(sid)->>'files')<>'1' THEN
    RAISE EXCEPTION 'Phase16 final server receipts disagree with saved records: %',check_receipt;
  END IF;
  IF (SELECT count(*) FROM public.workspace_tasks WHERE project_id=pid)<>2
    OR (SELECT count(*) FROM public.workspace_task_steps
        WHERE owner_id=auth.uid() AND task_id IN (
          SELECT id FROM public.workspace_tasks WHERE project_id=pid))<>2
    OR (SELECT count(*) FROM public.workspace_items WHERE project_id=pid)<>3 THEN
    RAISE EXCEPTION 'Phase16 actual saved task/note/file totals mismatch';
  END IF;
END;
$drill$;

-- A partially restored project with user edits MUST remain recoverable
-- only through explicit review, never silent re-import or overwrite.
DO $drill$
DECLARE
  receipt jsonb;
  sid uuid;
  pid uuid;
BEGIN
  receipt:=public.workspace_import_begin(
    repeat('8',64),3,'P16 interrupted','Protect human edited record',2,0,0,0);
  sid:=(receipt->>'session_id')::uuid;
  pid:=(receipt->>'project_id')::uuid;
  PERFORM pg_catalog.set_config('test.p16_partial',sid::text,false);
  PERFORM public.workspace_import_apply_batch(sid,'tasks',0,
    '[{"title":"Editable","details":"Initial","status":"todo","priority":"normal",
      "due_on":null,"checklist":[]}]'::jsonb);
  IF NOT public.workspace_import_set_hold(sid,true,'Preserve authored changes') THEN
    RAISE EXCEPTION 'Phase16 hold failed';
  END IF;
  BEGIN
    PERFORM public.workspace_import_apply_batch(sid,'tasks',1,
      '[{"title":"Other","details":"","status":"todo","priority":"normal","checklist":[]}]'::jsonb);
    RAISE EXCEPTION 'Phase16 held import accepted another batch';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.workspace_tasks SET details='Human edited, keep this'
    WHERE project_id=pid AND title='Editable';
  IF (public.workspace_import_integrity(sid)->>'content_matches')<>'false' THEN
    RAISE EXCEPTION 'Phase16 edited data not detected as drift';
  END IF;
  BEGIN
    PERFORM public.workspace_import_set_hold(sid,false,'');
    RAISE EXCEPTION 'Phase16 manual edit was released into unsafe re-import';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_tasks
    WHERE project_id=pid AND details='Human edited, keep this')
    OR (public.workspace_import_inspect(sid)->>'status')<>'held' THEN
    RAISE EXCEPTION 'Phase16 interrupted project edits were not protected';
  END IF;
END;
$drill$;

-- Account isolation in the SAME fake DB after integration fixture creation.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
DO $drill$
DECLARE
  sid uuid:=pg_catalog.current_setting('test.p16_sid')::uuid;
  partial uuid:=pg_catalog.current_setting('test.p16_partial')::uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_import_sessions
    WHERE id IN(sid,partial)) OR EXISTS(
      SELECT 1 FROM public.workspace_import_files WHERE session_id=sid
    ) THEN RAISE EXCEPTION 'Phase16 cross-owner records exposed'; END IF;
  BEGIN
    PERFORM public.workspace_import_integrity(sid);
    RAISE EXCEPTION 'Phase16 other owner inspected restored account data';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_set_hold(partial,false,'');
    RAISE EXCEPTION 'Phase16 foreign owner released held recovery project';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_status(sid);
    RAISE EXCEPTION 'Phase16 foreign owner read private import receipts';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$drill$;
DO $drill$
BEGIN
 RAISE NOTICE 'Workspace Phase 16 synthetic end-to-end fixture passed: create/batch/replay/file metadata/finish/drift/hold/ownership';
END;
$drill$;
