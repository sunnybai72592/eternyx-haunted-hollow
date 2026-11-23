-- Phase 11 disposable PostgreSQL acceptance AFTER previous Workspace smoke tests.
-- Protects nonempty partial imports without deleting work or pretending to
-- restore manually modified rows. Uses real authenticated RLS principals.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);

DO $check$
DECLARE sess jsonb;
DECLARE sid uuid;
DECLARE project uuid;
DECLARE receipt jsonb;
DECLARE integrity jsonb;
BEGIN
  sess := public.workspace_import_begin(repeat('f',64),3,'Protected partial','Real user data',2,1,1,0);
  sid := (sess->>'session_id')::uuid;
  project := (sess->>'project_id')::uuid;
  PERFORM pg_catalog.set_config('test.p11_import',sid::text,false);
  PERFORM pg_catalog.set_config('test.p11_project',project::text,false);

  integrity := public.workspace_import_integrity(sid);
  IF integrity->>'content_matches' <> 'true'
    OR integrity->>'baseline_known' <> 'true' THEN
    RAISE EXCEPTION 'New private import missing initial checkpoint';
  END IF;
  receipt := public.workspace_import_apply_batch(sid,'tasks',0,
    '[{"title":"Task A","details":"Original","status":"todo","priority":"high",
      "due_on":null,"checklist":[{"title":"Inspect","done":true}]}]'::jsonb);
  IF receipt->>'rows' <> '1' THEN RAISE EXCEPTION 'Initial restore batch failed'; END IF;
  IF (public.workspace_import_integrity(sid)->>'content_matches') <> 'true' THEN
    RAISE EXCEPTION 'Committed batch did not refresh its content checkpoint';
  END IF;

  IF NOT public.workspace_import_set_hold(sid,true,'Protect original task notes')
    OR NOT public.workspace_import_set_hold(sid,true,'Protect original task notes') THEN
    RAISE EXCEPTION 'Owner could not protect an unfinished nonempty import';
  END IF;
  integrity := public.workspace_import_integrity(sid);
  IF integrity->>'status'<>'held' OR integrity->>'hold_reason'<>'Protect original task notes'
    OR integrity->>'held_at' IS NULL THEN
    RAISE EXCEPTION 'Protected state and reason not persisted';
  END IF;

  BEGIN
    PERFORM public.workspace_import_apply_batch(sid,'tasks',1,
      '[{"title":"Task B","details":"","status":"todo","priority":"normal","checklist":[]}]'::jsonb);
    RAISE EXCEPTION 'Held import accepted a new task batch';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_apply_batch(sid,'tasks',0,
      '[{"title":"Task A","details":"Original","status":"todo","priority":"high",
        "due_on":null,"checklist":[{"title":"Inspect","done":true}]}]'::jsonb);
    RAISE EXCEPTION 'Held import accepted replay without owner review';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_finish(sid);
    RAISE EXCEPTION 'Held import finished';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_prepare_discard(sid);
    RAISE EXCEPTION 'Held nonempty import was sealed for deletion';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT count(*) FROM public.workspace_tasks WHERE project_id=project)<>1 THEN
    RAISE EXCEPTION 'Holding the import destroyed real work'; END IF;

  IF NOT public.workspace_import_set_hold(sid,false,'') THEN
    RAISE EXCEPTION 'Untouched protected import could not be released'; END IF;
  receipt := public.workspace_import_apply_batch(sid,'tasks',1,
    '[{"title":"Task B","details":"","status":"todo","priority":"normal","due_on":null,
      "checklist":[]}]'::jsonb);
  IF receipt->>'rows'<>'1' THEN RAISE EXCEPTION 'Release did not permit safe continuation'; END IF;

  -- Same number of task/step rows, but changed TEXT. Legacy count matching
  -- would silently accept this; content checkpoint must fail closed.
  UPDATE public.workspace_tasks SET details='Manual edit after import'
  WHERE project_id=project AND title='Task A';
  IF (public.workspace_import_integrity(sid)->>'content_matches') <> 'false' THEN
    RAISE EXCEPTION 'Same-count manual edit evaded drift detection'; END IF;
  BEGIN
    PERFORM public.workspace_import_apply_batch(sid,'items',0,
      '[{"kind":"note","title":"Note","note_text":"Imported","target_url":null}]'::jsonb);
    RAISE EXCEPTION 'Stale checkpoint allowed new rows after manual edit';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.workspace_items WHERE project_id=project) THEN
    RAISE EXCEPTION 'Drift rejection left a partial note write'; END IF;

  PERFORM public.workspace_import_set_hold(sid,true,'Preserve manual edit');
  BEGIN
    PERFORM public.workspace_import_set_hold(sid,false,'');
    RAISE EXCEPTION 'Manual edit was unprotected without resolution';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_tasks
    WHERE project_id=project AND details='Manual edit after import') THEN
    RAISE EXCEPTION 'Drift control destroyed manually edited work';
  END IF;
END;
$check$;

-- A legitimate file upload + registration changes physical Storage before
-- the DB registration transaction. The DB checkpoint MUST NOT block that.
DO $check$
DECLARE sess jsonb;
DECLARE sid uuid;
DECLARE claim jsonb;
BEGIN
  sess := public.workspace_import_begin(repeat('g',64),3,'File recovery','',0,0,0,1);
  sid := (sess->>'session_id')::uuid;
  claim := public.workspace_import_claim_file(
    sid,0,'report.txt',12,'text/plain',repeat('c',64));
  INSERT INTO storage.objects(bucket_id,name,metadata)
    VALUES('workspace-private',claim->>'storage_path',
      '{"size":12,"mimetype":"text/plain"}'::jsonb);
  IF NOT public.workspace_import_register_file(sid,0)
    OR (public.workspace_import_integrity(sid)->>'content_matches') <> 'true'
    OR NOT public.workspace_import_finish(sid) THEN
    RAISE EXCEPTION 'Real private file registration incorrectly treated as drift';
  END IF;
END;
$check$;

-- Confirm a completed session cannot be held, and a forged owner can never
-- read or change recovery data.
DO $check$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM public.workspace_import_sessions
    WHERE source_sha256=repeat('g',64);
  BEGIN
    PERFORM public.workspace_import_set_hold(sid,true,'No');
    RAISE EXCEPTION 'Completed session allowed a hold';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$check$;

RESET ROLE;
SELECT pg_catalog.set_config('test.p11_bob_session',
  id::text,false) FROM public.workspace_import_sessions WHERE source_sha256=repeat('f',64);
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
DO $check$
DECLARE sid uuid := pg_catalog.current_setting('test.p11_bob_session')::uuid;
BEGIN
  BEGIN
    PERFORM public.workspace_import_integrity(sid);
    RAISE EXCEPTION 'Other owner viewed private content integrity';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.workspace_import_set_hold(sid,false,'');
    RAISE EXCEPTION 'Other owner released a protected import';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$check$;
DO $check$
BEGIN
  RAISE NOTICE 'Workspace Phase 11 protection passed: held-session blocks, content drift, safe release, private files and cross-owner isolation';
END;
$check$;
