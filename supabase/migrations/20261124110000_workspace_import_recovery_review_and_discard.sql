-- Workspace Phase 10: read-only owner-scoped recovery inspection and two-step
-- disposal ONLY of physically empty unfinished imports.
-- Depends on Phase 9. SQL must be reviewed/applied separately from PR merge.
-- No function deletes Storage objects; user-authored records are never erased
-- through the empty-import shortcut.

ALTER TABLE public.workspace_import_sessions
  DROP CONSTRAINT workspace_import_sessions_status_check;
ALTER TABLE public.workspace_import_sessions
  ADD CONSTRAINT workspace_import_sessions_status_check
  CHECK(status IN ('active','complete','discarding'));

CREATE OR REPLACE FUNCTION public.workspace_import_inspect(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_import_inspect$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_project public.workspace_projects%ROWTYPE;
  v_prefix text;
  v_reported_tasks bigint;
  v_reported_steps bigint;
  v_reported_items bigint;
  v_registered bigint;
  v_actual_tasks bigint;
  v_actual_steps bigint;
  v_actual_items bigint;
  v_storage_objects bigint;
  v_claims bigint;
  v_unregistered_uploads bigint;
  v_missing_registered bigint;
  v_unclaimed_objects bigint;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions s
  WHERE s.id=p_session_id AND s.owner_id=v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import session not found or not owned by this account'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_project FROM public.workspace_projects p
    WHERE p.id=v_session.project_id AND p.owner_id=v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owned import project is unavailable' USING ERRCODE='42501';
  END IF;

  v_prefix := v_owner::text || '/' || v_session.project_id::text || '/';
  SELECT coalesce(sum(b.row_count),0),coalesce(sum(b.step_count),0)
    INTO v_reported_tasks,v_reported_steps FROM public.workspace_import_batches b
    WHERE b.session_id=p_session_id AND b.phase='tasks';
  SELECT coalesce(sum(b.row_count),0) INTO v_reported_items
    FROM public.workspace_import_batches b
    WHERE b.session_id=p_session_id AND b.phase='items';
  SELECT count(*) INTO v_registered FROM public.workspace_import_files f
    WHERE f.session_id=p_session_id AND f.registered;
  SELECT count(*) INTO v_actual_tasks FROM public.workspace_tasks t
    WHERE t.owner_id=v_owner AND t.project_id=v_session.project_id;
  SELECT count(*) INTO v_actual_steps FROM public.workspace_task_steps s
    JOIN public.workspace_tasks t ON t.id=s.task_id
    WHERE t.owner_id=v_owner AND t.project_id=v_session.project_id;
  SELECT count(*) INTO v_actual_items FROM public.workspace_items i
    WHERE i.owner_id=v_owner AND i.project_id=v_session.project_id;
  SELECT count(*) INTO v_storage_objects FROM storage.objects o
    WHERE o.bucket_id='workspace-private'
      AND pg_catalog.left(o.name,pg_catalog.length(v_prefix))=v_prefix;
  SELECT count(*) INTO v_claims FROM public.workspace_import_files f
    WHERE f.session_id=p_session_id;
  SELECT count(*) INTO v_unregistered_uploads FROM public.workspace_import_files f
    JOIN storage.objects o ON o.bucket_id='workspace-private' AND o.name=f.storage_path
    WHERE f.session_id=p_session_id AND NOT f.registered;
  SELECT count(*) INTO v_missing_registered FROM public.workspace_import_files f
    WHERE f.session_id=p_session_id AND f.registered
    AND NOT EXISTS(
      SELECT 1 FROM storage.objects o WHERE o.bucket_id='workspace-private'
        AND o.name=f.storage_path
    );
  SELECT count(*) INTO v_unclaimed_objects FROM storage.objects o
    WHERE o.bucket_id='workspace-private'
      AND pg_catalog.left(o.name,pg_catalog.length(v_prefix))=v_prefix
      AND NOT EXISTS (
        SELECT 1 FROM public.workspace_import_files f
        WHERE f.session_id=p_session_id AND f.storage_path=o.name
      );

  RETURN pg_catalog.jsonb_build_object(
    'session_id',v_session.id,'project_id',v_session.project_id,
    'project_name',v_project.name,'project_status',v_project.status,
    'status',v_session.status,'source_version',v_session.source_version,
    'expected_tasks',v_session.expected_tasks,'expected_steps',v_session.expected_steps,
    'expected_items',v_session.expected_items,'expected_files',v_session.expected_files,
    'committed_tasks',v_reported_tasks,'committed_steps',v_reported_steps,
    'committed_items',v_reported_items,'committed_files',v_registered,
    'actual_tasks',v_actual_tasks,'actual_steps',v_actual_steps,
    'actual_items',v_actual_items,'stored_objects',v_storage_objects,
    'file_claims',v_claims,'pending_uploads',v_unregistered_uploads,
    'missing_registered_files',v_missing_registered,'unclaimed_objects',v_unclaimed_objects,
    'receipt_counts_match',
      (v_actual_tasks=v_reported_tasks
        AND v_actual_steps=v_reported_steps
        AND v_actual_items=v_reported_items+v_registered),
    'can_prepare_discard',
      (v_session.status='active' AND v_project.status='active'
        AND v_actual_tasks=0 AND v_actual_steps=0 AND v_actual_items=0
        AND v_storage_objects=0 AND v_claims=0),
    'can_finalize_discard',
      (v_session.status='discarding' AND v_project.status='archived'
        AND v_actual_tasks=0 AND v_actual_steps=0 AND v_actual_items=0
        AND v_storage_objects=0)
  );
END;
$workspace_import_inspect$;
REVOKE ALL ON FUNCTION public.workspace_import_inspect(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_inspect(uuid) TO authenticated;

-- Phase 1: Seal an actually empty, owner-owned, unfinished project against
-- new uploads and writes by archiving it in a committed transaction.
CREATE OR REPLACE FUNCTION public.workspace_import_prepare_discard(p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_import_prepare_discard$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_prefix text;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions s
    WHERE s.id=p_session_id AND s.owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import session not found or not owned' USING ERRCODE='42501';
  END IF;
  IF v_session.status='discarding' THEN RETURN true; END IF;
  IF v_session.status<>'active' THEN
    RAISE EXCEPTION 'Only unfinished imports may be discarded' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM public.workspace_projects p
    WHERE p.id=v_session.project_id AND p.owner_id=v_owner AND p.status='active'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restore the owned project before preparing disposal' USING ERRCODE='23514';
  END IF;

  v_prefix := v_owner::text || '/' || v_session.project_id::text || '/';
  IF EXISTS(SELECT 1 FROM public.workspace_tasks t
      WHERE t.owner_id=v_owner AND t.project_id=v_session.project_id)
    OR EXISTS(SELECT 1 FROM public.workspace_items i
      WHERE i.owner_id=v_owner AND i.project_id=v_session.project_id)
    OR EXISTS(SELECT 1 FROM public.workspace_import_files f
      WHERE f.session_id=p_session_id)
    OR EXISTS(SELECT 1 FROM storage.objects o
      WHERE o.bucket_id='workspace-private'
        AND pg_catalog.left(o.name,pg_catalog.length(v_prefix))=v_prefix) THEN
    RAISE EXCEPTION
      'Import project has data or file claims. Recover it or manually clear ALL data/files before discarding'
      USING ERRCODE='23514';
  END IF;

  UPDATE public.workspace_projects SET status='archived'
    WHERE id=v_session.project_id AND owner_id=v_owner;
  UPDATE public.workspace_import_sessions SET status='discarding',updated_at=now()
    WHERE id=p_session_id;
  RETURN true;
END;
$workspace_import_prepare_discard$;
REVOKE ALL ON FUNCTION public.workspace_import_prepare_discard(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_prepare_discard(uuid)
  TO authenticated;

-- Phase 2: Must be a new request after Phase 1 committed; re-verify the
-- project is still empty and file-free. Existing Phase 6 purge enforces
-- archived-only and checks physical Storage objects once more.
CREATE OR REPLACE FUNCTION public.workspace_import_finalize_discard(p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_import_finalize_discard$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_prefix text;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions s
    WHERE s.id=p_session_id AND s.owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import session not found or not owned' USING ERRCODE='42501';
  END IF;
  IF v_session.status<>'discarding' THEN
    RAISE EXCEPTION 'Prepare empty import disposal first' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM public.workspace_projects p
    WHERE p.id=v_session.project_id AND p.owner_id=v_owner AND p.status='archived'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discard project is no longer safely archived' USING ERRCODE='23514';
  END IF;
  v_prefix := v_owner::text || '/' || v_session.project_id::text || '/';
  IF EXISTS(SELECT 1 FROM public.workspace_tasks t
      WHERE t.owner_id=v_owner AND t.project_id=v_session.project_id)
    OR EXISTS(SELECT 1 FROM public.workspace_items i
      WHERE i.owner_id=v_owner AND i.project_id=v_session.project_id)
    OR EXISTS(SELECT 1 FROM storage.objects o
      WHERE o.bucket_id='workspace-private'
        AND pg_catalog.left(o.name,pg_catalog.length(v_prefix))=v_prefix) THEN
    RAISE EXCEPTION 'Discard refused: the private project contains work or Storage objects'
      USING ERRCODE='23514';
  END IF;
  IF public.workspace_delete_archived_project(v_session.project_id)
    IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Project deletion could not be confirmed' USING ERRCODE='23514';
  END IF;
  -- The session + batch/file receipts cascade from the deleted project.
  RETURN true;
END;
$workspace_import_finalize_discard$;
REVOKE ALL ON FUNCTION public.workspace_import_finalize_discard(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_finalize_discard(uuid)
  TO authenticated;
