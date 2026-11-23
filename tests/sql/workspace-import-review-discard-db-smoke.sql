-- Phase 10: run against disposable PostgreSQL AFTER Phase 9 tests.
-- Nothing in these tests or code deletes private Storage files by SQL.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);

DO $check$
DECLARE
  complete_id uuid;
  inspection jsonb;
BEGIN
  SELECT id INTO complete_id FROM public.workspace_import_sessions
    WHERE owner_id=auth.uid() AND source_sha256=repeat('a',64);
  inspection := public.workspace_import_inspect(complete_id);
  IF inspection->>'status' <> 'complete'
    OR (inspection->>'committed_tasks')::integer <> 2
    OR (inspection->>'actual_tasks')::integer <> 2
    OR (inspection->>'committed_steps')::integer <> 1
    OR (inspection->>'stored_objects')::integer <> 1
    OR inspection->>'can_prepare_discard' <> 'false'
    OR inspection->>'can_finalize_discard' <> 'false' THEN
    RAISE EXCEPTION 'Completed import status inspection was incorrect: %',inspection;
  END IF;
  BEGIN
    PERFORM public.workspace_import_prepare_discard(complete_id);
    RAISE EXCEPTION 'Completed import was improperly discarded';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_cancel_discard(complete_id);
    RAISE EXCEPTION 'Completed import was improperly unsealed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$check$;

DO $check$
DECLARE
  unfinished uuid;
  project uuid;
  inspection jsonb;
  reused jsonb;
BEGIN
  SELECT id,project_id INTO unfinished,project FROM public.workspace_import_sessions
    WHERE owner_id=auth.uid() AND source_sha256=repeat('b',64);
  inspection := public.workspace_import_inspect(unfinished);
  IF inspection->>'can_prepare_discard' <> 'true'
    OR (inspection->>'file_claims')::integer <> 0 THEN
    RAISE EXCEPTION 'Truly empty unfinished project was not eligible: %',inspection;
  END IF;
  IF NOT public.workspace_import_prepare_discard(unfinished)
    OR NOT public.workspace_import_prepare_discard(unfinished) THEN
    RAISE EXCEPTION 'Empty import prepare was not retry-safe';
  END IF;
  inspection := public.workspace_import_inspect(unfinished);
  IF inspection->>'status' <> 'discarding'
    OR inspection->>'project_status' <> 'archived'
    OR inspection->>'can_finalize_discard' <> 'true' THEN
    RAISE EXCEPTION 'Prepared project was not sealed: %',inspection;
  END IF;
  -- A prepared but not finalized discard is reversible without data loss.
  IF NOT public.workspace_import_cancel_discard(unfinished)
    OR NOT public.workspace_import_cancel_discard(unfinished) THEN
    RAISE EXCEPTION 'Undo-seal is not retry-safe';
  END IF;
  inspection := public.workspace_import_inspect(unfinished);
  IF inspection->>'status' <> 'active'
    OR inspection->>'project_status' <> 'active' THEN
    RAISE EXCEPTION 'Undo seal failed to restore project state';
  END IF;
  IF NOT public.workspace_import_prepare_discard(unfinished) THEN
    RAISE EXCEPTION 'Re-sealing restored empty project failed';
  END IF;
  reused := public.workspace_import_begin(repeat('b',64),1,'Unfinished import','',1,0,0,0);
  IF reused->>'status' <> 'discarding' OR reused->>'project_id' <> project::text THEN
    RAISE EXCEPTION 'Reopen ignored discarded import state';
  END IF;
  BEGIN
    PERFORM public.workspace_import_apply_batch(unfinished,'tasks',0,
      '[{"title":"Race after prepare","details":"","status":"todo","priority":"normal","checklist":[]}]'::jsonb);
    RAISE EXCEPTION 'Sealed import accepted more tasks';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT public.workspace_import_finalize_discard(unfinished) THEN
    RAISE EXCEPTION 'Prepared empty import could not be deleted';
  END IF;
  IF EXISTS(SELECT 1 FROM public.workspace_projects WHERE id=project)
    OR EXISTS(SELECT 1 FROM public.workspace_import_sessions WHERE id=unfinished) THEN
    RAISE EXCEPTION 'Discard left an orphan session/project';
  END IF;
END;
$check$;

-- User-authored task/notes must block the shortcut and remain intact.
DO $check$
DECLARE
  session jsonb;
  pid uuid;
