-- Phase 11: Protected private Workspace recovery with database content
-- checkpoints and an owner-controlled hold. Requires previous phases 1-10.
-- Migration creates no public export, does not touch private file bytes,
-- and does not automatically overwrite altered task/note/checklist content.

ALTER TABLE public.workspace_import_sessions
  DROP CONSTRAINT workspace_import_sessions_status_check;
ALTER TABLE public.workspace_import_sessions
  ADD CONSTRAINT workspace_import_sessions_status_check
    CHECK(status IN('active','complete','discarding','held'));
ALTER TABLE public.workspace_import_sessions
  ADD COLUMN baseline_signature text
    CHECK (baseline_signature IS NULL OR baseline_signature ~ '^[0-9a-f]{32}$'),
  ADD COLUMN checkpoint_at timestamptz,
  ADD COLUMN held_at timestamptz,
  ADD COLUMN hold_reason text NOT NULL DEFAULT ''
    CHECK(char_length(hold_reason)<=300);

-- A stable SHA-like *drift indicator* of real private DB records. This
-- is MD5 for change detection only, NOT a file hash, signature, encryption,
-- or proof of provenance. Physical Storage metadata is checked separately.
-- Project rows, tasks, steps and saved items are ordered by UUID.
CREATE OR REPLACE FUNCTION public.workspace_import_project_signature(p_project_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $workspace_project_signature$
  SELECT pg_catalog.md5(
    COALESCE((
      SELECT pg_catalog.jsonb_build_array(
        p.name,p.description,p.status,p.pinned
      )::text FROM public.workspace_projects p WHERE p.id=p_project_id
    ),'[]')
    || E'\n' || COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_array(
          t.id,t.title,t.details,t.status,t.priority,t.due_on,
          t.completed_at,t.updated_at
        ) ORDER BY t.id
      )::text FROM public.workspace_tasks t WHERE t.project_id=p_project_id
    ),'[]')
    || E'\n' || COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_array(
          s.id,s.task_id,s.title,s.done,s.updated_at
        ) ORDER BY s.id
      )::text FROM public.workspace_task_steps s
        JOIN public.workspace_tasks t ON t.id=s.task_id
        WHERE t.project_id=p_project_id
    ),'[]')
    || E'\n' || COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_array(
          i.id,i.kind,i.title,i.note_text,i.target_url,i.storage_path,
          i.file_size,i.mime_type,i.revision,i.updated_at
        ) ORDER BY i.id
      )::text FROM public.workspace_items i WHERE i.project_id=p_project_id
    ),'[]')
  );
$workspace_project_signature$;
REVOKE ALL ON FUNCTION public.workspace_import_project_signature(uuid)
  FROM PUBLIC,anon,authenticated;

-- New sessions get their empty-project baseline transactionally.
CREATE OR REPLACE FUNCTION public.workspace_import_set_initial_checkpoint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_initial_checkpoint$
BEGIN
  UPDATE public.workspace_import_sessions s
  SET baseline_signature=public.workspace_import_project_signature(NEW.project_id),
      checkpoint_at=now()
  WHERE s.id=NEW.id;
  RETURN NULL;
END;
$workspace_initial_checkpoint$;
REVOKE ALL ON FUNCTION public.workspace_import_set_initial_checkpoint()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_import_checkpoint_session
  AFTER INSERT ON public.workspace_import_sessions
  FOR EACH ROW EXECUTE FUNCTION public.workspace_import_set_initial_checkpoint();

-- The task/item batch ledger and file-registration flag are written in the
-- *same* transactions as their corresponding DB records. Capture an up-to-
-- date content checkpoint only for those server-authorized writes.
CREATE OR REPLACE FUNCTION public.workspace_import_advance_checkpoint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_advance_checkpoint$
DECLARE v_session uuid;
BEGIN
  -- Batch rows have no registered field; branch before evaluating fields.
  IF TG_TABLE_NAME='workspace_import_files' THEN
    IF TG_OP <> 'UPDATE' THEN RETURN NULL; END IF;
    IF NEW.registered IS DISTINCT FROM true
      OR OLD.registered IS DISTINCT FROM false THEN
      RETURN NULL;
    END IF;
  END IF;
  v_session := NEW.session_id;
  UPDATE public.workspace_import_sessions s
  SET baseline_signature=public.workspace_import_project_signature(s.project_id),
      checkpoint_at=now()
  WHERE s.id=v_session;
  RETURN NULL;
