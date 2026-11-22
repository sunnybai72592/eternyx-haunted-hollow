-- Workspace Phase 6. Requires Phase 1, 2, 5 migrations.
-- Add persistent task priorities and an owner-authenticated, *file-free* archive purge.
-- Never delete Storage objects with SQL. Uploaded file bytes must be cleaned up
-- using Supabase Storage API before the project is archived and purged.

ALTER TABLE public.workspace_tasks
  ADD COLUMN priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
GRANT INSERT(priority), UPDATE(priority) ON public.workspace_tasks TO authenticated;
CREATE INDEX workspace_tasks_owner_focus_idx
  ON public.workspace_tasks (owner_id, status, due_on, priority, project_id);

CREATE OR REPLACE FUNCTION public.workspace_delete_archived_project(p_project_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $workspace_purge$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_status text;
  v_prefix text;
BEGIN
  IF v_owner IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to remove an archived Workspace project'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.status INTO v_status
  FROM public.workspace_projects p
  WHERE p.id = p_project_id AND p.owner_id = v_owner
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace project not found or not owned by this account'
      USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'Archive the project before permanently deleting it'
      USING ERRCODE = '23514';
  END IF;

  -- Do not even touch task or note rows if *any* registered file or physical
  -- Storage object remains. This catches orphan/unregistered uploads too.
  v_prefix := v_owner::text || '/' || p_project_id::text || '/';
  IF EXISTS (
    SELECT 1 FROM public.workspace_items i
    WHERE i.project_id = p_project_id AND i.owner_id = v_owner
      AND i.kind = 'file'
  ) OR EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'workspace-private'
      AND pg_catalog.left(o.name, pg_catalog.length(v_prefix)) = v_prefix
  ) THEN
    RAISE EXCEPTION
      'Project still contains private files. Restore it, remove private files through Storage, archive again and retry'
      USING ERRCODE = '23514';
  END IF;

  -- One PostgreSQL transaction. Note/link revisions cascade from items.
  -- Activity triggers record deletions; remove those and the existing ledger
  -- only when the project can be safely removed.
  DELETE FROM public.workspace_items i
    WHERE i.project_id = p_project_id AND i.owner_id = v_owner;
  DELETE FROM public.workspace_tasks t
    WHERE t.project_id = p_project_id AND t.owner_id = v_owner;
  DELETE FROM public.workspace_activity a
    WHERE a.project_id = p_project_id AND a.owner_id = v_owner;
  DELETE FROM public.workspace_projects p
    WHERE p.id = p_project_id AND p.owner_id = v_owner;
  RETURN true;
END;
$workspace_purge$;
REVOKE ALL ON FUNCTION public.workspace_delete_archived_project(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_delete_archived_project(uuid)
  TO authenticated;