BEGIN
  session := public.workspace_import_begin(repeat('c',64),3,
    'Interrupted but not empty','manual changes must survive',1,0,0,0);
  pid := (session->>'project_id')::uuid;
  INSERT INTO public.workspace_tasks(owner_id,project_id,title)
    VALUES(auth.uid(),pid,'Real work not from this import');
  BEGIN
    PERFORM public.workspace_import_prepare_discard((session->>'session_id')::uuid);
    RAISE EXCEPTION 'Nonempty project was destroyed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_tasks
    WHERE project_id=pid AND title='Real work not from this import') THEN
    RAISE EXCEPTION 'A refusal lost user content';
  END IF;
  DELETE FROM public.workspace_tasks WHERE project_id=pid;
  INSERT INTO public.workspace_items(owner_id,project_id,kind,title,note_text)
    VALUES(auth.uid(),pid,'note','Work preserved','Do not destroy it');
  BEGIN
    PERFORM public.workspace_import_prepare_discard((session->>'session_id')::uuid);
    RAISE EXCEPTION 'Nonempty note project was destroyed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  DELETE FROM public.workspace_items WHERE project_id=pid;
  IF NOT public.workspace_import_prepare_discard((session->>'session_id')::uuid)
    OR NOT public.workspace_import_finalize_discard((session->>'session_id')::uuid) THEN
    RAISE EXCEPTION 'Owner could not clean then discard fully empty project';
  END IF;
END;
$check$;

-- Orphan physical Storage object and claimed files must fail closed.
DO $check$
DECLARE
  session jsonb;
  sid uuid;
  pid uuid;
  object_key text;
BEGIN
  session := public.workspace_import_begin(repeat('d',64),3,
    'Private upload interrupted','private file guard',0,0,0,1);
  sid := (session->>'session_id')::uuid;
  pid := (session->>'project_id')::uuid;
  object_key := auth.uid()::text || '/' || pid::text || '/manual-upload.txt';
  INSERT INTO storage.objects(bucket_id,name,metadata)
    VALUES('workspace-private',object_key,'{"size":1,"mimetype":"text/plain"}'::jsonb);
  IF (public.workspace_import_inspect(sid)->>'stored_objects') <> '1' THEN
    RAISE EXCEPTION 'Recovery inspection missed an orphan Storage object';
  END IF;
  BEGIN
    PERFORM public.workspace_import_prepare_discard(sid);
    RAISE EXCEPTION 'Storage object was silently destroyed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  DELETE FROM storage.objects WHERE bucket_id='workspace-private' AND name=object_key;
  PERFORM public.workspace_import_claim_file(sid,0,'claimed.txt',4,'text/plain',repeat('a',64));
  BEGIN
    PERFORM public.workspace_import_prepare_discard(sid);
    RAISE EXCEPTION 'Claimed private file was silently discarded';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_projects WHERE id=pid) THEN
    RAISE EXCEPTION 'Project was erased despite private claim';
  END IF;
END;
$check$;

-- Legacy Phase 9 finish RPC must NEVER convert a sealed zero-count import
-- to complete (which would strand it, blocking both Undo and Finalize).
DO $check$
DECLARE
  session jsonb;
  sid uuid;
BEGIN
  session := public.workspace_import_begin(repeat('e',64),3,
    'Zero-work retry','Transition guard',0,0,0,0);
  sid := (session->>'session_id')::uuid;
  PERFORM public.workspace_import_prepare_discard(sid);
  BEGIN
    PERFORM public.workspace_import_finish(sid);
    RAISE EXCEPTION 'A sealed zero-count import was marked complete';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (public.workspace_import_inspect(sid)->>'status') <> 'discarding' THEN
    RAISE EXCEPTION 'Sealed status was not preserved after rejected finish';
  END IF;
  IF NOT public.workspace_import_cancel_discard(sid)
    OR NOT public.workspace_import_finish(sid) THEN
    RAISE EXCEPTION 'Normal completion after undo seal did not work';
  END IF;
  IF (public.workspace_import_inspect(sid)->>'status') <> 'complete' THEN
    RAISE EXCEPTION 'Completion after undo was not committed';
  END IF;
END;
$check$;

-- No untrusted account may inspect or discard a session by guessing its UUID.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
DO $check$
DECLARE
  bob_session uuid;
BEGIN
  -- Use a known UUID from fixture superuser through a session variable set below.
  NULL;
END;
$check$;
RESET ROLE;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
SELECT pg_catalog.set_config('test.workspace_phase10_bob',
  id::text,false) FROM public.workspace_import_sessions
    WHERE source_sha256=repeat('d',64);
SET ROLE authenticated;
DO $check$
DECLARE bob_session uuid := pg_catalog.current_setting('test.workspace_phase10_bob')::uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.workspace_import_sessions WHERE id=bob_session) THEN
    RAISE EXCEPTION 'Other owner could read import history'; END IF;
  BEGIN
    PERFORM public.workspace_import_inspect(bob_session);
    RAISE EXCEPTION 'Other owner inspected private import';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_prepare_discard(bob_session);
    RAISE EXCEPTION 'Other owner prepared private import';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_finalize_discard(bob_session);
    RAISE EXCEPTION 'Other owner finalized private import';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_cancel_discard(bob_session);
    RAISE EXCEPTION 'Other owner cancelled private import disposal';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$check$;
DO $check$
BEGIN
  RAISE NOTICE 'Phase 10: owner-only recovery inspection, preserved user work, file and claim protection, two-step empty discard passed';
END;
$check$;
