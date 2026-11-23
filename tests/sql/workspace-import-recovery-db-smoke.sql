-- Phase 9 disposable PostgreSQL 17 acceptance, executed after all previous Workspace tests.
-- Verifies cross-tab idempotency, immutable batches, exact counts, private
-- deterministic file keys, no replay duplication and owner-only restore.

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);

DO $check$
DECLARE a jsonb;
DECLARE b jsonb;
BEGIN
  a := public.workspace_import_begin(
    repeat('a',64),3,'Recoverable import','Imported from verified backup',2,1,1,1);
  b := public.workspace_import_begin(
    repeat('a',64),3,'Recoverable import','Imported from verified backup',2,1,1,1);
  IF (a->>'reused')::boolean OR NOT (b->>'reused')::boolean
    OR a->>'project_id' <> b->>'project_id'
    OR a->>'session_id' <> b->>'session_id' THEN
    RAISE EXCEPTION 'Repeated source fingerprint created a duplicate project';
  END IF;
  IF (SELECT count(*) FROM public.workspace_projects WHERE name='Recoverable import') <> 1
  THEN RAISE EXCEPTION 'Session begin created duplicate projects'; END IF;
  PERFORM pg_catalog.set_config('test.workspace_import_id',a->>'session_id',false);
  PERFORM pg_catalog.set_config('test.workspace_import_project',a->>'project_id',false);
END;
$check$;

DO $check$
DECLARE sid uuid := pg_catalog.current_setting('test.workspace_import_id')::uuid;
DECLARE result jsonb;
DECLARE replay jsonb;
DECLARE project uuid := pg_catalog.current_setting('test.workspace_import_project')::uuid;
BEGIN
  BEGIN
    PERFORM public.workspace_import_apply_batch(sid,'tasks',1,
      '[{"title":"Skipped index","details":"","status":"todo","priority":"normal","checklist":[]}]'::jsonb);
    RAISE EXCEPTION 'Skipped batch index was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  result := public.workspace_import_apply_batch(sid,'tasks',0,
    '[{"title":"Repeated name","details":"First","status":"done","priority":"high",
       "due_on":null,"checklist":[{"title":"Real step","done":true}]},
      {"title":"Repeated name","details":"Second","status":"todo","priority":"normal",
       "due_on":null,"checklist":[]}]'::jsonb);
  replay := public.workspace_import_apply_batch(sid,'tasks',0,
    '[{"title":"Repeated name","details":"First","status":"done","priority":"high",
       "due_on":null,"checklist":[{"title":"Real step","done":true}]},
      {"title":"Repeated name","details":"Second","status":"todo","priority":"normal",
       "due_on":null,"checklist":[]}]'::jsonb);
  IF result->>'rows' <> '2' OR result->>'steps' <> '1'
    OR (result->>'replayed')::boolean OR NOT (replay->>'replayed')::boolean THEN
    RAISE EXCEPTION 'Task batch receipt or duplicate replay incorrect';
  END IF;
  IF (SELECT count(*) FROM public.workspace_tasks WHERE project_id=project) <> 2
    OR (SELECT count(*) FROM public.workspace_task_steps s
        JOIN public.workspace_tasks t ON t.id=s.task_id
        WHERE t.project_id=project) <> 1 THEN
    RAISE EXCEPTION 'Task batch replay duplicated tasks or checklists';
  END IF;
  BEGIN
    PERFORM public.workspace_import_apply_batch(sid,'tasks',0,
      '[{"title":"Tampered replay","details":"","status":"todo","priority":"normal","checklist":[]}]'::jsonb);
    RAISE EXCEPTION 'Changed replay contents were accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$check$;

DO $check$
DECLARE sid uuid := pg_catalog.current_setting('test.workspace_import_id')::uuid;
DECLARE result jsonb;
DECLARE replay jsonb;
DECLARE project uuid := pg_catalog.current_setting('test.workspace_import_project')::uuid;
BEGIN
  result := public.workspace_import_apply_batch(sid,'items',0,
    '[{"kind":"note","title":"Safety note","note_text":"Actual readings","target_url":null}]'::jsonb);
  replay := public.workspace_import_apply_batch(sid,'items',0,
    '[{"kind":"note","title":"Safety note","note_text":"Actual readings","target_url":null}]'::jsonb);
  IF result->>'rows' <> '1' OR NOT (replay->>'replayed')::boolean
    OR (SELECT count(*) FROM public.workspace_items WHERE project_id=project) <> 1 THEN
    RAISE EXCEPTION 'Saved-item replay duplicated records';
  END IF;
  BEGIN
    PERFORM public.workspace_import_finish(sid);
    RAISE EXCEPTION 'Finish accepted a missing private file';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$check$;

