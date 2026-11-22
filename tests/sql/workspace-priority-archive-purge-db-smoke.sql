-- Isolated PostgreSQL 17 acceptance AFTER Workspace phases 1,2,5 and 6.
-- Uses two authenticated identities and genuine RLS, audited revisions,
-- real Storage metadata fixture, and the privileged owner-only purge RPC.

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);

INSERT INTO public.workspace_tasks(owner_id, project_id, title, priority, due_on)
SELECT owner_id, id, 'Urgent owned task', 'urgent', '2026-11-24'
FROM public.workspace_projects WHERE name = 'Bob second';

DO $check$
BEGIN
  INSERT INTO public.workspace_tasks(owner_id, project_id, title, priority)
  SELECT owner_id, id, 'Invalid task priority', 'extreme'
  FROM public.workspace_projects WHERE name = 'Bob second';
  RAISE EXCEPTION 'Invalid priority was accepted';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

-- Notes and their revisions are fully removed by an owner-confirmed purge.
INSERT INTO public.workspace_items(owner_id, project_id, kind, title, note_text)
SELECT owner_id, id, 'note', 'Bob note', 'Saved confidential note'
FROM public.workspace_projects WHERE name = 'Bob second';
UPDATE public.workspace_items SET note_text = 'Edited confidential note'
WHERE title = 'Bob note';

DO $check$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_item_revisions r
    WHERE r.title = 'Bob note') THEN
    RAISE EXCEPTION 'Purge fixture has no revision history';
  END IF;
END;
$check$;

-- An active project can never be accidentally purged.
DO $check$
BEGIN
  PERFORM public.workspace_delete_archived_project(
    (SELECT id FROM public.workspace_projects WHERE name='Bob second')
  );
  RAISE EXCEPTION 'Active project was permanently deleted';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

-- Bob cannot delete Alice's archived project even if he knows its UUID.
DO $check$
DECLARE alice_id uuid;
BEGIN
  SELECT p.id INTO alice_id
  FROM public.workspace_projects p WHERE p.name='Alice workspace';
  -- RLS must hide Alice; using a known fixture UUID instead:
  PERFORM public.workspace_delete_archived_project(
    '11111111-1111-4111-8111-111111111111'::uuid
  );
  RAISE EXCEPTION 'Cross-owner purge was allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$check$;

-- An uploaded but unregistered object also blocks deletion (orphan guard).
INSERT INTO storage.objects(bucket_id, name, metadata)
SELECT 'workspace-private', owner_id::text || '/' || id::text || '/unregistered.txt',
  '{"size":1,"mimetype":"text/plain"}'::jsonb
FROM public.workspace_projects WHERE name = 'Bob second';

UPDATE public.workspace_projects SET status='archived' WHERE name='Bob second';
DO $check$
BEGIN
  PERFORM public.workspace_delete_archived_project(
    (SELECT id FROM public.workspace_projects WHERE name='Bob second')
  );
  RAISE EXCEPTION 'Archived project with Storage object was deleted';
EXCEPTION WHEN check_violation THEN NULL;
END;
$check$;

-- Archive is read-only: restore before removing a private object via Storage.
UPDATE public.workspace_projects SET status='active' WHERE name='Bob second';
DELETE FROM storage.objects
WHERE bucket_id='workspace-private'
  AND name LIKE '22222222-2222-4222-8222-222222222222/%/unregistered.txt';
UPDATE public.workspace_projects SET status='archived' WHERE name='Bob second';

-- The function removes tasks, notes, revisions, activity, then project in one
-- transaction; none of Alice's records nor Bob's other project is touched.
DO $check$
DECLARE target uuid;
DECLARE deleted boolean;
BEGIN
  SELECT id INTO target FROM public.workspace_projects WHERE name='Bob second';
  deleted := public.workspace_delete_archived_project(target);
  IF deleted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Owner deletion did not report success';
  END IF;
  IF EXISTS(SELECT 1 FROM public.workspace_projects WHERE id=target)
    OR EXISTS(SELECT 1 FROM public.workspace_tasks WHERE project_id=target)
    OR EXISTS(SELECT 1 FROM public.workspace_items WHERE project_id=target)
    OR EXISTS(SELECT 1 FROM public.workspace_item_revisions WHERE project_id=target)
    OR EXISTS(SELECT 1 FROM public.workspace_activity WHERE project_id=target)
  THEN
    RAISE EXCEPTION 'Project cleanup left owned database records behind';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_projects WHERE name='Bob workspace') THEN
    RAISE EXCEPTION 'Unrelated owned project was removed';
  END IF;
END;
$check$;

-- Bob cannot update Alice's task priority through RLS.
DO $check$
DECLARE affected integer;
BEGIN
  UPDATE public.workspace_tasks SET priority='urgent';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Bob changed another account''s tasks';
  END IF;
END;
$check$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
DO $check$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_projects WHERE name='Alice workspace')
    OR NOT EXISTS(SELECT 1 FROM public.workspace_tasks)
  THEN
    RAISE EXCEPTION 'Another account was affected by purge';
  END IF;
  RAISE NOTICE 'Workspace priority, owner-only archived project purge, revision cleanup and orphan guard passed';
END;
$check$;
