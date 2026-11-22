-- Acceptance against a disposable PostgreSQL 17 database, with actual RLS roles.
-- Requires auth fixture, storage stub, Workspace foundation and revision migrations.

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);

INSERT INTO public.workspace_projects(owner_id, name, description)
VALUES ('11111111-1111-4111-8111-111111111111', 'Alice workspace', 'Owned project');

INSERT INTO public.workspace_tasks(owner_id, project_id, title)
SELECT owner_id, id, 'First draft' FROM public.workspace_projects WHERE name = 'Alice workspace';

INSERT INTO public.workspace_items(owner_id, project_id, kind, title, note_text)
SELECT owner_id, id, 'note', 'Original title', 'Original body'
FROM public.workspace_projects WHERE name = 'Alice workspace';

-- Create a private Storage object and register the file under the owned project.
INSERT INTO storage.objects(bucket_id, name)
SELECT 'workspace-private', owner_id::text || '/' || id::text || '/proof.txt'
FROM public.workspace_projects WHERE name = 'Alice workspace';

INSERT INTO public.workspace_items(
  owner_id, project_id, kind, title, file_size, mime_type, storage_path
)
SELECT owner_id, id, 'file', 'proof.txt', 12, 'text/plain',
  owner_id::text || '/' || id::text || '/proof.txt'
FROM public.workspace_projects WHERE name = 'Alice workspace';

-- A true edit must preserve the old value transactionally and advance revision.
UPDATE public.workspace_items
SET title = 'Updated title', note_text = 'Updated body'
WHERE kind = 'note' AND title = 'Original title';
DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspace_items
     WHERE kind = 'note' AND title = 'Updated title' AND revision = 2)
  THEN RAISE EXCEPTION 'Note revision was not incremented'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_item_revisions
     WHERE revision = 1 AND title = 'Original title' AND note_text = 'Original body')
  THEN RAISE EXCEPTION 'Original content was not saved as a revision'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_activity
     WHERE event_type = 'item_updated')
  THEN RAISE EXCEPTION 'Update audit event missing'; END IF;
END;
$check$;

-- No-op updates must not fabricate revision events.
UPDATE public.workspace_items SET title = 'Updated title'
WHERE kind = 'note' AND title = 'Updated title';
DO $check$
BEGIN
  IF (SELECT count(*) FROM public.workspace_item_revisions) <> 1 OR
     (SELECT revision FROM public.workspace_items WHERE kind='note') <> 2
  THEN RAISE EXCEPTION 'No-op changed revision history'; END IF;
END;
$check$;

-- Browsers are not allowed to insert forged snapshots into history.
DO $check$
BEGIN
  INSERT INTO public.workspace_item_revisions
    (item_id, owner_id, project_id, revision, kind, title)
  SELECT id, owner_id, project_id, 999, 'note', 'forgery'
  FROM public.workspace_items WHERE kind = 'note';
  RAISE EXCEPTION 'Browser forged revision history';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$check$;

-- Switch to a second real auth identity: Alice's records are invisible.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222', false);
DO $check$
DECLARE affected int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspace_projects) OR
     EXISTS (SELECT 1 FROM public.workspace_tasks) OR
     EXISTS (SELECT 1 FROM public.workspace_items) OR
     EXISTS (SELECT 1 FROM public.workspace_item_revisions) OR
     EXISTS (SELECT 1 FROM public.workspace_activity) OR
     EXISTS (SELECT 1 FROM storage.objects)
  THEN RAISE EXCEPTION 'Cross-owner data was visible'; END IF;
  UPDATE public.workspace_items SET note_text = 'Bob takeover'
  WHERE kind = 'note';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Bob modified Alice note'; END IF;
END;
$check$;

-- Restore Alice, archive project and prove the database enforces read-only mode.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', false);
UPDATE public.workspace_projects SET status='archived' WHERE name='Alice workspace';

DO $check$
DECLARE affected int;
BEGIN
  UPDATE public.workspace_tasks SET title='Changed during archive';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Archived task accepted UPDATE'; END IF;
  UPDATE public.workspace_items SET note_text='Changed during archive' WHERE kind='note';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Archived note accepted UPDATE'; END IF;
  DELETE FROM public.workspace_items WHERE kind='file';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Archived file metadata could be removed'; END IF;
  DELETE FROM storage.objects WHERE bucket_id='workspace-private';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Archived file object could be removed'; END IF;
END;
$check$;

DO $check$
BEGIN
  INSERT INTO public.workspace_tasks(owner_id, project_id, title)
  SELECT owner_id, id, 'Should be rejected'
  FROM public.workspace_projects WHERE name = 'Alice workspace';
  RAISE EXCEPTION 'Archived project accepted task creation';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$check$;

DO $check$
BEGIN
  INSERT INTO storage.objects(bucket_id, name)
  SELECT 'workspace-private', owner_id::text || '/' || id::text || '/forbidden.txt'
  FROM public.workspace_projects WHERE name = 'Alice workspace';
  RAISE EXCEPTION 'Archived project accepted Storage upload';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$check$;

-- Even project details are immutable until explicit restoration.
DO $archivecheck$
BEGIN
  UPDATE public.workspace_projects SET name='bypassed archive' WHERE status='archived';
  RAISE EXCEPTION 'Archived project metadata accepted UPDATE';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$archivecheck$;

-- Restore project and prove normal writes work once again.
UPDATE public.workspace_projects SET status='active' WHERE name='Alice workspace';
UPDATE public.workspace_tasks SET status='done' WHERE title='First draft';
DO $check$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_tasks
    WHERE status='done') THEN RAISE EXCEPTION 'Restored project could not update tasks'; END IF;
  RAISE NOTICE 'Workspace real owner RLS, immutable history, audit, archive guards and restore verified';
END;
$check$;