DO $check$
DECLARE sid uuid := pg_catalog.current_setting('test.workspace_import_id')::uuid;
DECLARE project uuid := pg_catalog.current_setting('test.workspace_import_project')::uuid;
DECLARE claim jsonb;
DECLARE replay jsonb;
BEGIN
  claim := public.workspace_import_claim_file(
    sid,0,'proof.txt',12,'text/plain',repeat('a',64));
  replay := public.workspace_import_claim_file(
    sid,0,'proof.txt',12,'text/plain',repeat('a',64));
  IF claim->>'storage_path' <> replay->>'storage_path'
    OR pg_catalog.left(claim->>'storage_path',36) <>
       '22222222-2222-4222-8222-222222222222'
    OR pg_catalog.strpos(claim->>'storage_path',project::text) = 0 THEN
    RAISE EXCEPTION 'Private import file key changed on replay or was not owner-scoped';
  END IF;
  BEGIN
    PERFORM public.workspace_import_claim_file(
      sid,0,'different.txt',12,'text/plain',repeat('a',64));
    RAISE EXCEPTION 'Changed claimed file manifest was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_register_file(sid,0);
    RAISE EXCEPTION 'Unuploaded private file was registered';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO storage.objects(bucket_id,name,metadata)
  VALUES('workspace-private',claim->>'storage_path',
    '{"size":12,"mimetype":"text/plain"}'::jsonb);
  IF NOT public.workspace_import_register_file(sid,0)
    OR NOT public.workspace_import_register_file(sid,0) THEN
    RAISE EXCEPTION 'File registration was not replay safe';
  END IF;
  IF (SELECT count(*) FROM public.workspace_items
    WHERE project_id=project AND kind='file') <> 1 THEN
    RAISE EXCEPTION 'File registration replay created duplicate file rows';
  END IF;
  IF NOT public.workspace_import_finish(sid)
    OR NOT public.workspace_import_finish(sid) THEN
    RAISE EXCEPTION 'Import finish is not idempotent';
  END IF;
  IF (public.workspace_import_status(sid)->>'status') <> 'complete' THEN
    RAISE EXCEPTION 'Completed session did not persist';
  END IF;
  IF (public.workspace_import_begin(
    repeat('a',64),3,'Recoverable import','Imported from verified backup',2,1,1,1)
    ->>'status') <> 'complete' THEN
    RAISE EXCEPTION 'Completed import was not recognized on duplicate file';
  END IF;
END;
$check$;

-- Completing must fail closed on an unfinished second session.
DO $check$
DECLARE sess jsonb;
BEGIN
  sess := public.workspace_import_begin(
    repeat('b',64),1,'Unfinished import','',1,0,0,0);
  BEGIN
    PERFORM public.workspace_import_finish((sess->>'session_id')::uuid);
    RAISE EXCEPTION 'Incomplete session marked complete';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$check$;

-- Alice cannot see or modify Bob's private import state, even with its UUID.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
DO $check$
DECLARE sid uuid := pg_catalog.current_setting('test.workspace_import_id')::uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_import_sessions)
    OR EXISTS(SELECT 1 FROM public.workspace_import_batches)
    OR EXISTS(SELECT 1 FROM public.workspace_import_files) THEN
    RAISE EXCEPTION 'Cross-account import history visible';
  END IF;
  BEGIN
    PERFORM public.workspace_import_status(sid);
    RAISE EXCEPTION 'Alice read Bob private import session';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_apply_batch(sid,'items',1,
      '[{"kind":"note","title":"Cross account","note_text":"No","target_url":null}]'::jsonb);
    RAISE EXCEPTION 'Alice modified Bob import session';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$check$;
DO $check$
BEGIN
  RAISE NOTICE 'Phase 9 resumable Workspace import: idempotency, file claims, receipts, exact quotas and owner RLS passed';
END;
$check$;
