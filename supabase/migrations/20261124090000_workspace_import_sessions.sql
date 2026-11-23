-- Phase 9: resumable, owner-scoped private Workspace imports.
-- Requires Workspace phases 1,2,5,6,7,8. Review/deploy separately; PR does not apply SQL.
-- A source SHA-256 is an IDEMPOTENCY KEY, not a cryptographic proof of origin.
-- No user-controlled task IDs, item IDs, owner IDs or Storage keys are accepted.

CREATE TABLE public.workspace_import_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL UNIQUE,
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
  source_version integer NOT NULL CHECK(source_version IN (1,2,3)),
  expected_tasks integer NOT NULL CHECK(expected_tasks BETWEEN 0 AND 1000),
  expected_steps integer NOT NULL CHECK(expected_steps BETWEEN 0 AND 30000),
  expected_items integer NOT NULL CHECK(expected_items BETWEEN 0 AND 1000),
  expected_files integer NOT NULL CHECK(expected_files BETWEEN 0 AND 8),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','complete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, source_sha256),
  FOREIGN KEY (project_id, owner_id) REFERENCES public.workspace_projects(id, owner_id) ON DELETE CASCADE
);
CREATE INDEX workspace_import_sessions_owner_recent_idx
  ON public.workspace_import_sessions(owner_id, created_at DESC);
CREATE TABLE public.workspace_import_batches (
  session_id uuid NOT NULL REFERENCES public.workspace_import_sessions(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK(phase IN ('tasks','items')),
  batch_index integer NOT NULL CHECK(batch_index BETWEEN 0 AND 1000),
  payload_md5 text NOT NULL CHECK(payload_md5 ~ '^[0-9a-f]{32}$'),
  row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 25),
  step_count integer NOT NULL DEFAULT 0 CHECK(step_count BETWEEN 0 AND 750),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id, phase, batch_index)
);
CREATE TABLE public.workspace_import_files (
  session_id uuid NOT NULL REFERENCES public.workspace_import_sessions(id) ON DELETE CASCADE,
  file_index integer NOT NULL CHECK(file_index BETWEEN 0 AND 7),
  title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 160),
  size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  mime_type text NOT NULL CHECK(mime_type IN (
    'application/pdf','image/png','image/jpeg','image/webp',
    'text/plain','text/csv','application/json')),
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text NOT NULL UNIQUE,
  registered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,file_index)
);
ALTER TABLE public.workspace_import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_import_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_import_sessions, public.workspace_import_batches,
  public.workspace_import_files FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workspace_import_sessions, public.workspace_import_batches,
  public.workspace_import_files TO authenticated;
CREATE POLICY workspace_import_sessions_owner_read ON public.workspace_import_sessions
  FOR SELECT TO authenticated USING(owner_id = (SELECT auth.uid()));
CREATE POLICY workspace_import_batches_owner_read ON public.workspace_import_batches
  FOR SELECT TO authenticated USING (EXISTS(
    SELECT 1 FROM public.workspace_import_sessions s
    WHERE s.id=session_id AND s.owner_id=(SELECT auth.uid())));
