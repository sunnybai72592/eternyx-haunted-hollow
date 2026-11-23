-- Workspace Phase 14: owner-only append-only preparation receipts for
-- reviewed reconciliation archives. This is NOT a server-authenticated
-- signature of archive bytes, nor proof that a download completed.
-- Requires Workspace phases 1-11; migration must be deployed separately.

CREATE TABLE public.workspace_reconciliation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_session_id uuid NOT NULL REFERENCES public.workspace_import_sessions(id) ON DELETE CASCADE,
  source_project_id uuid NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  archive_sha256 text NOT NULL CHECK (archive_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_tasks integer NOT NULL CHECK(source_tasks BETWEEN 0 AND 1000),
  current_tasks integer NOT NULL CHECK(current_tasks BETWEEN 0 AND 1000),
  source_items integer NOT NULL CHECK(source_items BETWEEN 0 AND 1000),
  current_items integer NOT NULL CHECK(current_items BETWEEN 0 AND 1000),
  checklist_steps integer NOT NULL CHECK(checklist_steps BETWEEN 0 AND 30000),
  excluded_files integer NOT NULL CHECK(excluded_files BETWEEN 0 AND 2000),
  event_type text NOT NULL DEFAULT 'archive_prepared'
    CHECK(event_type = 'archive_prepared'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, archive_sha256),
  FOREIGN KEY (source_project_id, owner_id)
    REFERENCES public.workspace_projects(id, owner_id) ON DELETE CASCADE,
  CHECK(source_tasks+current_tasks BETWEEN 0 AND 1000),
  CHECK(source_items+current_items BETWEEN 0 AND 1000),
  CHECK(source_tasks+current_tasks+source_items+current_items > 0),
  CHECK(checklist_steps <= (source_tasks+current_tasks)*30)
);
CREATE INDEX workspace_reconciliation_receipts_recent_idx
  ON public.workspace_reconciliation_receipts(owner_id,created_at DESC,id DESC);

ALTER TABLE public.workspace_reconciliation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_reconciliation_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.workspace_reconciliation_receipts TO authenticated;
CREATE POLICY workspace_reconciliation_receipts_owner_read
  ON public.workspace_reconciliation_receipts FOR SELECT TO authenticated
  USING(owner_id=(SELECT auth.uid()));

-- Server verifies the authenticated import session and its source digest.
-- The browser reports archive/payload/snapshot digests after local parsing:
-- these are CLIENT-ASSERTED metadata, not the server's inspection of bytes.
-- No text, URLs, Storage paths, internal selected task IDs or file bytes
-- are accepted in the receipt. Immutable to browser roles.
CREATE OR REPLACE FUNCTION public.workspace_reconciliation_record(
  p_source_session_id uuid,
  p_source_sha256 text,
  p_snapshot_sha256 text,
  p_archive_sha256 text,
  p_payload_sha256 text,
  p_source_tasks integer,
  p_current_tasks integer,
  p_source_items integer,
  p_current_items integer,
  p_checklist_steps integer,
  p_excluded_files integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $record_review$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_source public.workspace_import_sessions%ROWTYPE;
  v_existing public.workspace_reconciliation_receipts%ROWTYPE;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sign in to prepare private reconciliation history'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_source FROM public.workspace_import_sessions s
    WHERE s.id=p_source_session_id AND s.owner_id=v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original import session not found or not owned'
      USING ERRCODE='42501';
  END IF;
  IF p_source_sha256 IS NULL OR p_source_sha256 <> v_source.source_sha256
    OR p_snapshot_sha256 IS NULL OR p_snapshot_sha256 !~ '^[a-f0-9]{64}$'
    OR p_archive_sha256 IS NULL OR p_archive_sha256 !~ '^[a-f0-9]{64}$'
    OR p_payload_sha256 IS NULL OR p_payload_sha256 !~ '^[a-f0-9]{64}$'
    OR p_source_tasks IS NULL OR p_source_tasks NOT BETWEEN 0 AND 1000
    OR p_current_tasks IS NULL OR p_current_tasks NOT BETWEEN 0 AND 1000
    OR p_source_items IS NULL OR p_source_items NOT BETWEEN 0 AND 1000
    OR p_current_items IS NULL OR p_current_items NOT BETWEEN 0 AND 1000
    OR p_checklist_steps IS NULL OR p_checklist_steps NOT BETWEEN 0 AND 30000
    OR p_excluded_files IS NULL OR p_excluded_files NOT BETWEEN 0 AND 2000
    OR p_source_tasks+p_current_tasks > 1000
    OR p_source_items+p_current_items > 1000
    OR p_source_tasks+p_current_tasks+p_source_items+p_current_items < 1
    OR p_checklist_steps > (p_source_tasks+p_current_tasks)*30 THEN
    RAISE EXCEPTION 'Reconciliation receipt contains invalid or unowned metadata'
      USING ERRCODE='23514';
  END IF;
  -- Serialize same archive hash across tabs and cap journal growth per owner.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text||':'||p_archive_sha256,20261123));
  SELECT * INTO v_existing FROM public.workspace_reconciliation_receipts
    WHERE owner_id=v_owner AND archive_sha256=p_archive_sha256 FOR UPDATE;
  IF FOUND THEN
    IF v_existing.source_session_id<>p_source_session_id
      OR v_existing.source_sha256<>p_source_sha256
      OR v_existing.snapshot_sha256<>p_snapshot_sha256
      OR v_existing.payload_sha256<>p_payload_sha256
      OR v_existing.source_tasks<>p_source_tasks
      OR v_existing.current_tasks<>p_current_tasks
      OR v_existing.source_items<>p_source_items
      OR v_existing.current_items<>p_current_items
      OR v_existing.checklist_steps<>p_checklist_steps
      OR v_existing.excluded_files<>p_excluded_files THEN
      RAISE EXCEPTION 'The same archive fingerprint has conflicting preparation metadata'
        USING ERRCODE='23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'receipt_id',v_existing.id,'project_id',v_existing.source_project_id,
      'reused',true,'event_type',v_existing.event_type);
  END IF;
  IF (SELECT count(*) FROM public.workspace_reconciliation_receipts
      WHERE owner_id=v_owner) >= 1000 THEN
    RAISE EXCEPTION 'Private recovery history is full (1,000 preparation receipts)'
      USING ERRCODE='23514';
  END IF;
  INSERT INTO public.workspace_reconciliation_receipts(
    owner_id,source_session_id,source_project_id,source_sha256,
    snapshot_sha256,archive_sha256,payload_sha256,
    source_tasks,current_tasks,source_items,current_items,
    checklist_steps,excluded_files
  ) VALUES (
    v_owner,p_source_session_id,v_source.project_id,p_source_sha256,
    p_snapshot_sha256,p_archive_sha256,p_payload_sha256,
    p_source_tasks,p_current_tasks,p_source_items,p_current_items,
    p_checklist_steps,p_excluded_files
  ) RETURNING * INTO v_existing;
  RETURN pg_catalog.jsonb_build_object(
    'receipt_id',v_existing.id,'project_id',v_existing.source_project_id,
    'reused',false,'event_type',v_existing.event_type);
END;
$record_review$;

REVOKE ALL ON FUNCTION public.workspace_reconciliation_record(
  uuid,text,text,text,text,integer,integer,integer,integer,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_reconciliation_record(
  uuid,text,text,text,text,integer,integer,integer,integer,integer,integer)
  TO authenticated;