END;
$workspace_advance_checkpoint$;
REVOKE ALL ON FUNCTION public.workspace_import_advance_checkpoint()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workspace_import_checkpoint_batches
  AFTER INSERT ON public.workspace_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.workspace_import_advance_checkpoint();
CREATE TRIGGER workspace_import_checkpoint_registered_files
  AFTER UPDATE OF registered ON public.workspace_import_files
  FOR EACH ROW EXECUTE FUNCTION public.workspace_import_advance_checkpoint();

-- Trust pre-Phase-11 live rows only from the moment this migration is
-- applied; old modifications cannot be reconstructed retroactively.
UPDATE public.workspace_import_sessions s
SET baseline_signature=public.workspace_import_project_signature(s.project_id),
    checkpoint_at=now()
WHERE baseline_signature IS NULL;

CREATE OR REPLACE FUNCTION public.workspace_import_assert_clean(
  p_session_id uuid,p_owner_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_assert_clean$
DECLARE
  v_session public.workspace_import_sessions%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'No signed-in owner for Workspace import' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_session FROM public.workspace_import_sessions s
    WHERE s.id=p_session_id AND s.owner_id=p_owner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import not found or not owned' USING ERRCODE='42501';
  END IF;
  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'This import is protected, sealed or completed; review it before resuming'
      USING ERRCODE='23514';
  END IF;
  IF v_session.baseline_signature IS NULL OR
    v_session.baseline_signature IS DISTINCT FROM
      public.workspace_import_project_signature(v_session.project_id) THEN
    RAISE EXCEPTION
      'Import content has changed since its last server checkpoint. Preserve and inspect existing work before resuming'
      USING ERRCODE='23514';
  END IF;
END;
$workspace_assert_clean$;
REVOKE ALL ON FUNCTION public.workspace_import_assert_clean(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.workspace_import_set_hold(
  p_session_id uuid,p_hold boolean,p_reason text DEFAULT ''
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_set_hold$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions s
    WHERE s.id=p_session_id AND s.owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery session not found or not owned' USING ERRCODE='42501';
  END IF;
  IF p_hold IS NULL OR p_reason IS NULL OR char_length(p_reason)>300 THEN
    RAISE EXCEPTION 'Invalid protected recovery operation' USING ERRCODE='23514';
  END IF;
  IF v_session.status NOT IN('active','held') THEN
    RAISE EXCEPTION 'Only unfinished, unsealed imports support a recovery hold'
      USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM public.workspace_projects p
    WHERE p.id=v_session.project_id AND p.owner_id=v_owner AND p.status='active'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery project is not editable by this account'
      USING ERRCODE='42501';
  END IF;
  IF p_hold THEN
    UPDATE public.workspace_import_sessions
    SET status='held',held_at=COALESCE(held_at,now()),
        hold_reason=pg_catalog.left(pg_catalog.btrim(p_reason),300),
        updated_at=now()
    WHERE id=p_session_id;
  ELSE
    IF v_session.baseline_signature IS NULL OR
      v_session.baseline_signature IS DISTINCT FROM
        public.workspace_import_project_signature(v_session.project_id) THEN
      RAISE EXCEPTION
        'Project work changed during recovery hold; keep it protected and export a checkpoint before attempting another restore'
        USING ERRCODE='23514';
    END IF;
    UPDATE public.workspace_import_sessions
    SET status='active',held_at=NULL,hold_reason='',updated_at=now()
    WHERE id=p_session_id;
  END IF;
  RETURN true;
END;
$workspace_set_hold$;
REVOKE ALL ON FUNCTION public.workspace_import_set_hold(uuid,boolean,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_set_hold(uuid,boolean,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.workspace_import_integrity(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_integrity$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions s
    WHERE s.id=p_session_id AND s.owner_id=v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery session not found or not owned' USING ERRCODE='42501';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'session_id',v_session.id,'status',v_session.status,
    'project_id',v_session.project_id,'held_at',v_session.held_at,
    'hold_reason',v_session.hold_reason,
    'checkpoint_at',v_session.checkpoint_at,
    'baseline_known',v_session.baseline_signature IS NOT NULL,
    'content_matches',v_session.baseline_signature IS NOT NULL AND
      v_session.baseline_signature=
        public.workspace_import_project_signature(v_session.project_id)
  );
END;
$workspace_integrity$;
REVOKE ALL ON FUNCTION public.workspace_import_integrity(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_integrity(uuid)
  TO authenticated;

-- Closed state machine. The old Phase 10 trigger already uses this function.
CREATE OR REPLACE FUNCTION public.workspace_import_status_transition_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $workspace_transition_guard$
BEGIN
  IF (OLD.status='discarding' AND NEW.status NOT IN('discarding','active'))
    OR (OLD.status='complete' AND NEW.status<>'complete')
    OR (OLD.status='held' AND NEW.status NOT IN('held','active'))
    OR (OLD.status='active' AND NEW.status NOT IN('active','held','discarding','complete')) THEN
    RAISE EXCEPTION 'Invalid Workspace import recovery status transition'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$workspace_transition_guard$;

-- Phase 9 RPCs are redefined with the same grants/signatures; the new
-- checkpoint assertion runs before any new task/item/file database writes.
CREATE OR REPLACE FUNCTION public.workspace_import_apply_batch(
  p_session_id uuid,p_phase text,p_batch_index integer,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_import_apply$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_old public.workspace_import_batches%ROWTYPE;
  v_expected_index integer;
  v_digest text;
  v_total integer;
  v_steps integer := 0;
  v_result jsonb;
  v_row jsonb;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions
  WHERE id=p_session_id AND owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import session not found or not owned' USING ERRCODE='42501';
  END IF;
  PERFORM public.workspace_import_assert_clean(p_session_id,v_owner);
  IF p_phase NOT IN ('tasks','items') OR p_batch_index IS NULL
    OR p_batch_index NOT BETWEEN 0 AND 1000
    OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_payload) NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid Workspace import batch' USING ERRCODE='23514';
  END IF;
  v_total := pg_catalog.jsonb_array_length(p_payload);
  v_digest := pg_catalog.md5(p_payload::text);
  SELECT * INTO v_old FROM public.workspace_import_batches
  WHERE session_id=p_session_id AND phase=p_phase AND batch_index=p_batch_index;
  IF FOUND THEN
    IF v_old.payload_md5 <> v_digest OR v_old.row_count <> v_total THEN
      RAISE EXCEPTION 'Import batch was previously committed with different contents'
        USING ERRCODE='23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'replayed',true,'rows',v_old.row_count,'steps',v_old.step_count);
  END IF;
  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'This import was already completed' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_expected_index FROM public.workspace_import_batches
    WHERE session_id=p_session_id AND phase=p_phase;
  IF p_batch_index <> v_expected_index THEN
    RAISE EXCEPTION 'Import batch out of order; resume from the last committed batch'
      USING ERRCODE='23514';
  END IF;
  IF p_phase='items' AND (SELECT coalesce(sum(row_count),0)
    FROM public.workspace_import_batches
    WHERE session_id=p_session_id AND phase='tasks') <> v_session.expected_tasks THEN
    RAISE EXCEPTION 'Restore tasks before saved items' USING ERRCODE='23514';
  END IF;
  IF p_phase='tasks' THEN
    IF (SELECT coalesce(sum(row_count),0) FROM public.workspace_import_batches
      WHERE session_id=p_session_id AND phase='tasks') + v_total > v_session.expected_tasks THEN
      RAISE EXCEPTION 'Task batch exceeds import manifest' USING ERRCODE='23514';
    END IF;
    v_result := public.workspace_restore_task_batch(v_session.project_id,p_payload);
    v_steps := (v_result->>'steps')::integer;
    IF (SELECT coalesce(sum(step_count),0) FROM public.workspace_import_batches
      WHERE session_id=p_session_id AND phase='tasks') + v_steps > v_session.expected_steps THEN
      RAISE EXCEPTION 'Checklist batch exceeds import manifest' USING ERRCODE='23514';
    END IF;
  ELSE
    IF (SELECT coalesce(sum(row_count),0) FROM public.workspace_import_batches
      WHERE session_id=p_session_id AND phase='items') + v_total > v_session.expected_items THEN
      RAISE EXCEPTION 'Saved-item batch exceeds import manifest' USING ERRCODE='23514';
    END IF;
    FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_payload) LOOP
      IF pg_catalog.jsonb_typeof(v_row) <> 'object'
        OR (v_row->>'kind') NOT IN ('note','link')
        OR pg_catalog.jsonb_typeof(v_row->'title') <> 'string'
        OR ((v_row->>'kind')='note' AND pg_catalog.jsonb_typeof(v_row->'note_text') <> 'string')
        OR ((v_row->>'kind')='link' AND pg_catalog.jsonb_typeof(v_row->'target_url') <> 'string') THEN
        RAISE EXCEPTION 'Import contains malformed saved item' USING ERRCODE='23514';
      END IF;
      INSERT INTO public.workspace_items(owner_id,project_id,kind,title,note_text,target_url)
      VALUES(v_owner,v_session.project_id,v_row->>'kind',
        v_row->>'title',v_row->>'note_text',v_row->>'target_url');
    END LOOP;
  END IF;
  INSERT INTO public.workspace_import_batches(
    session_id,phase,batch_index,payload_md5,row_count,step_count)
  VALUES(p_session_id,p_phase,p_batch_index,v_digest,v_total,v_steps);
  UPDATE public.workspace_import_sessions SET updated_at=now() WHERE id=p_session_id;
  RETURN pg_catalog.jsonb_build_object('replayed',false,'rows',v_total,'steps',v_steps);
END;
$workspace_import_apply$;

-- Preserve Phase 9 RPC functionality, adding a server-side drift/hold guard.
CREATE OR REPLACE FUNCTION public.workspace_import_claim_file(
  p_session_id uuid,p_file_index integer,p_title text,
  p_size_bytes bigint,p_mime_type text,p_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_claim_file$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_file public.workspace_import_files%ROWTYPE;
  v_path text;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions
  WHERE id=p_session_id AND owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import session not found or not owned' USING ERRCODE='42501';
  END IF;
  PERFORM public.workspace_import_assert_clean(p_session_id,v_owner);
  IF p_file_index IS NULL OR p_file_index NOT BETWEEN 0 AND 7
    OR p_file_index >= v_session.expected_files OR p_title IS NULL
    OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 160
    OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 5242880
    OR p_mime_type NOT IN (
      'application/pdf','image/png','image/jpeg','image/webp',
      'text/plain','text/csv','application/json')
    OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid private import file manifest' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_file FROM public.workspace_import_files
    WHERE session_id=p_session_id AND file_index=p_file_index;
  IF FOUND THEN
    IF v_file.title <> p_title OR v_file.size_bytes <> p_size_bytes
      OR v_file.mime_type <> p_mime_type OR v_file.sha256 <> p_sha256 THEN
      RAISE EXCEPTION 'Previously claimed file has a different manifest' USING ERRCODE='23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'storage_path',v_file.storage_path,'registered',v_file.registered);
  END IF;
  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'Completed imports cannot claim new files' USING ERRCODE='23514';
  END IF;
  IF (SELECT coalesce(sum(row_count),0) FROM public.workspace_import_batches
    WHERE session_id=p_session_id AND phase='tasks') <> v_session.expected_tasks
    OR (SELECT coalesce(sum(row_count),0) FROM public.workspace_import_batches
    WHERE session_id=p_session_id AND phase='items') <> v_session.expected_items THEN
    RAISE EXCEPTION 'Restore tasks and saved items before files' USING ERRCODE='23514';
  END IF;
  v_path := v_owner::text || '/' || v_session.project_id::text || '/' ||
    v_session.id::text || '-import-' || p_file_index::text || '-' ||
    pg_catalog.left(pg_catalog.regexp_replace(
      p_title, '[^A-Za-z0-9._-]', '_', 'g'), 70);
  INSERT INTO public.workspace_import_files(
    session_id,file_index,title,size_bytes,mime_type,sha256,storage_path)
  VALUES(p_session_id,p_file_index,p_title,p_size_bytes,p_mime_type,p_sha256,v_path);
  RETURN pg_catalog.jsonb_build_object(
    'storage_path',v_path,'registered',false);
END;
$workspace_claim_file$;

-- Preserve Phase 9 RPC functionality, adding a server-side drift/hold guard.
CREATE OR REPLACE FUNCTION public.workspace_import_register_file(
  p_session_id uuid,p_file_index integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_register_file$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_file public.workspace_import_files%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions
    WHERE id=p_session_id AND owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import session not found or not owned' USING ERRCODE='42501';
  END IF;
  PERFORM public.workspace_import_assert_clean(p_session_id,v_owner);
  SELECT * INTO v_file FROM public.workspace_import_files
    WHERE session_id=p_session_id AND file_index=p_file_index;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Private import file was not claimed' USING ERRCODE='23514';
  END IF;
  IF v_file.registered THEN RETURN true; END IF;
  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'Cannot register file in completed import' USING ERRCODE='23514';
  END IF;
  -- The existing workspace_verify_file_upload trigger checks actual Storage
  -- metadata size and MIME. A missing file fails without altering the claim.
  INSERT INTO public.workspace_items(
    owner_id,project_id,kind,title,file_size,mime_type,storage_path
  ) VALUES(
    v_owner,v_session.project_id,'file',v_file.title,
    v_file.size_bytes,v_file.mime_type,v_file.storage_path
  );
  UPDATE public.workspace_import_files SET registered=true
    WHERE session_id=p_session_id AND file_index=p_file_index;
  UPDATE public.workspace_import_sessions SET updated_at=now() WHERE id=p_session_id;
  RETURN true;
END;
$workspace_register_file$;

-- Preserve Phase 9 RPC functionality, adding a server-side drift/hold guard.
CREATE OR REPLACE FUNCTION public.workspace_import_finish(p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_import_finish$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_tasks bigint;
  v_steps bigint;
  v_items bigint;
  v_files bigint;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions
    WHERE id=p_session_id AND owner_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import session not found or not owned' USING ERRCODE='42501';
  END IF;
  IF v_session.status='complete' THEN RETURN true; END IF;
  PERFORM public.workspace_import_assert_clean(p_session_id,v_owner);
  SELECT coalesce(sum(row_count),0),coalesce(sum(step_count),0) INTO v_tasks,v_steps
    FROM public.workspace_import_batches WHERE session_id=p_session_id AND phase='tasks';
  SELECT coalesce(sum(row_count),0) INTO v_items
    FROM public.workspace_import_batches WHERE session_id=p_session_id AND phase='items';
  SELECT count(*) INTO v_files FROM public.workspace_import_files
    WHERE session_id=p_session_id AND registered;
  IF v_tasks <> v_session.expected_tasks OR v_steps <> v_session.expected_steps
    OR v_items <> v_session.expected_items OR v_files <> v_session.expected_files THEN
    RAISE EXCEPTION 'Import is incomplete; resume remaining batches and files'
      USING ERRCODE='23514';
  END IF;
  UPDATE public.workspace_import_sessions SET status='complete',updated_at=now()
    WHERE id=p_session_id;
  RETURN true;
END;
$workspace_import_finish$;