CREATE POLICY workspace_import_files_owner_read ON public.workspace_import_files
  FOR SELECT TO authenticated USING (EXISTS(
    SELECT 1 FROM public.workspace_import_sessions s
    WHERE s.id=session_id AND s.owner_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.workspace_import_begin(
  p_source_sha256 text, p_source_version integer, p_project_name text,
  p_description text, p_expected_tasks integer, p_expected_steps integer,
  p_expected_items integer, p_expected_files integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_import_begin$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_project_id uuid;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sign in to resume a private Workspace import' USING ERRCODE='42501';
  END IF;
  IF p_source_sha256 IS NULL OR p_source_sha256 !~ '^[0-9a-f]{64}$'
    OR p_source_version NOT IN (1,2,3)
    OR p_project_name IS NULL OR char_length(btrim(p_project_name)) NOT BETWEEN 1 AND 120
    OR p_description IS NULL OR char_length(p_description) > 2000
    OR p_expected_tasks IS NULL OR p_expected_tasks NOT BETWEEN 0 AND 1000
    OR p_expected_steps IS NULL OR p_expected_steps NOT BETWEEN 0 AND 30000
    OR p_expected_items IS NULL OR p_expected_items NOT BETWEEN 0 AND 1000
    OR p_expected_files IS NULL OR p_expected_files NOT BETWEEN 0 AND 8
    OR (p_source_version < 3 AND p_expected_steps <> 0)
    OR (p_source_version = 1 AND p_expected_files <> 0) THEN
    RAISE EXCEPTION 'Invalid Workspace import manifest' USING ERRCODE='23514';
  END IF;
  -- Two tabs with same archive cannot create two projects concurrently.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text || ':' || p_source_sha256, 20261129));
  SELECT * INTO v_session FROM public.workspace_import_sessions
  WHERE owner_id=v_owner AND source_sha256=p_source_sha256 FOR UPDATE;
  IF FOUND THEN
    IF v_session.source_version <> p_source_version
      OR v_session.expected_tasks <> p_expected_tasks
      OR v_session.expected_steps <> p_expected_steps
      OR v_session.expected_items <> p_expected_items
      OR v_session.expected_files <> p_expected_files THEN
      RAISE EXCEPTION 'This archive fingerprint already has a different restore manifest'
        USING ERRCODE='23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'session_id',v_session.id,'project_id',v_session.project_id,
      'status',v_session.status,'reused',true);
  END IF;

  INSERT INTO public.workspace_projects(owner_id,name,description)
    VALUES(v_owner,btrim(p_project_name),p_description) RETURNING id INTO v_project_id;
  INSERT INTO public.workspace_import_sessions(
    owner_id, project_id, source_sha256, source_version,
    expected_tasks,expected_steps,expected_items,expected_files
  ) VALUES (
    v_owner,v_project_id,p_source_sha256,p_source_version,
    p_expected_tasks,p_expected_steps,p_expected_items,p_expected_files
  ) RETURNING * INTO v_session;
  RETURN pg_catalog.jsonb_build_object(
    'session_id',v_session.id,'project_id',v_session.project_id,
    'status',v_session.status,'reused',false);
END;
$workspace_import_begin$;
REVOKE ALL ON FUNCTION public.workspace_import_begin(
 text,integer,text,text,integer,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_begin(
 text,integer,text,text,integer,integer,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.workspace_import_status(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $workspace_import_status$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_session public.workspace_import_sessions%ROWTYPE;
  v_tasks bigint;
  v_steps bigint;
  v_items bigint;
  v_files bigint;
BEGIN
  SELECT * INTO v_session FROM public.workspace_import_sessions
  WHERE id=p_session_id AND owner_id=v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import session not found or not owned' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(sum(row_count),0),coalesce(sum(step_count),0) INTO v_tasks,v_steps
    FROM public.workspace_import_batches WHERE session_id=p_session_id AND phase='tasks';
  SELECT coalesce(sum(row_count),0) INTO v_items
    FROM public.workspace_import_batches WHERE session_id=p_session_id AND phase='items';
  SELECT count(*) INTO v_files FROM public.workspace_import_files
    WHERE session_id=p_session_id AND registered;
  RETURN pg_catalog.jsonb_build_object(
    'session_id',v_session.id,'project_id',v_session.project_id,
    'status',v_session.status,'tasks',v_tasks,'steps',v_steps,
    'items',v_items,'files',v_files,
    'expected_tasks',v_session.expected_tasks,'expected_steps',v_session.expected_steps,
    'expected_items',v_session.expected_items,'expected_files',v_session.expected_files);
END;
$workspace_import_status$;
REVOKE ALL ON FUNCTION public.workspace_import_status(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_status(uuid) TO authenticated;

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
REVOKE ALL ON FUNCTION public.workspace_import_apply_batch(uuid,text,integer,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_apply_batch(uuid,text,integer,jsonb)
  TO authenticated;

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
REVOKE ALL ON FUNCTION public.workspace_import_claim_file(
 uuid,integer,text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_claim_file(
 uuid,integer,text,bigint,text,text) TO authenticated;

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
REVOKE ALL ON FUNCTION public.workspace_import_register_file(uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_register_file(uuid,integer)
  TO authenticated;

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
REVOKE ALL ON FUNCTION public.workspace_import_finish(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_import_finish(uuid) TO authenticated;
